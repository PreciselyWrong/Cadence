'use strict';

const {
    slotsOf,
} = require('../../../../modules/auto-classify/core/eligibility');
const {
    decide,
    indexCatalog,
} = require('../../../../modules/auto-classify/core/validate');
const {
    findDuplicate,
    youtubeId,
} = require('../../../../modules/auto-classify/core/duplicates');
const {
    isSummarizable,
    cleanSummary,
} = require('../../../../modules/auto-classify/core/summary');
const {
    buildSchema,
} = require('../../../../modules/auto-classify/core/schema');
const {
    itemFingerprint,
} = require('../../../../modules/auto-classify/core/fingerprint');
const {
    resolveSettings,
    sanitizeUserSettings,
    STATE_TAGS,
} = require('../../../../modules/auto-classify/settings');

const settings = resolveSettings({}, {});

const catalog = {
    areas: [{ uid: 'area-home', name: 'Maison' }],
    projects: [
        { uid: 'p-garden', name: 'Jardin', area_uid: 'area-home' },
        { uid: 'p-car', name: 'Voiture', area_uid: null },
        { uid: 'p-move', name: 'Déménagement', area_uid: 'area-home' },
    ],
    tags: [
        { name: 'achats', uses: 12 },
        { name: 'appel', uses: 3 },
        { name: 'urgent', uses: 40 },
    ],
    excluded: STATE_TAGS,
};
const index = indexCatalog(catalog);

const openTask = (fields = {}) => ({
    entity: 'task',
    uid: 't1',
    name: 'Tailler la haie',
    status: 0,
    tags: [],
    priority: 0,
    ...fields,
});

const entryOf = (item) => ({ item, slots: slotsOf(item) });

const answer = (fields = {}) => ({
    uid: 't1',
    project: { uid: null, confidence: 0, alternatives: [] },
    area: { uid: null, confidence: 0 },
    new_project: { name: null, area_uid: null },
    tags: [],
    new_tag: null,
    estimated_minutes: { value: null, confidence: 0 },
    priority: { value: 0, confidence: 0 },
    summary: null,
    ...fields,
});

describe('eligibility', () => {
    it('leaves closed, recurring, habit, subtask and imported tasks alone', () => {
        for (const fields of [
            { status: 2 },
            { status: 3 },
            { status: 5 },
            { recurring: true },
            { habit_mode: true },
            { parent_task_id: 9 },
            { source_key: 'abc' },
        ]) {
            expect(slotsOf(openTask(fields))).toBeNull();
        }
    });

    it('leaves items of TODO.md, finished, cancelled or archived projects alone', () => {
        for (const project of [
            { file_backed: true, status: 'in_progress' },
            { status: 'done' },
            { status: 'cancelled' },
            { status: 'archived' },
        ]) {
            expect(slotsOf(openTask({ project_id: 1, project }))).toBeNull();
            expect(
                slotsOf({ entity: 'note', uid: 'n', tags: [], project })
            ).toBeNull();
        }
    });

    it('only opens the empty fields', () => {
        expect(
            slotsOf(
                openTask({
                    area_id: 3,
                    tags: ['achats'],
                    estimated_minutes: 30,
                    priority: 2,
                })
            )
        ).toBeNull();
        expect(
            slotsOf(
                openTask({ project_id: 4, project: { status: 'in_progress' } })
            )
        ).toEqual({
            project: false,
            tags: true,
            duration: true,
            priority: true,
            summary: false,
        });
    });

    it('summarizes a link only when its note is empty, never a dropped link', () => {
        const link = { entity: 'link', uid: 'l', tags: ['x'], note: '  ' };
        expect(slotsOf(link).summary).toBe(true);
        expect(slotsOf({ ...link, note: 'mine' })).toBeNull();
        expect(slotsOf({ ...link, status: 'dropped' })).toBeNull();
    });
});

