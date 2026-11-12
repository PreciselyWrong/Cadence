const request = require('supertest');
const app = require('../../app');
const { Link, Project } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const jobs = require('../../modules/links/jobs');
const pageCheck = require('../../modules/links/check');

const hlc = (ms, counter = 0, node = 'devA') =>
    `${String(ms).padStart(13, '0')}-${String(counter).padStart(4, '0')}-${node}`;

const upsert = (opId, uid, fields, clock = hlc(Date.now())) => ({
    op_id: opId,
    entity: 'link',
    uid,
    action: 'upsert',
    fields: Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, { value: v, hlc: clock }])
    ),
});

// A project's pages: the material it gathers (docs/37-links.md, Project pages).
describe('Project pages', () => {
    let agent;
    let user;
    let project;
    let fetched;

    const signIn = async (email) => {
        const created = await createTestUser({ email });
        const session = request.agent(app);
        await session
            .post('/api/login')
            .send({ email, password: 'password123' });
        return { user: created, agent: session };
    };

    beforeEach(async () => {
        fetched = [];
        jobs.configure({
            enabled: true,
            spacingMs: 0,
            fetcher: async (url) => {
                fetched.push(url);
                return { title: `Read ${url}`, kind: 'article' };
            },
        });
        ({ user, agent } = await signIn('pages@example.com'));
        project = await Project.create({ name: 'Fusée', user_id: user.id });
    });

    afterEach(async () => {
        await jobs.drain();
        jobs.configure({ enabled: false, fetcher: null });
        pageCheck.configure({ probe: null });
    });

    const pagesOf = (p = project) => agent.get(`/api/projects/${p.uid}/pages`);
    const addPage = (body, p = project) =>
        agent.post(`/api/projects/${p.uid}/pages`).send(body);

    it('adds a page once per address and project, then reads it', async () => {
        const first = await addPage({
            url: 'https://Example.com/a/?utm_source=x',
            title: 'Page A',
            note: 'for the engine',
        });
        expect(first.status).toBe(201);
        expect(first.body).toMatchObject({
            created: true,
            page: {
                url: 'https://example.com/a',
                title: 'Page A',
                note: 'for the engine',
                project_uid: project.uid,
            },
        });
        const again = await addPage({ url: 'https://example.com/a' });
        expect(again.status).toBe(200);
        expect(again.body.created).toBe(false);
        expect(again.body.page.uid).toBe(first.body.page.uid);

        const other = await Project.create({ name: 'Other', user_id: user.id });
        const elsewhere = await addPage(
            { url: 'https://example.com/a' },
            other
        );
        expect(elsewhere.body.created).toBe(true);

        await jobs.drain();
        expect(fetched).toEqual([
            'https://example.com/a',
            'https://example.com/a',
        ]);
        const list = await pagesOf();
        expect(list.body.pages.map((p) => p.url)).toEqual([
            'https://example.com/a',
        ]);
        expect(list.body.pages[0].title).toBe('Page A');
    });

    it('takes a whole tab group at once', async () => {
        await addPage({ url: 'https://example.com/1' });
        const res = await addPage({
            pages: [
                { url: 'https://example.com/1', title: 'One' },
                { url: 'https://example.com/2', title: 'Two' },
                { url: 'about:blank' },
            ],
        });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ created: 1, existing: 1, invalid: 1 });
        expect((await pagesOf()).body.pages).toHaveLength(2);
    });

    it('renames, notes and removes a page', async () => {
        const { page } = (await addPage({ url: 'https://example.com/x' })).body;
        const edited = await agent
            .patch(`/api/links/${page.uid}`)
            .send({ title: 'Renamed', note: 'short note' });
        expect(edited.body.link).toMatchObject({
            title: 'Renamed',
            note: 'short note',
        });
        expect((await agent.delete(`/api/links/${page.uid}`)).status).toBe(200);
        expect((await pagesOf()).body.pages).toEqual([]);
    });

    it("refuses the pages of someone else's project", async () => {
        const other = await createTestUser({
            email: 'pages-other@example.com',
        });
        const theirs = await Project.create({
            name: 'Theirs',
            user_id: other.id,
        });
        expect(
            (await addPage({ url: 'https://example.com/a' }, theirs)).status
        ).toBe(403);
        expect((await pagesOf(theirs)).status).toBe(403);
    });

    it('checks the pages: 404, 410 and unreachable are dead, 401 and 403 never, nothing deleted', async () => {
        const answers = {
            'https://example.com/gone': { code: 404 },
            'https://example.com/removed': { code: 410 },
            'https://example.com/private': { code: 403 },
            'https://example.com/login': { code: 401 },
            'https://example.com/fine': { code: 200 },
            'https://nowhere.example/x': { error: 'unreachable' },
            'https://slow.example/x': { error: 'timeout' },
        };
        pageCheck.configure({ probe: async (url) => answers[url] });
        await addPage({ pages: Object.keys(answers).map((url) => ({ url })) });

        const res = await agent.post(
            `/api/projects/${project.uid}/pages/check`
        );
        expect(res.status).toBe(200);
        const byUrl = Object.fromEntries(
            res.body.results.map((r) => [r.url, r.state])
        );
        expect(byUrl).toEqual({
            'https://example.com/gone': 'dead',
            'https://example.com/removed': 'dead',
            'https://example.com/private': 'ok',
            'https://example.com/login': 'ok',
            'https://example.com/fine': 'ok',
            'https://nowhere.example/x': 'dead',
            'https://slow.example/x': 'unknown',
        });
        expect(await Link.count()).toBe(7);
    });

    describe('offline sync', () => {
        it('lets a device add a page to a project, and reads it', async () => {
            const res = await agent.post('/api/v1/sync/push').send({
                device_id: 'devA',
                ops: [
                    upsert('o1', '7d1f2c3a-1b2c-4d5e-8f90-a1b2c3d4e5f6', {
                        url: 'https://example.com/from-phone/',
                        title: 'From the phone',
                        project_uid: project.uid,
                    }),
                ],
            });
            expect(res.body.results[0].status).toBe('applied');
            const page = await Link.findOne({
                where: { uid: '7d1f2c3a-1b2c-4d5e-8f90-a1b2c3d4e5f6' },
            });
            expect(page.url).toBe('https://example.com/from-phone');
            expect(page.project_id).toBe(project.id);
            await jobs.drain();
            expect(fetched).toContain('https://example.com/from-phone');
        });

        it('refuses a page without a project, or a new address on an existing page', async () => {
            const res = await agent.post('/api/v1/sync/push').send({
                device_id: 'devA',
                ops: [
                    upsert('o1', '7d1f2c3a-1b2c-4d5e-8f90-a1b2c3d4e5f7', {
                        url: 'https://example.com/b',
                    }),
                ],
            });
            expect(res.body.results[0]).toMatchObject({
                status: 'rejected',
                reason: 'project_required',
            });

            const { page } = (await addPage({ url: 'https://example.com/c' }))
                .body;
            const moved = await agent.post('/api/v1/sync/push').send({
                device_id: 'devA',
                ops: [upsert('o2', page.uid, { url: 'https://example.com/d' })],
            });
            expect(moved.body.results[0]).toMatchObject({
                status: 'rejected',
                reason: 'url_readonly',
            });
        });
    });

    it('says the address is already in the project', async () => {
        await addPage({ url: 'https://example.com/known' });
        const res = await agent
            .get('/api/links/lookup')
            .query({ url: 'https://www.example.com/known' });
        expect(res.body.projects).toEqual([
            { uid: project.uid, name: 'Fusée' },
        ]);
    });
});
