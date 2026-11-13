process.env.TUDUDI_SESSION_SECRET =
    process.env.TUDUDI_SESSION_SECRET || 'plugins-test-session-secret';

jest.mock('../../modules/caldav/services/safe-request', () => {
    const actual = jest.requireActual(
        '../../modules/caldav/services/safe-request'
    );
    return { ...actual, safeRequest: jest.fn() };
});

jest.mock('../../modules/plugins/git', () => ({
    clone: jest.fn(),
    pull: jest.fn(),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const app = require('../../app');
const { Role, Plugin, Notification } = require('../../models');
const { safeRequest } = require('../../modules/caldav/services/safe-request');
const dispatcher = require('../../modules/webhooks/dispatcher');
const registry = require('../../modules/plugins/registry');
const git = require('../../modules/plugins/git');
const { createTestUser } = require('../helpers/testUtils');

const login = async (user) => {
    const agent = request.agent(app);
    await agent
        .post('/api/login')
        .send({ email: user.email, password: 'password123' });
    return agent;
};

const manifestOf = (id, overrides = {}) => ({
    id,
    name: `Plugin ${id}`,
    version: '1.0.0',
    apiVersion: 1,
    main: 'index.js',
    permissions: ['events', 'routes'],
    events: ['task.created'],
    ...overrides,
});

const DEFAULT_CODE = `
module.exports = {
  activate(ctx) {
    ctx.on('task.created', (event) => {
      globalThis.__pluginEvents.push({ id: ctx.id, name: event.name, text: event.text, userId: event.userId });
    });
    ctx.router.get('/ping', (req, res) => res.json({ pong: ctx.id, user: req.currentUser.id }));
    ctx.router.get('/secret', (req, res) => res.json({ secret: ctx.settings.get('secret'), url: ctx.settings.get('url') }));
    ctx.router.post('/remember', (req, res) => {
      ctx.storage.set('last', req.body.value);
      res.json({ stored: ctx.storage.get('last') });
    });
    ctx.router.get('/last', (req, res) => res.json({ last: ctx.storage.get('last') }));
  },
};
`;

describe('Plugins', () => {
    let dir;
    let admin, other, adminAgent, otherAgent;

    const writePlugin = (folder, manifest, code = DEFAULT_CODE) => {
        const target = path.join(dir, folder);
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(
            path.join(target, 'cadence-plugin.json'),
            typeof manifest === 'string' ? manifest : JSON.stringify(manifest)
        );
        if (code !== null) {
            fs.writeFileSync(path.join(target, 'index.js'), code);
        }
    };

    const list = async () => (await adminAgent.get('/api/plugins')).body;
    const find = async (id) =>
        (await list()).plugins.find((plugin) => plugin.id === id);
    const emitTask = async (text = 'Created: Buy milk') => {
        await dispatcher.emit(admin.id, 'task.created', {
            text,
            data: { task: { uid: 'abc' } },
            immediate: false,
        });
        // Handlers run in the background.
        await new Promise((resolve) => setTimeout(resolve, 30));
    };

    beforeEach(async () => {
        const stamp = `${Date.now()}_${Math.random()}`;
        admin = await createTestUser({
            email: `plug_admin_${stamp}@example.com`,
        });
        other = await createTestUser({
            email: `plug_user_${stamp}@example.com`,
        });
        const [role] = await Role.findOrCreate({
            where: { user_id: admin.id },
            defaults: { is_admin: true },
        });
        await role.update({ is_admin: true });
        adminAgent = await login(admin);
        otherAgent = await login(other);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-plugins-'));
        process.env.TUDUDI_PLUGINS_DIR = dir;
        globalThis.__pluginEvents = [];
        safeRequest.mockReset();
        await registry.unloadAll();
        await Plugin.destroy({ where: {} });
        dispatcher.invalidate(admin.id);
    });

    afterEach(async () => {
        await registry.unloadAll();
        delete process.env.TUDUDI_PLUGINS_DIR;
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
    });

    describe('access', () => {
        it('does nothing without a plugins folder', async () => {
            delete process.env.TUDUDI_PLUGINS_DIR;
            const body = await list();
            expect(body).toEqual({ configured: false, plugins: [] });
        });

        it('keeps plugins away from non-admins', async () => {
            expect((await otherAgent.get('/api/plugins')).status).toBe(403);
            expect(
                (
                    await otherAgent
                        .patch('/api/plugins/hello')
                        .send({ enabled: true })
                ).status
            ).toBe(403);
            expect((await request(app).get('/api/plugins')).status).toBe(401);
        });
    });

    describe('discovery', () => {
        it('lists a valid plugin as disabled, with what it asks for', async () => {
            writePlugin('hello', manifestOf('hello'));
            const plugin = await find('hello');
            expect(plugin).toMatchObject({
                id: 'hello',
                name: 'Plugin hello',
                version: '1.0.0',
                state: 'disabled',
                permissions: ['events', 'routes'],
                events: ['task.created'],
            });
            expect(globalThis.__pluginEvents).toEqual([]);
        });

        it('flags a broken manifest, an incompatible API and a missing entry', async () => {
            writePlugin('broken', '{ not json');
            writePlugin('toonew', manifestOf('toonew', { apiVersion: 99 }));
            writePlugin('noentry', manifestOf('noentry'), null);
            const states = Object.fromEntries(
                (await list()).plugins.map((p) => [p.folder, p.state])
            );
            expect(states).toMatchObject({
                broken: 'invalid',
                toonew: 'incompatible',
                noentry: 'disabled',
            });
            const turnOn = await adminAgent
                .patch('/api/plugins/noentry')
                .send({ enabled: true });
            expect(turnOn.status).toBe(400);
        });

        it('ignores a main that climbs out of the folder', async () => {
            writePlugin(
                'sneaky',
                manifestOf('sneaky', { main: '../outside.js' })
            );
            const plugin = (await list()).plugins.find(
                (p) => p.folder === 'sneaky'
            );
            expect(plugin.state).toBe('invalid');
        });

        it('skips a second folder that reuses an id', async () => {
            writePlugin('one', manifestOf('same'));
            writePlugin('two', manifestOf('same'));
            const plugins = (await list()).plugins.filter((p) =>
                ['one', 'two'].includes(p.folder)
            );
            expect(plugins.map((p) => p.state).sort()).toEqual([
                'disabled',
                'invalid',
            ]);
        });
    });

    describe('running', () => {
        it('activates on request and hands it the events it declared', async () => {
            writePlugin('hello', manifestOf('hello'));
            const res = await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            expect(res.status).toBe(200);
            expect(res.body.state).toBe('active');

            await emitTask();
            expect(globalThis.__pluginEvents).toEqual([
                {
                    id: 'hello',
                    name: 'task.created',
                    text: 'Created: Buy milk',
                    userId: admin.id,
                },
            ]);
        });

        it('does not send an event the plugin did not subscribe to', async () => {
            writePlugin('hello', manifestOf('hello'));
            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            await dispatcher.emit(admin.id, 'task.completed', {
                text: 'Completed: x',
                immediate: false,
            });
            await new Promise((resolve) => setTimeout(resolve, 30));
            expect(globalThis.__pluginEvents).toEqual([]);
        });

        it('stops receiving events once turned off', async () => {
            writePlugin('hello', manifestOf('hello'));
            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            const off = await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: false });
            expect(off.body.state).toBe('disabled');
            await emitTask();
            expect(globalThis.__pluginEvents).toEqual([]);
        });

        it('refuses a subscription outside the manifest', async () => {
            writePlugin(
                'greedy',
                manifestOf('greedy'),
                `module.exports = { activate(ctx) { ctx.on('task.deleted', () => {}); } };`
            );
            const res = await adminAgent
                .patch('/api/plugins/greedy')
                .send({ enabled: true });
            expect(res.body.state).toBe('error');
            expect(res.body.last_error).toMatch(/task\.deleted/);
        });

        it('withholds ctx.on and ctx.router without the permission', async () => {
            writePlugin(
                'quiet',
                manifestOf('quiet', { permissions: [], events: [] }),
                `module.exports = { activate(ctx) { globalThis.__quiet = { on: typeof ctx.on, router: typeof ctx.router }; } };`
            );
            await adminAgent
                .patch('/api/plugins/quiet')
                .send({ enabled: true });
            expect(globalThis.__quiet).toEqual({
                on: 'undefined',
                router: 'undefined',
            });
        });

        it('keeps the server up when activate throws', async () => {
            writePlugin(
                'boom',
                manifestOf('boom'),
                `module.exports = { activate() { throw new Error('nope'); } };`
            );
            const res = await adminAgent
                .patch('/api/plugins/boom')
                .send({ enabled: true });
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                state: 'error',
                last_error: 'nope',
            });
            expect((await adminAgent.get('/api/plugins')).status).toBe(200);
        });

        it('keeps the emitter safe from a handler that throws or rejects', async () => {
            writePlugin(
                'noisy',
                manifestOf('noisy'),
                `module.exports = { activate(ctx) {
                    ctx.on('task.created', () => { throw new Error('sync'); });
                    ctx.on('task.created', async () => { throw new Error('async'); });
                } };`
            );
            await adminAgent
                .patch('/api/plugins/noisy')
                .send({ enabled: true });
            await expect(emitTask()).resolves.toBeUndefined();
            const plugin = await find('noisy');
            expect(plugin.state).toBe('active');
            expect(plugin.last_error).toMatch(/async|sync/);
        });

        it('serves the plugin router to any signed-in user, and only while active', async () => {
            writePlugin('hello', manifestOf('hello'));
            expect(
                (await otherAgent.get('/api/plugins/hello/x/ping')).status
            ).toBe(404);

            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            const res = await otherAgent.get('/api/plugins/hello/x/ping');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ pong: 'hello', user: other.id });
            expect(
                (await request(app).get('/api/plugins/hello/x/ping')).status
            ).toBe(401);

            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: false });
            expect(
                (await otherAgent.get('/api/plugins/hello/x/ping')).status
            ).toBe(404);
        });

        it('keeps small JSON state across a reload', async () => {
            writePlugin('hello', manifestOf('hello'));
            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            await adminAgent
                .post('/api/plugins/hello/x/remember')
                .send({ value: { n: 3 } });
            await adminAgent.post('/api/plugins/hello/reload');
            const res = await adminAgent.get('/api/plugins/hello/x/last');
            expect(res.body).toEqual({ last: { n: 3 } });
            const row = await Plugin.findOne({ where: { slug: 'hello' } });
            expect(row.storage).toEqual({ last: { n: 3 } });
        });
    });

    describe('settings', () => {
        const withSettings = () =>
            manifestOf('cfg', {
                settings: [
                    {
                        key: 'url',
                        type: 'string',
                        label: 'URL',
                        required: true,
                    },
                    { key: 'secret', type: 'secret', label: 'Secret' },
                ],
            });

        it('refuses to turn on while a required setting is empty', async () => {
            writePlugin('cfg', withSettings());
            const res = await adminAgent
                .patch('/api/plugins/cfg')
                .send({ enabled: true });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/url/);
        });

        it('stores a secret encrypted, never returns it, and gives it to the plugin', async () => {
            writePlugin(
                'cfg',
                withSettings(),
                `module.exports = { activate(ctx) {
                    ctx.router.get('/secret', (req, res) => res.json({ secret: ctx.settings.get('secret'), url: ctx.settings.get('url') }));
                } };`
            );
            const res = await adminAgent.patch('/api/plugins/cfg').send({
                settings: {
                    url: 'https://hermes.test/hook',
                    secret: 'hunter2',
                },
                enabled: true,
            });
            expect(res.status).toBe(200);
            expect(res.body.state).toBe('active');
            expect(JSON.stringify(res.body)).not.toContain('hunter2');
            const fields = Object.fromEntries(
                res.body.settings.map((f) => [f.key, f])
            );
            expect(fields.url.value).toBe('https://hermes.test/hook');
            expect(fields.secret).toMatchObject({ has_value: true });
            expect(fields.secret.value).toBeUndefined();

            const row = await Plugin.findOne({ where: { slug: 'cfg' } });
            expect(JSON.stringify(row.settings)).not.toContain('hunter2');
            expect(JSON.stringify(row.settings)).toContain('enc:v1:');

            const seen = await adminAgent.get('/api/plugins/cfg/x/secret');
            expect(seen.body).toEqual({
                secret: 'hunter2',
                url: 'https://hermes.test/hook',
            });
        });

        it('applies a saved change without a reload', async () => {
            writePlugin(
                'cfg',
                withSettings(),
                `module.exports = { activate(ctx) {
                    ctx.router.get('/url', (req, res) => res.json({ url: ctx.settings.get('url') }));
                } };`
            );
            await adminAgent
                .patch('/api/plugins/cfg')
                .send({ settings: { url: 'https://a.test' }, enabled: true });
            await adminAgent
                .patch('/api/plugins/cfg')
                .send({ settings: { url: 'https://b.test' } });
            expect(
                (await adminAgent.get('/api/plugins/cfg/x/url')).body.url
            ).toBe('https://b.test');
        });

        it('rejects a value of the wrong type', async () => {
            writePlugin('cfg', withSettings());
            const res = await adminAgent
                .patch('/api/plugins/cfg')
                .send({ settings: { url: 3 } });
            expect(res.status).toBe(400);
        });
    });

    describe('updates', () => {
        it('shows the version change after the folder is replaced and reloaded', async () => {
            writePlugin('hello', manifestOf('hello'));
            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });

            // A new file name: Jest keeps its own module cache, so the cache
            // purge of a same-name reload is checked outside Jest.
            writePlugin(
                'hello',
                manifestOf('hello', { version: '1.1.0', main: 'v2.js' }),
                null
            );
            fs.writeFileSync(
                path.join(dir, 'hello', 'v2.js'),
                `module.exports = { activate(ctx) { ctx.router.get('/ping', (req, res) => res.json({ pong: 'v2' })); } };`
            );
            const res = await adminAgent.post('/api/plugins/reload');
            expect(res.status).toBe(200);
            const plugin = await find('hello');
            expect(plugin).toMatchObject({
                state: 'active',
                version: '1.1.0',
                previous_version: '1.0.0',
            });
            expect(
                (await adminAgent.get('/api/plugins/hello/x/ping')).body
            ).toEqual({ pong: 'v2' });
        });

        it('stops a plugin that now asks for more until it is turned on again', async () => {
            writePlugin('hello', manifestOf('hello'));
            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });

            writePlugin(
                'hello',
                manifestOf('hello', {
                    version: '1.2.0',
                    events: ['task.created', 'task.completed'],
                })
            );
            await adminAgent.post('/api/plugins/reload');
            expect((await find('hello')).state).toBe('needs_approval');
            await emitTask();
            expect(globalThis.__pluginEvents).toEqual([]);

            const again = await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            expect(again.body.state).toBe('active');
            await emitTask();
            expect(globalThis.__pluginEvents).toHaveLength(1);
        });

        it('keeps a plugin that asks for less', async () => {
            writePlugin('hello', manifestOf('hello'));
            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            writePlugin(
                'hello',
                manifestOf('hello', {
                    version: '1.0.1',
                    events: [],
                    main: 'lean.js',
                }),
                null
            );
            fs.writeFileSync(
                path.join(dir, 'hello', 'lean.js'),
                `module.exports = { activate() {} };`
            );
            await adminAgent.post('/api/plugins/reload');
            expect((await find('hello')).state).toBe('active');
        });

        it('turns a plugin whose folder disappeared into missing, keeping its settings', async () => {
            writePlugin('hello', manifestOf('hello'));
            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            fs.rmSync(path.join(dir, 'hello'), { recursive: true });
            await adminAgent.post('/api/plugins/reload');
            expect((await find('hello')).state).toBe('missing');
            expect(await Plugin.count({ where: { slug: 'hello' } })).toBe(1);
        });

        it('comes back after a restart when it was turned on', async () => {
            writePlugin('hello', manifestOf('hello'));
            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            await registry.unloadAll();
            await registry.start();
            expect((await find('hello')).state).toBe('active');
        });

        it('reports the latest version found at update.url, on request only', async () => {
            writePlugin(
                'hello',
                manifestOf('hello', {
                    update: { url: 'https://example.org/p.json' },
                })
            );
            expect(safeRequest).not.toHaveBeenCalled();
            safeRequest.mockResolvedValue({
                status: 200,
                data: { version: '2.0.0' },
            });
            const res = await adminAgent.post(
                '/api/plugins/hello/check-update'
            );
            expect(res.status).toBe(200);
            expect(res.body.update).toMatchObject({
                latest: '2.0.0',
                available: true,
            });
            expect(safeRequest).toHaveBeenCalledTimes(1);
        });

        it('says so when the update address cannot be read', async () => {
            writePlugin(
                'hello',
                manifestOf('hello', {
                    update: { url: 'https://example.org/p.json' },
                })
            );
            safeRequest.mockRejectedValue(new Error('boom'));
            const res = await adminAgent.post(
                '/api/plugins/hello/check-update'
            );
            expect(res.status).toBe(200);
            expect(res.body.update).toMatchObject({
                available: false,
                error: expect.any(String),
            });
        });

        it('refuses to check a plugin that has no update address', async () => {
            writePlugin('hello', manifestOf('hello'));
            const res = await adminAgent.post(
                '/api/plugins/hello/check-update'
            );
            expect(res.status).toBe(400);
        });
    });

    describe('install, pull and remove', () => {
        const fakeClone = (
            manifest,
            code = `module.exports = { activate() {} };`
        ) =>
            git.clone.mockImplementation(async (_url, target) => {
                fs.mkdirSync(path.join(target, '.git'), { recursive: true });
                fs.writeFileSync(
                    path.join(target, 'cadence-plugin.json'),
                    JSON.stringify(manifest)
                );
                fs.writeFileSync(path.join(target, 'index.js'), code);
            });
        const install = (url = 'https://git.example.com/me/hello.git') =>
            adminAgent.post('/api/plugins/install').send({ url });

        it('clones a repository into the plugins folder, turned off', async () => {
            fakeClone(manifestOf('hello', { permissions: [], events: [] }));
            const res = await install();
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ id: 'hello', state: 'disabled' });
            expect(git.clone).toHaveBeenCalledWith(
                'https://git.example.com/me/hello.git',
                path.join(dir, 'hello')
            );
            expect((await find('hello')).state).toBe('disabled');
        });

        it('removes the clone when it holds no valid plugin', async () => {
            git.clone.mockImplementation(async (_url, target) => {
                fs.mkdirSync(target, { recursive: true });
                fs.writeFileSync(path.join(target, 'readme.md'), 'x');
            });
            const res = await install();
            expect(res.status).toBe(400);
            expect(fs.existsSync(path.join(dir, 'hello'))).toBe(false);
        });

        it('removes the clone when its id is already used', async () => {
            writePlugin('first', manifestOf('hello'));
            fakeClone(manifestOf('hello'));
            const res = await install('https://git.example.com/me/second.git');
            expect(res.status).toBe(409);
            expect(fs.existsSync(path.join(dir, 'second'))).toBe(false);
        });

        it('refuses a folder that exists, a bad address and a failed clone', async () => {
            writePlugin('hello', manifestOf('hello'));
            expect((await install()).status).toBe(409);
            expect(git.clone).not.toHaveBeenCalled();
            expect((await install('file:///etc')).status).toBe(400);
            git.clone.mockRejectedValue(new Error('fatal: not found'));
            const res = await install('https://git.example.com/me/other.git');
            expect(res.status).toBe(400);
            expect(fs.existsSync(path.join(dir, 'other'))).toBe(false);
        });

        it('keeps installs for admins only', async () => {
            const res = await otherAgent
                .post('/api/plugins/install')
                .send({ url: 'https://git.example.com/me/hello.git' });
            expect(res.status).toBe(403);
            expect(git.clone).not.toHaveBeenCalled();
        });

        it('pulls a cloned plugin and reloads it', async () => {
            fakeClone(manifestOf('hello', { permissions: [], events: [] }));
            await install();
            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            git.pull.mockImplementation(async (dirPath) => {
                fs.writeFileSync(
                    path.join(dirPath, 'cadence-plugin.json'),
                    JSON.stringify(
                        manifestOf('hello', {
                            version: '1.1.0',
                            permissions: [],
                            events: [],
                        })
                    )
                );
            });
            const res = await adminAgent.post('/api/plugins/hello/pull');
            expect(res.status).toBe(200);
            expect(git.pull).toHaveBeenCalledWith(path.join(dir, 'hello'));
            expect(res.body).toMatchObject({
                state: 'active',
                version: '1.1.0',
                previous_version: '1.0.0',
            });
        });

        it('does not pull a folder that is not a git clone', async () => {
            writePlugin('hello', manifestOf('hello'));
            const res = await adminAgent.post('/api/plugins/hello/pull');
            expect(res.status).toBe(400);
            expect(git.pull).not.toHaveBeenCalled();
        });

        it('removes a plugin: stops it, deletes its folder and its settings', async () => {
            writePlugin('hello', manifestOf('hello'));
            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            const res = await adminAgent.delete('/api/plugins/hello');
            expect(res.status).toBe(200);
            expect(fs.existsSync(path.join(dir, 'hello'))).toBe(false);
            expect(await Plugin.count({ where: { slug: 'hello' } })).toBe(0);
            expect(
                (await otherAgent.get('/api/plugins/hello/x/ping')).status
            ).toBe(404);
            expect(await find('hello')).toBeUndefined();
        });

        it('removes the settings of a plugin whose folder is already gone', async () => {
            writePlugin('hello', manifestOf('hello'));
            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            fs.rmSync(path.join(dir, 'hello'), { recursive: true });
            const res = await adminAgent.delete('/api/plugins/hello');
            expect(res.status).toBe(200);
            expect(await Plugin.count({ where: { slug: 'hello' } })).toBe(0);
        });
    });

    describe('sidebar entry and page', () => {
        const withMenu = (extra = {}) =>
            manifestOf('hello', {
                menu: { label: 'Hermes' },
                ...extra,
            });
        const writeUi = () => {
            fs.mkdirSync(path.join(dir, 'hello', 'ui'), { recursive: true });
            fs.writeFileSync(
                path.join(dir, 'hello', 'ui', 'index.html'),
                '<h1>Hermes page</h1>'
            );
            fs.writeFileSync(path.join(dir, 'secret.txt'), 'outside');
        };

        it('lists the entry of active plugins to any signed-in user', async () => {
            writePlugin('hello', withMenu());
            writeUi();
            expect((await otherAgent.get('/api/plugins/menu')).body).toEqual({
                items: [],
            });
            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            const res = await otherAgent.get('/api/plugins/menu');
            expect(res.body.items).toEqual([
                {
                    id: 'hello',
                    label: 'Hermes',
                    path: '/plugins/hello',
                    file: 'index.html',
                },
            ]);
            expect((await request(app).get('/api/plugins/menu')).status).toBe(
                401
            );
        });

        it('serves the page files of an active plugin only', async () => {
            writePlugin('hello', withMenu());
            writeUi();
            expect(
                (await otherAgent.get('/api/plugins/hello/ui/index.html'))
                    .status
            ).toBe(404);
            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            const page = await otherAgent.get(
                '/api/plugins/hello/ui/index.html'
            );
            expect(page.status).toBe(200);
            expect(page.text).toContain('Hermes page');
            expect(page.headers['x-content-type-options']).toBe('nosniff');
            expect(page.headers['content-security-policy']).toContain(
                "frame-src 'none'"
            );
        });

        it('does not serve files outside the page folder', async () => {
            writePlugin('hello', withMenu());
            writeUi();
            await adminAgent
                .patch('/api/plugins/hello')
                .send({ enabled: true });
            for (const url of [
                '/api/plugins/hello/ui/..%2Fsecret.txt',
                '/api/plugins/hello/ui/../../secret.txt',
                '/api/plugins/hello/ui/../index.js',
            ]) {
                // eslint-disable-next-line no-await-in-loop
                const res = await otherAgent.get(url);
                expect(res.status).not.toBe(200);
            }
        });

        it('shows the entry in the plugin list', async () => {
            writePlugin('hello', withMenu());
            expect((await find('hello')).menu).toMatchObject({
                label: 'Hermes',
            });
        });
    });

    describe('retired brief permission', () => {
        it('still turns on a plugin that asks for it, without ctx.brief', async () => {
            writePlugin(
                'scribe',
                manifestOf('scribe', { permissions: ['brief'], events: [] }),
                `module.exports = { activate(ctx) {
                    globalThis.__hasBrief = typeof ctx.brief;
                } };`
            );
            const res = await adminAgent
                .patch('/api/plugins/scribe')
                .send({ enabled: true });
            expect(res.status).toBe(200);
            expect(globalThis.__hasBrief).toBe('undefined');
            expect((await find('scribe')).permissions).toEqual([]);
        });
    });

    describe('notifications', () => {
        const notifier = (permissions) =>
            writePlugin(
                'herald',
                manifestOf('herald', { permissions, events: [] }),
                `module.exports = { activate(ctx) {
                    globalThis.__hasNotify = typeof ctx.notify;
                    if (!ctx.notify) return;
                    ctx.router.post('/ping', async (req, res) => {
                        try {
                            const n = await ctx.notify({
                                userId: req.currentUser.id,
                                title: req.body.title,
                                message: req.body.message,
                                data: req.body.data,
                                sources: req.body.sources,
                            });
                            res.json({ uid: n.uid });
                        } catch (error) {
                            res.status(400).json({ error: error.message });
                        }
                    });
                } };`
            );

        it('withholds ctx.notify without the permission', async () => {
            notifier(['routes']);
            await adminAgent
                .patch('/api/plugins/herald')
                .send({ enabled: true });
            expect(globalThis.__hasNotify).toBe('undefined');
        });

        it('creates a notification for the desktop and the phone, tagged with the plugin', async () => {
            notifier(['routes', 'notify']);
            await adminAgent
                .patch('/api/plugins/herald')
                .send({ enabled: true });
            expect(globalThis.__hasNotify).toBe('function');
            const res = await adminAgent
                .post('/api/plugins/herald/x/ping')
                .send({
                    title: 'Résumé du week-end',
                    message: 'Prêt',
                    data: { openPath: '/p/herald?agent=weekend' },
                });
            expect(res.status).toBe(200);
            const row = await Notification.findOne({
                where: { uid: res.body.uid },
            });
            expect(row).toMatchObject({
                user_id: admin.id,
                type: 'system',
                title: 'Résumé du week-end',
                message: 'Prêt',
                sources: ['desktop', 'mobile'],
            });
            expect(row.data).toMatchObject({
                pluginId: 'herald',
                openPath: '/p/herald?agent=weekend',
            });
        });

        it('marks read only its own notifications', async () => {
            writePlugin(
                'herald',
                manifestOf('herald', {
                    permissions: ['routes', 'notify'],
                    events: [],
                }),
                `module.exports = { activate(ctx) {
                    ctx.router.post('/ping', async (req, res) => {
                        const n = await ctx.notify({ userId: req.currentUser.id, title: 'T' });
                        res.json({ uid: n.uid });
                    });
                    ctx.router.post('/read', async (req, res) => {
                        res.json({ read: await ctx.notify.read({ userId: req.currentUser.id, uid: req.body.uid }) });
                    });
                } };`
            );
            await adminAgent
                .patch('/api/plugins/herald')
                .send({ enabled: true });
            const { uid } = (
                await adminAgent.post('/api/plugins/herald/x/ping').send({})
            ).body;
            const foreign = await Notification.createNotification({
                userId: admin.id,
                type: 'system',
                title: 'Not the plugin',
                data: { pluginId: 'other' },
            });
            const read = (body) =>
                adminAgent.post('/api/plugins/herald/x/read').send(body);
            expect((await read({ uid: foreign.uid })).body.read).toBe(false);
            expect((await read({ uid })).body.read).toBe(true);
            const row = await Notification.findOne({ where: { uid } });
            expect(row.read_at).not.toBeNull();
            const other = await Notification.findOne({
                where: { uid: foreign.uid },
            });
            expect(other.read_at).toBeNull();
        });

        it('refuses a missing title, unknown channels and an openPath outside the app', async () => {
            notifier(['routes', 'notify']);
            await adminAgent
                .patch('/api/plugins/herald')
                .send({ enabled: true });
            const post = (body) =>
                adminAgent.post('/api/plugins/herald/x/ping').send(body);
            expect((await post({ message: 'x' })).status).toBe(400);
            expect(
                (await post({ title: 't', sources: ['email'] })).status
            ).toBe(400);
            expect(
                (
                    await post({
                        title: 't',
                        data: { openPath: 'https://evil.example/x' },
                    })
                ).status
            ).toBe(400);
        });
    });

    describe('page sdk', () => {
        it('serves the client script to signed-in users only', async () => {
            const res = await otherAgent.get('/api/plugins/sdk.js');
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toMatch(/javascript/);
            expect(res.text).toContain('window.cadence');
            expect((await request(app).get('/api/plugins/sdk.js')).status).toBe(
                401
            );
        });

        it('is valid JavaScript and exposes fetch, json and open', () => {
            // eslint-disable-next-line no-new-func
            const run = new Function(
                'window',
                'fetch',
                require('../../modules/plugins/sdk')
            );
            const fakeWindow = {
                location: { origin: 'https://cadence.test' },
                parent: { postMessage: jest.fn() },
            };
            run(fakeWindow, jest.fn());
            expect(Object.keys(fakeWindow.cadence).sort()).toEqual([
                'android',
                'fetch',
                'json',
                'open',
            ]);
            expect(fakeWindow.cadence.open('task', 'abc')).toBe(true);
            expect(fakeWindow.parent.postMessage).toHaveBeenCalledWith(
                { cadence: 'open', target: 'task', ref: 'abc' },
                'https://cadence.test'
            );
            expect(fakeWindow.cadence.open('url', 'javascript:alert(1)')).toBe(
                false
            );
            expect(fakeWindow.cadence.open('secret', 'x')).toBe(false);
        });

        it('sends the CSRF token on writes and the bearer token through the Android bridge', async () => {
            const calls = [];
            const fetchMock = jest.fn(async (u, init) => {
                calls.push([u, init]);
                return {
                    ok: true,
                    text: async () => JSON.stringify({ csrfToken: 'tok' }),
                    json: async () => ({ csrfToken: 'tok' }),
                    status: 200,
                };
            });
            // eslint-disable-next-line no-new-func
            const run = new Function(
                'window',
                'fetch',
                require('../../modules/plugins/sdk')
            );
            const web = {
                location: { origin: 'x' },
                parent: { postMessage() {} },
            };
            run(web, fetchMock);
            await web.cadence.fetch('tasks', {
                method: 'POST',
                body: { a: 1 },
            });
            const write = calls.find(([u]) => u === '/api/tasks')[1];
            expect(write.headers['x-csrf-token']).toBe('tok');
            expect(write.body).toBe('{"a":1}');

            calls.length = 0;
            const droid = {
                location: { origin: 'x' },
                parent: {},
                CadenceBridge: { token: () => 'tt_abc', open: jest.fn() },
            };
            run(droid, fetchMock);
            await droid.cadence.fetch('/api/tasks', {
                method: 'POST',
                body: {},
            });
            expect(calls).toHaveLength(1);
            expect(calls[0][0]).toBe('/api/tasks');
            expect(calls[0][1].headers.Authorization).toBe('Bearer tt_abc');
            droid.cadence.open('note', 'n1');
            expect(droid.CadenceBridge.open).toHaveBeenCalledWith('note', 'n1');
        });
    });
});