describe('decide', () => {
    it('writes a known project above its threshold', () => {
        const out = decide(
            answer({
                project: { uid: 'p-garden', confidence: 0.9, alternatives: [] },
            }),
            entryOf(openTask()),
            index,
            settings
        );
        expect(out.apply).toEqual({ project_uid: 'p-garden' });
        expect(out.ask).toBeNull();
    });

    it('ignores an unknown project, tag or item uid', () => {
        expect(
            decide(
                answer({
                    project: {
                        uid: 'p-ghost',
                        confidence: 1,
                        alternatives: [],
                    },
                    tags: [{ name: 'invented', confidence: 1 }],
                }),
                entryOf(openTask()),
                index,
                settings
            )
        ).toEqual({ apply: {}, ask: null, confidences: {} });
        expect(
            decide(
                answer({
                    uid: 'other',
                    project: { uid: 'p-car', confidence: 1, alternatives: [] },
                }),
                entryOf(openTask()),
                index,
                settings
            ).apply
        ).toEqual({});
    });

    it('never writes a field that is already filled', () => {
        const out = decide(
            answer({
                project: { uid: 'p-garden', confidence: 1, alternatives: [] },
                tags: [{ name: 'achats', confidence: 1 }],
                estimated_minutes: { value: 30, confidence: 1 },
            }),
            entryOf(
                openTask({
                    project_id: 7,
                    project: { status: 'in_progress' },
                    tags: ['appel'],
                })
            ),
            index,
            settings
        );
        expect(out.apply).toEqual({ estimated_minutes: 30 });
    });

    it('prefers a domain only when no project is in doubt', () => {
        const sureArea = answer({
            project: { uid: null, confidence: 0, alternatives: [] },
            area: { uid: 'area-home', confidence: 0.9 },
        });
        expect(
            decide(sureArea, entryOf(openTask()), index, settings).apply
        ).toEqual({
            area_uid: 'area-home',
        });
        const doubtProject = answer({
            project: {
                uid: 'p-garden',
                confidence: 0.6,
                alternatives: ['p-move', 'p-ghost'],
            },
            area: { uid: 'area-home', confidence: 0.9 },
        });
        const out = decide(doubtProject, entryOf(openTask()), index, settings);
        expect(out.apply).toEqual({});
        expect(out.ask.project).toEqual({
            options: [
                { uid: 'p-garden', confidence: 0.6 },
                { uid: 'p-move', confidence: null },
            ],
            area_uid: 'area-home',
            new_project: null,
        });
    });

    it('drops a project below the ask threshold', () => {
        const out = decide(
            answer({
                project: { uid: 'p-garden', confidence: 0.3, alternatives: [] },
            }),
            entryOf(openTask()),
            index,
            settings
        );
        expect(out.apply).toEqual({});
        expect(out.ask).toBeNull();
    });

    it('offers a new project, never an existing name, and no domain for a note', () => {
        const note = {
            entity: 'note',
            uid: 't1',
            tags: [],
            title: 'Idées vacances',
        };
        const out = decide(
            answer({
                new_project: { name: 'Vacances 2027', area_uid: 'area-home' },
            }),
            entryOf(note),
            index,
            settings
        );
        expect(out.ask.project).toEqual({
            options: [],
            area_uid: null,
            new_project: { name: 'Vacances 2027', area_uid: 'area-home' },
        });
        expect(
            decide(
                answer({ new_project: { name: 'jardin', area_uid: null } }),
                entryOf(note),
                index,
                settings
            ).ask
        ).toBeNull();
    });

    it('writes sure tags, asks doubtful ones, never a state tag', () => {
        const out = decide(
            answer({
                tags: [
                    { name: 'achats', confidence: 0.95 },
                    { name: 'appel', confidence: 0.5 },
                    { name: 'urgent', confidence: 1 },
                ],
                new_tag: 'bricolage',
            }),
            entryOf(openTask()),
            index,
            settings
        );
        expect(out.apply).toEqual({ tags: ['achats'] });
        expect(out.ask.tags).toEqual({
            options: ['appel'],
            new_tag: 'bricolage',
        });
    });

    it('offers a new tag only on a card that already asks something', () => {
        const out = decide(
            answer({ new_tag: 'bricolage' }),
            entryOf(openTask()),
            index,
            settings
        );
        expect(out.ask).toBeNull();
    });

    it('checks the duration bounds and its own threshold', () => {
        const at = (value, confidence) =>
            decide(
                answer({ estimated_minutes: { value, confidence } }),
                entryOf(openTask()),
                index,
                settings
            ).apply.estimated_minutes;
        expect(at(45, 0.6)).toBe(45);
        expect(at(45, 0.59)).toBeUndefined();
        expect(at(4, 1)).toBeUndefined();
        expect(at(721, 1)).toBeUndefined();
    });

    it('only proposes a raise of priority, never writes it', () => {
        const out = decide(
            answer({ priority: { value: 2, confidence: 0.85 } }),
            entryOf(openTask()),
            index,
            settings
        );
        expect(out.apply).toEqual({});
        expect(out.ask).toEqual({ priority: { value: 2, confidence: 0.85 } });
        expect(
            decide(
                answer({ priority: { value: 2, confidence: 0.7 } }),
                entryOf(openTask()),
                index,
                settings
            ).ask
        ).toBeNull();
    });

    it('follows thresholds from the settings', () => {
        const strict = resolveSettings(
            { classify: { thresholds: { project: 0.95 } } },
            {}
        );
        const out = decide(
            answer({
                project: { uid: 'p-car', confidence: 0.9, alternatives: [] },
            }),
            entryOf(openTask()),
            index,
            strict
        );
        expect(out.apply).toEqual({});
        expect(out.ask.project.options).toEqual([
            { uid: 'p-car', confidence: 0.9 },
        ]);
    });

    it('treats a null answer as nothing to do', () => {
        expect(decide(null, entryOf(openTask()), index, settings)).toEqual({
            apply: {},
            ask: null,
            confidences: {},
        });
    });
});

