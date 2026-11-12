// Pure rules of the offline service worker (public/offline-core.js):
// which answers mean the server is unreachable, what a write is, and how
// pending writes are laid over cached answers.
import fs from 'fs';
import path from 'path';

// Read as plain source, as the worker loads it, rather than through Babel.
const loadCore = () => {
    const module = { exports: {} as any };
    new Function(
        'module',
        fs.readFileSync(
            path.join(__dirname, '../../public/offline-core.js'),
            'utf8'
        )
    )(module);
    return module.exports;
};
const core = loadCore();

const ORIGIN = 'https://cadence.example';

const update = (entity: string, uid: string, body: object) => ({
    op: { kind: 'update', entity, uid },
    body,
});
const remove = (entity: string, uid: string) => ({
    op: { kind: 'delete', entity, uid },
    body: null,
});
const create = (entity: string, synth: Record<string, unknown>) => ({
    op: { kind: 'create', entity, uid: synth.uid, tempId: synth.id },
    body: synth,
    synth,
});

describe('isUnreachableStatus', () => {
    it('treats proxy errors as an unreachable server', () => {
        [502, 504, 520, 521, 522, 523, 524, 530].forEach((status) =>
            expect(core.isUnreachableStatus(status)).toBe(true)
        );
    });

    it('treats the app own answers as reached, 503 included', () => {
        [200, 201, 400, 401, 403, 404, 409, 412, 500, 503].forEach((status) =>
            expect(core.isUnreachableStatus(status)).toBe(false)
        );
    });
});

describe('describeMutation', () => {
    const d = (method: string, path: string) =>
        core.describeMutation(method, `${ORIGIN}${path}`);

    it('names creates, updates and deletes of synced entities', () => {
        expect(d('POST', '/api/task')).toEqual({
            kind: 'create',
            entity: 'task',
        });
        expect(d('PATCH', '/api/task/abc123def456ghj')).toEqual({
            kind: 'update',
            entity: 'task',
            uid: 'abc123def456ghj',
        });
        expect(d('DELETE', '/api/note/n1')).toEqual({
            kind: 'delete',
            entity: 'note',
            uid: 'n1',
        });
        expect(d('POST', '/api/inbox')).toEqual({
            kind: 'create',
            entity: 'inbox_item',
        });
        expect(d('PATCH', '/api/areas/a1')).toMatchObject({
            kind: 'update',
            entity: 'area',
        });
        expect(d('PATCH', '/api/goals/g1')).toMatchObject({
            kind: 'update',
            entity: 'goal',
        });
        expect(d('PATCH', '/api/links/l1')).toMatchObject({
            kind: 'update',
            entity: 'link',
        });
    });

    it('works under a base path and the versioned prefix', () => {
        expect(
            core.describeMutation('PATCH', `${ORIGIN}/cadence/api/project/p1`)
        ).toMatchObject({ kind: 'update', entity: 'project', uid: 'p1' });
        expect(d('POST', '/api/v1/task')).toMatchObject({
            kind: 'create',
            entity: 'task',
        });
    });

    it('calls anything else other', () => {
        expect(d('POST', '/api/task/t1/skip-occurrence')).toEqual({
            kind: 'other',
        });
        expect(d('PATCH', '/api/inbox/i1/process')).toEqual({
            kind: 'other',
        });
        expect(d('PUT', '/api/projects/order')).toEqual({ kind: 'other' });
        expect(d('PATCH', '/api/daily-plan/2026-11-12')).toEqual({
            kind: 'other',
        });
    });
});

