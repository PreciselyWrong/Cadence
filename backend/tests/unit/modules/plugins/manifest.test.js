const {
    parseManifest,
    compareVersions,
    grantFor,
    isWithinGrant,
    PLUGIN_API_VERSION,
} = require('../../../../modules/plugins/core/manifest');

const valid = (overrides = {}) => ({
    id: 'hermes',
    name: 'Hermes',
    version: '1.2.3',
    apiVersion: PLUGIN_API_VERSION,
    main: 'index.js',
    permissions: ['events', 'routes'],
    events: ['task.created'],
    ...overrides,
});

describe('plugin manifest', () => {
    it('ignores the retired brief permission with a warning', () => {
        const result = parseManifest(
            valid({ permissions: ['events', 'brief', 'routes'] })
        );
        expect(result.ok).toBe(true);
        expect(result.manifest.permissions).toEqual(['events', 'routes']);
        expect(result.manifest.warnings).toEqual([
            'The "brief" permission is retired and ignored',
        ]);
    });

    it('has no warnings for a current manifest', () => {
        expect(parseManifest(valid()).manifest.warnings).toEqual([]);
    });

    it('accepts a complete manifest and fills defaults', () => {
        const result = parseManifest(
            valid({ permissions: undefined, events: undefined })
        );
        expect(result.ok).toBe(true);
        expect(result.manifest).toMatchObject({
            id: 'hermes',
            version: '1.2.3',
            description: '',
            permissions: [],
            events: [],
            settings: [],
            update: null,
            menu: null,
            actions: [],
        });
    });

    it('reads header buttons of a plugin with a page', () => {
        const result = parseManifest(
            valid({
                menu: { label: 'Hermes' },
                actions: [{ id: 'plan-week', label: 'Plan', places: ['plan'] }],
            })
        );
        expect(result.manifest.actions).toEqual([
            { id: 'plan-week', label: 'Plan', places: ['plan'] },
        ]);
    });

    it('reads a sidebar entry, with ui/index.html as the default page', () => {
        const result = parseManifest(valid({ menu: { label: ' Hermes ' } }));
        expect(result.manifest.menu).toEqual({
            label: 'Hermes',
            page: 'ui/index.html',
        });
    });

    it.each([
        ['id with capitals', { id: 'Hermes' }],
        ['id with a slash', { id: 'a/b' }],
        ['one-letter id', { id: 'a' }],
        ['id over 32 characters', { id: 'a'.repeat(33) }],
        ['missing name', { name: '' }],
        ['version without patch', { version: '1.2' }],
        ['non-integer apiVersion', { apiVersion: '1' }],
        ['absolute main', { main: '/etc/passwd' }],
        ['main that climbs out', { main: '../x.js' }],
        ['unknown permission', { permissions: ['fs'] }],
        ['unknown event', { events: ['task.exploded'] }],
        [
            'events without the events permission',
            { permissions: [], events: ['task.created'] },
        ],
        [
            'duplicate setting key',
            {
                settings: [
                    { key: 'a', type: 'string', label: 'A' },
                    { key: 'a', type: 'string', label: 'B' },
                ],
            },
        ],
        [
            'unknown setting type',
            { settings: [{ key: 'a', type: 'file', label: 'A' }] },
        ],
        [
            'select without options',
            { settings: [{ key: 'a', type: 'select', label: 'A' }] },
        ],
        ['menu without a label', { menu: { label: '' } }],
        ['menu label over 40 characters', { menu: { label: 'x'.repeat(41) } }],
        [
            'menu page that climbs out',
            { menu: { label: 'A', page: '../x.html' } },
        ],
        [
            'header buttons without a page',
            { actions: [{ id: 'a', label: 'A', places: ['plan'] }] },
        ],
        ['update url that is not http(s)', { update: { url: 'file:///x' } }],
    ])('rejects %s', (_label, overrides) => {
        const result = parseManifest(valid(overrides));
        expect(result.ok).toBe(false);
        expect(typeof result.error).toBe('string');
    });

    it('rejects anything that is not an object', () => {
        expect(parseManifest(null).ok).toBe(false);
        expect(parseManifest([]).ok).toBe(false);
        expect(parseManifest('x').ok).toBe(false);
    });

    it('reports a plugin API newer than the server as incompatible', () => {
        const result = parseManifest(
            valid({ apiVersion: PLUGIN_API_VERSION + 1 })
        );
        expect(result).toMatchObject({ ok: false, incompatible: true });
    });

    describe('compareVersions', () => {
        it('compares numerically, not as text', () => {
            expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
            expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
            expect(compareVersions('0.9.9', '1.0.0')).toBe(-1);
        });
    });

    describe('approval', () => {
        const manifest = valid();

        it('grants exactly what the manifest asks for', () => {
            expect(grantFor(manifest)).toEqual({
                permissions: ['events', 'routes'],
                events: ['task.created'],
            });
        });

        it('stays within a grant that covers the request', () => {
            expect(isWithinGrant(manifest, grantFor(manifest))).toBe(true);
            expect(
                isWithinGrant(valid({ events: [] }), grantFor(manifest))
            ).toBe(true);
        });

        it('leaves the grant when a permission or an event is added', () => {
            const grant = grantFor(manifest);
            expect(
                isWithinGrant(
                    valid({ events: ['task.created', 'task.completed'] }),
                    grant
                )
            ).toBe(false);
            expect(
                isWithinGrant(
                    valid({ permissions: ['events'], events: [] }),
                    grantFor(valid({ permissions: [], events: [] }))
                )
            ).toBe(false);
        });

        it('has no grant when none was recorded', () => {
            expect(isWithinGrant(manifest, null)).toBe(false);
        });
    });
});