describe('summary', () => {
    const page = {
        url: 'https://example.org/post',
        fetch_status: 'done',
        title: 'A good article',
        description: 'A long enough description of what this page is about.',
    };

    it('needs a read page with text, not an error or sign-in page', () => {
        expect(isSummarizable(page)).toBe(true);
        expect(isSummarizable({ ...page, fetch_status: 'pending' })).toBe(
            false
        );
        expect(isSummarizable({ ...page, fetch_status: 'failed' })).toBe(false);
        expect(isSummarizable({ ...page, description: '' })).toBe(false);
        expect(isSummarizable({ ...page, title: 'Sign in to continue' })).toBe(
            false
        );
        expect(isSummarizable({ ...page, title: '404 Not Found' })).toBe(false);
        expect(
            isSummarizable({ ...page, url: 'https://x.org/login?next=/' })
        ).toBe(false);
    });

    it('keeps whole sentences within the limit', () => {
        expect(cleanSummary('  Un outil.  Très utile. ', 220)).toBe(
            'Un outil. Très utile.'
        );
        expect(
            cleanSummary('Première phrase. Deuxième phrase trop longue', 30)
        ).toBe('Première phrase.');
        expect(cleanSummary('x'.repeat(300), 220)).toBeNull();
    });
});

describe('duplicates', () => {
    const link = (id, url, extra = {}) => ({
        id,
        uid: `l${id}`,
        url,
        created_at: new Date(2026, 10, id),
        status: 'new',
        ...extra,
    });

    it('finds the same page under another address spelling', () => {
        const found = findDuplicate(link(3, 'http://www.example.org/a'), [
            link(1, 'https://example.org/a'),
            link(2, 'https://example.org/b'),
        ]);
        expect(found.original.uid).toBe('l1');
        expect(found.reason).toBe('address');
    });

    it('finds the same repository and the same video', () => {
        expect(
            findDuplicate(link(5, 'https://github.com/Owner/Repo/issues'), [
                link(4, 'https://github.com/owner/repo'),
            ]).reason
        ).toBe('repository');
        expect(
            findDuplicate(link(5, 'https://youtu.be/abc123'), [
                link(4, 'https://www.youtube.com/watch?v=abc123&t=5'),
            ]).reason
        ).toBe('video');
        expect(youtubeId('https://www.youtube.com/shorts/xyz')).toBe('xyz');
    });

    it('finds the same title on the same site, not a short or other-site title', () => {
        const titled = (id, url, title) => link(id, url, { title });
        expect(
            findDuplicate(
                titled(3, 'https://blog.dev/p?id=2', 'How we built it'),
                [titled(1, 'https://blog.dev/p?id=1', 'How We Built It!')]
            ).reason
        ).toBe('title');
        expect(
            findDuplicate(titled(3, 'https://a.dev/2', 'Home'), [
                titled(1, 'https://a.dev/1', 'Home'),
            ])
        ).toBeNull();
        expect(
            findDuplicate(titled(3, 'https://a.dev/2', 'How we built it'), [
                titled(1, 'https://b.dev/1', 'How we built it'),
            ])
        ).toBeNull();
    });

    it('reports the oldest, never a dropped one or itself', () => {
        const found = findDuplicate(link(9, 'https://example.org/a'), [
            link(9, 'https://example.org/a'),
            link(7, 'https://example.org/a', { status: 'dropped' }),
            link(8, 'https://example.org/a#x'),
            link(6, 'https://example.org/a?utm_source=x'),
        ]);
        expect(found.original.uid).toBe('l6');
    });
});