describe('applyOverlay', () => {
    it('merges an update into every object with that uid', () => {
        const cached = {
            tasks: [
                { id: 1, uid: 't1', name: 'Old', priority: 0 },
                { id: 2, uid: 't2', name: 'Other' },
            ],
            tasks_today_plan: [{ id: 1, uid: 't1', name: 'Old' }],
        };
        const out = core.applyOverlay(
            cached,
            `${ORIGIN}/api/tasks?type=today`,
            [
                update('task', 't1', {
                    name: 'New',
                    priority: 2,
                    uid: 'x',
                    id: 9,
                }),
            ]
        );
        expect(out.tasks[0]).toEqual({
            id: 1,
            uid: 't1',
            name: 'New',
            priority: 2,
        });
        expect(out.tasks_today_plan[0].name).toBe('New');
        expect(out.tasks[1].name).toBe('Other');
        expect(cached.tasks[0].name).toBe('Old');
    });

    it('reads an update body kept as text', () => {
        const out = core.applyOverlay(
            { uid: 't1', name: 'Old' },
            `${ORIGIN}/api/task/t1`,
            [
                {
                    op: { kind: 'update', entity: 'task', uid: 't1' },
                    body: '{"name":"New"}',
                },
            ]
        );
        expect(out.name).toBe('New');
    });

    it('removes a deleted uid from every list', () => {
        const out = core.applyOverlay(
            {
                tasks: [
                    { uid: 't1' },
                    { uid: 't2', subtasks: [{ uid: 't1' }] },
                ],
            },
            `${ORIGIN}/api/tasks`,
            [remove('task', 't1')]
        );
        expect(out.tasks).toEqual([{ uid: 't2', subtasks: [] }]);
    });

    it('answers a detail of a deleted row with null', () => {
        expect(
            core.applyOverlay(
                { uid: 't1', name: 'x' },
                `${ORIGIN}/api/task/t1`,
                [remove('task', 't1')]
            )
        ).toBeNull();
    });

    it('adds a create to the collection lists of its entity once', () => {
        const note = { id: -5, uid: 'n9', title: 'Offline note' };
        const entries = [create('note', note)];
        expect(
            core.applyOverlay([{ uid: 'n1' }], `${ORIGIN}/api/notes`, entries)
        ).toEqual([note, { uid: 'n1' }]);
        expect(
            core.applyOverlay([note], `${ORIGIN}/api/notes`, entries)
        ).toEqual([note]);

        const item = { id: -6, uid: 'i9', content: 'Idea' };
        expect(
            core.applyOverlay(
                { items: [{ uid: 'i1' }], pagination: { total: 1 } },
                `${ORIGIN}/api/inbox?limit=20`,
                [create('inbox_item', item)]
            ).items
        ).toEqual([item, { uid: 'i1' }]);
    });

    it('adds a task only to the lists whose filter it matches', () => {
        const task = { id: -7, uid: 't9', name: 'New', project_id: 4 };
        const entries = [create('task', task)];
        expect(
            core.applyOverlay(
                { tasks: [] },
                `${ORIGIN}/api/tasks?project_id=4`,
                entries
            ).tasks
        ).toEqual([task]);
        expect(
            core.applyOverlay(
                { tasks: [] },
                `${ORIGIN}/api/tasks?project_id=5`,
                entries
            ).tasks
        ).toEqual([]);
        expect(
            core.applyOverlay(
                { tasks: [] },
                `${ORIGIN}/api/tasks?type=today`,
                entries
            ).tasks
        ).toEqual([]);
        expect(
            core.applyOverlay(
                { id: 4, uid: 'p4', name: 'Home', tasks: [] },
                `${ORIGIN}/api/project/p4`,
                entries
            ).tasks
        ).toEqual([task]);
    });

    it('applies later updates on top of an offline create', () => {
        const task = { id: -7, uid: 't9', name: 'New', project_id: 4 };
        const out = core.applyOverlay(
            { tasks: [] },
            `${ORIGIN}/api/tasks?project_id=4`,
            [create('task', task), update('task', 't9', { name: 'Renamed' })]
        );
        expect(out.tasks[0].name).toBe('Renamed');
    });
});

