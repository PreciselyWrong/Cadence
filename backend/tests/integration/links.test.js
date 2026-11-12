const request = require('supertest');
const app = require('../../app');
const { Link, Project } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const jobs = require('../../modules/links/jobs');

// A link is a page of a project (docs/37-links.md): reading its metadata,
// reading it again, editing and removing it.
describe('Links', () => {
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
                if (url.includes('broken')) return null;
                return {
                    title: `Title of ${url}`,
                    description: 'A description',
                    kind: url.includes('github.com') ? 'repo' : 'article',
                    github_stars: url.includes('github.com') ? 42 : null,
                };
            },
        });
        ({ user, agent } = await signIn('links@example.com'));
        project = await Project.create({ name: 'Fusée', user_id: user.id });
    });

    afterEach(async () => {
        await jobs.drain();
        jobs.configure({ enabled: false, fetcher: null });
    });

    const addPage = async (url, extra = {}) => {
        const res = await agent
            .post(`/api/projects/${project.uid}/pages`)
            .send({ url, ...extra });
        await jobs.drain();
        return res.body.page;
    };

    it('reads a new page in the background, and marks one that cannot be read', async () => {
        const read = await addPage('https://github.com/o/r');
        const broken = await addPage('https://broken.example.com/x');
        const ok = await Link.findOne({ where: { uid: read.uid } });
        expect(ok).toMatchObject({
            fetch_status: 'done',
            title: 'Title of https://github.com/o/r',
            github_stars: 42,
        });
        const failed = await Link.findOne({ where: { uid: broken.uid } });
        expect(failed.fetch_status).toBe('failed');
    });

    it('keeps a title given at saving once the page has been read', async () => {
        const page = await addPage('https://example.com/titled', {
            title: 'Mine',
        });
        const saved = await Link.findOne({ where: { uid: page.uid } });
        expect(saved.title).toBe('Mine');
    });

    it('requires a project to make a link', async () => {
        const res = await agent
            .post('/api/links')
            .send({ url: 'https://example.com/loose' });
        expect(res.status).toBe(400);
        expect(await Link.count()).toBe(0);
    });

    describe('reading again', () => {
        const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000);
        const make = (url, fields) =>
            Link.create({
                user_id: user.id,
                project_id: project.id,
                url,
                kind: 'other',
                ...fields,
            });

        it('reads stale and failed pages again, never fresh ones', async () => {
            const stale = await make('https://github.com/s/stale', {
                kind: 'repo',
                fetch_status: 'done',
                fetched_at: daysAgo(40),
                github_stars: 10,
                image_url: 'https://img.example.com/s.png',
            });
            await make('https://example.com/failed', {
                fetch_status: 'failed',
                fetched_at: daysAgo(8),
            });
            const fresh = await make('https://example.com/fresh', {
                fetch_status: 'done',
                fetched_at: daysAgo(2),
            });

            expect(await jobs.refreshStale()).toBe(2);
            await jobs.drain();
            expect(fetched.sort()).toEqual([
                'https://example.com/failed',
                'https://github.com/s/stale',
            ]);
            await stale.reload();
            expect(stale.github_stars).toBe(42);
            // Nothing read before is erased by a reading that lacks it.
            expect(stale.image_url).toBe('https://img.example.com/s.png');
            const before = fresh.fetched_at.getTime();
            await fresh.reload();
            expect(fresh.fetched_at.getTime()).toBe(before);
        });

        it('keeps a page read before when reading it again fails', async () => {
            const link = await make('https://broken.example.com/was-ok', {
                fetch_status: 'done',
                fetched_at: daysAgo(31),
                title: 'Was readable',
            });
            await jobs.refreshStale();
            await jobs.drain();
            await link.reload();
            expect(link.fetch_status).toBe('done');
            expect(link.title).toBe('Was readable');
        });

        it('reads every page still waiting after a restart', async () => {
            await make('https://example.com/waiting', {
                fetch_status: 'pending',
            });
            await jobs.initialize();
            await jobs.drain();
            expect(fetched).toContain('https://example.com/waiting');
        });
    });

    describe('managing a page', () => {
        it('moves a page to a new address and reads that page', async () => {
            const page = await addPage('https://example.com/old');
            const res = await agent
                .patch(`/api/links/${page.uid}`)
                .send({ url: 'https://example.com/new/' });
            expect(res.body.link.url).toBe('https://example.com/new');
            await jobs.drain();
            expect(fetched).toContain('https://example.com/new');
        });

        it('refuses an address the project already has', async () => {
            await addPage('https://example.com/a');
            const b = await addPage('https://example.com/b');
            const res = await agent
                .patch(`/api/links/${b.uid}`)
                .send({ url: 'https://example.com/a' });
            expect(res.status).toBe(409);
        });

        it("cannot touch someone else's page", async () => {
            const page = await addPage('https://example.com/mine');
            const other = await signIn('links-other@example.com');
            const edit = await other.agent
                .patch(`/api/links/${page.uid}`)
                .send({ note: 'x' });
            expect(edit.status).toBe(404);
            const removal = await other.agent.delete(`/api/links/${page.uid}`);
            expect(removal.status).toBe(404);
        });

        it('removes the pages with their project', async () => {
            await addPage('https://example.com/gone-with-project');
            await agent.delete(`/api/project/${project.uid}`);
            expect(await Link.count({ where: { user_id: user.id } })).toBe(0);
        });
    });

    it('erases the pages with the account', async () => {
        const member = await signIn('links-erased@example.com');
        const theirs = await Project.create({
            name: 'Theirs',
            user_id: member.user.id,
        });
        await member.agent
            .post(`/api/projects/${theirs.uid}/pages`)
            .send({ url: 'https://example.com/erased' });
        const res = await member.agent
            .delete('/api/profile')
            .send({ password: 'password123' });
        expect(res.status).toBe(204);
        expect(await Link.count({ where: { user_id: member.user.id } })).toBe(
            0
        );
    });

    it('sends the pages to devices with their metadata', async () => {
        await addPage('https://github.com/o/r');
        const pulled = await agent.get('/api/v1/sync/pull?cursor=0');
        // The last change of the page carries what was read.
        const row = pulled.body.changes
            .filter((c) => c.entity === 'link')
            .pop();
        expect(row.data.url).toBe('https://github.com/o/r');
        expect(row.data.project_uid).toBe(project.uid);
        expect(row.data.github_stars).toBe(42);
    });
});