describe('schema', () => {
    it('limits uids and tags to what exists, without state tags', () => {
        const schema = buildSchema(catalog, ['t1']);
        const item = schema.properties.items.items;
        expect(item.properties.uid.enum).toEqual(['t1']);
        expect(item.properties.project.properties.uid.anyOf[0].enum).toEqual([
            'p-garden',
            'p-car',
            'p-move',
        ]);
        expect(
            item.properties.tags.items.properties.name.anyOf[0].enum
        ).toEqual(['achats', 'appel']);
        expect(item.required).toEqual(Object.keys(item.properties));
        expect(item.additionalProperties).toBe(false);
    });

    it('names nothing when the user has no projects', () => {
        const schema = buildSchema({ areas: [], projects: [], tags: [] }, [
            't1',
        ]);
        const item = schema.properties.items.items;
        expect(item.properties.project.properties.uid).toEqual({
            type: 'null',
        });
    });
});

describe('fingerprint', () => {
    it('changes with any edited field or tag, not with tag order', () => {
        const base = openTask({ tags: ['a', 'b'] });
        expect(itemFingerprint(base)).toBe(
            itemFingerprint({ ...base, tags: ['b', 'a'] })
        );
        expect(itemFingerprint(base)).not.toBe(
            itemFingerprint({ ...base, name: 'Autre' })
        );
        expect(itemFingerprint(base)).not.toBe(
            itemFingerprint({ ...base, tags: ['a'] })
        );
    });
});

describe('settings', () => {
    it('reads defaults, then the environment, then the user', () => {
        expect(settings.batch_size).toBe(12);
        expect(settings.grace_seconds).toBe(90);
        expect(settings.excluded_tags).toEqual(STATE_TAGS);
        const env = {
            CADENCE_CLASSIFY_BATCH_SIZE: '6',
            CADENCE_CLASSIFY_THRESHOLD_TAGS: '0.9',
            CADENCE_CLASSIFY_MODEL: 'claude-haiku-5-5',
        };
        const fromEnv = resolveSettings({}, env);
        expect(fromEnv.batch_size).toBe(6);
        expect(fromEnv.thresholds.tags).toBe(0.9);
        expect(fromEnv.model).toBe('claude-haiku-5-5');
        const fromUser = resolveSettings(
            JSON.stringify({ classify: { batch_size: 3, mode: 'dry_run' } }),
            env
        );
        expect(fromUser.batch_size).toBe(3);
        expect(fromUser.mode).toBe('dry_run');
    });

    it('ignores out of bounds values and refuses them from a client', () => {
        expect(
            resolveSettings({ classify: { batch_size: 0 } }, {}).batch_size
        ).toBe(12);
        expect(sanitizeUserSettings({ batch_size: 0 })).toBeNull();
        expect(sanitizeUserSettings({ thresholds: { project: 2 } })).toBeNull();
        expect(sanitizeUserSettings({ thresholds: { nope: 0.5 } })).toBeNull();
        expect(sanitizeUserSettings({ mode: 'dry_run', extra: 1 })).toEqual({
            mode: 'dry_run',
        });
    });

    it('never asks above the write threshold', () => {
        const s = resolveSettings(
            { classify: { thresholds: { project: 0.5, ask: 0.7 } } },
            {}
        );
        expect(s.thresholds.ask).toBe(0.5);
    });
});