describe('synthesizeCreate', () => {
    it('keeps the body and adds identity and timestamps', () => {
        const out = core.synthesizeCreate(
            'task',
            { name: 'Call Paul', tags: [{ name: 'home' }] },
            { uid: 'u1', tempId: -3, now: '2026-11-12T10:00:00.000Z' }
        );
        expect(out).toMatchObject({
            name: 'Call Paul',
            tags: [{ name: 'home' }],
            uid: 'u1',
            id: -3,
            status: 0,
            created_at: '2026-11-12T10:00:00.000Z',
            updated_at: '2026-11-12T10:00:00.000Z',
        });
    });

    it('keeps a status the body sets', () => {
        expect(
            core.synthesizeCreate(
                'task',
                { name: 'x', status: 2 },
                {
                    uid: 'u1',
                    tempId: -3,
                    now: 'now',
                }
            ).status
        ).toBe(2);
    });
});

describe('rewriteTempIds', () => {
    it('swaps temporary ids for the real ones in the body and the url', () => {
        const entry = {
            url: `${ORIGIN}/api/task/-12/subtasks`,
            body: JSON.stringify({
                project_id: -12,
                parent_task_id: -13,
                priority: -12,
                name: 'x',
            }),
        };
        const out = core.rewriteTempIds(entry, { '-12': 40, '-13': 41 });
        expect(out.url).toBe(`${ORIGIN}/api/task/40/subtasks`);
        expect(JSON.parse(out.body)).toEqual({
            project_id: 40,
            parent_task_id: 41,
            priority: -12,
            name: 'x',
        });
    });

    it('swaps a uid the server replaced in the url and uid fields', () => {
        const entry = {
            url: `${ORIGIN}/api/task/clientuid000001`,
            body: JSON.stringify({
                parent_task_uid: 'clientuid000001',
                name: 'clientuid000001',
            }),
        };
        const out = core.rewriteTempIds(entry, {
            clientuid000001: 'serveruid000001',
        });
        expect(out.url).toBe(`${ORIGIN}/api/task/serveruid000001`);
        expect(JSON.parse(out.body)).toEqual({
            parent_task_uid: 'serveruid000001',
            name: 'clientuid000001',
        });
    });

    it('leaves an entry without temporary ids as it is', () => {
        const entry = { url: `${ORIGIN}/api/task/abc`, body: 'not json' };
        expect(core.rewriteTempIds(entry, { '-1': 2 })).toBe(entry);
    });
});

describe('findByUid', () => {
    it('returns the fullest copy of a row found in cached answers', () => {
        const found = core.findByUid(
            [
                { tasks: [{ uid: 't1', name: 'a' }] },
                [{ uid: 't1', name: 'a', note: 'n', project_id: 3 }],
                { uid: 'other' },
            ],
            't1'
        );
        expect(found).toEqual({
            uid: 't1',
            name: 'a',
            note: 'n',
            project_id: 3,
        });
        expect(core.findByUid([{ tasks: [] }], 't1')).toBeNull();
    });
});

describe('ids and clocks', () => {
    it('makes uids in the server format', () => {
        const uid = core.newUid();
        expect(uid).toMatch(/^[0-9abcdefghijkmnpqrstuvwxyz]{15}$/);
        expect(core.newUid()).not.toBe(uid);
    });

    it('formats hybrid logical clocks that sort as strings', () => {
        expect(core.formatClock(1761750000000, 3, 'web-ab12')).toBe(
            '1761750000000-0003-web-ab12'
        );
        expect(
            core.formatClock(1761750000000, 10, 'web') >
                core.formatClock(1761750000000, 9, 'web')
        ).toBe(true);
    });

    it('reads the detail uid of a GET path', () => {
        expect(core.detailUid(`${ORIGIN}/api/task/t1`)).toBe('t1');
        expect(core.detailUid(`${ORIGIN}/api/note/n1?x=1`)).toBe('n1');
        expect(core.detailUid(`${ORIGIN}/api/project/p1`)).toBe('p1');
        expect(core.detailUid(`${ORIGIN}/api/tasks`)).toBeNull();
        expect(core.detailUid(`${ORIGIN}/api/task/t1/comments`)).toBeNull();
    });
});
