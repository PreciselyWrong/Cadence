const request = require('supertest');
const app = require('../../app');
const { Link, Tag } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const jobs = require('../../modules/links/jobs');

const hlc = (ms, counter = 0, node = 'devA') =>
    `${String(ms).padStart(13, '0')}-${String(counter).padStart(4, '0')}-${node}`;

const upsert = (opId, uid, fields, clock) => ({
    op_id: opId,
    entity: 'link',
    uid,
    action: 'upsert',
    fields: Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, { value: v, hlc: clock }])
    ),
});

const signIn = async (email) => {
    const user = await createTestUser({ email });
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email, password: 'password123' });
    return { user, agent };
};

describe('Links', () => {
    let agent;
    let user;
    let fetched;

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
                    image_url: null,
                    site_name: 'Site',
                    kind: url.includes('github.com') ? 'repo' : 'article',
                    github_stars: url.includes('github.com') ? 42 : null,
                    github_language: url.includes('github.com') ? 'Go' : null,
                    github_last_commit: null,
                    readme_excerpt: null,
                };
            },
        });
        ({ user, agent } = await signIn('links@example.com'));
    });

    afterEach(async () => {
        await jobs.drain();
        jobs.configure({ enabled: false, fetcher: null });
    });

    const capture = async (content) => {
        const res = await agent.post('/api/inbox').send({ content });
        await jobs.drain();
        return res;
    };

    it('captures a link from an inbox item with the text around it as note', async () => {
        const res = await capture(
            'https://github.com/owner/repo?utm_source=x - invoices CLI'
        );

        expect(res.status).toBe(201);
        const link = await Link.findOne({ where: { user_id: user.id } });
        expect(link.url).toBe('https://github.com/owner/repo');
        expect(link.note).toBe('invoices CLI');
        expect(link.source_type).toBe('inbox_item');
        expect(link.source_uid).toBe(res.body.uid);
        expect(link.kind).toBe('repo');
        expect(link.fetch_status).toBe('done');
        expect(link.github_stars).toBe(42);
        expect(fetched).toEqual(['https://github.com/owner/repo']);
    });

    it('marks a link whose page cannot be read as failed, keeping the capture', async () => {
        const res = await capture('https://broken.example.com/x');

        expect(res.status).toBe(201);
        const link = await Link.findOne({ where: { user_id: user.id } });
        expect(link.fetch_status).toBe('failed');
        expect(link.fetched_at).not.toBeNull();
    });

    it('keeps one link per page and moves it from the inbox to the task', async () => {
        await capture('https://example.com/post');
        const task = await agent
            .post('/api/task')
            .send({ name: 'Read https://example.com/post#intro' });
        await jobs.drain();

        const links = await Link.findAll({ where: { user_id: user.id } });
        expect(links).toHaveLength(1);
        expect(links[0].source_type).toBe('task');
        expect(links[0].source_uid).toBe(task.body.uid);
        expect(fetched).toHaveLength(1);
    });

    it('captures links from a note and from a task note', async () => {
        await agent
            .post('/api/note')
            .send({ title: 'Refs', content: 'See https://a.example.org/x' });
        await agent
            .post('/api/task')
            .send({ name: 'Plain', note: 'Docs: https://b.example.org/y' });
        await jobs.drain();

        const urls = (
            await Link.findAll({
                where: { user_id: user.id },
                order: [['url', 'ASC']],
            })
        ).map((l) => [l.url, l.source_type, l.note]);
        expect(urls).toEqual([
            ['https://a.example.org/x', 'note', null],
            ['https://b.example.org/y', 'task', null],
        ]);
    });

    it('lists links with filters', async () => {
        await capture('https://github.com/a/b');
        await capture('https://blog.example.com/post');
        const blog = await Link.findOne({
            where: { url: 'https://blog.example.com/post' },
        });
        await agent
            .patch(`/api/links/${blog.uid}`)
            .send({ status: 'kept', tags: ['reading'] });

        const all = await agent.get('/api/links');
        expect(all.status).toBe(200);
        expect(all.body.total).toBe(2);
        expect(all.body.links[0].url).toBe('https://blog.example.com/post');
        expect(all.body.links[0].domain).toBe('blog.example.com');

        const byKind = await agent.get('/api/links?kind=repo');
        expect(byKind.body.links.map((l) => l.url)).toEqual([
            'https://github.com/a/b',
        ]);
        const byStatus = await agent.get('/api/links?status=kept');
        expect(byStatus.body.links).toHaveLength(1);
        const byTag = await agent.get('/api/links?tag=reading');
        expect(byTag.body.links[0].tags.map((t) => t.name)).toEqual([
            'reading',
        ]);
        const untagged = await agent.get('/api/links?untagged=true');
        expect(untagged.body.links.map((l) => l.url)).toEqual([
            'https://github.com/a/b',
        ]);
        const byDomain = await agent.get('/api/links?domain=github.com');
        expect(byDomain.body.total).toBe(1);
        const search = await agent.get('/api/links?q=BLOG.example');
        expect(search.body.total).toBe(1);
        const oldest = await agent.get('/api/links?sort=oldest');
        expect(oldest.body.links[0].url).toBe('https://github.com/a/b');
    });

    it('edits the note, status and tags, and refuses a bad status', async () => {
        await capture('https://example.com/tool');
        const link = await Link.findOne({ where: { user_id: user.id } });

        const res = await agent.patch(`/api/links/${link.uid}`).send({
            note: '  try for Q1  ',
            status: 'tested',
            tags: ['dev/tools'],
        });
        expect(res.status).toBe(200);
        expect(res.body.link.note).toBe('try for Q1');
        expect(res.body.link.status).toBe('tested');
        expect(res.body.link.tags.map((t) => t.name)).toEqual(['dev/tools']);

        const bad = await agent
            .patch(`/api/links/${link.uid}`)
            .send({ status: 'archived' });
        expect(bad.status).toBe(400);

        const cleared = await agent
            .patch(`/api/links/${link.uid}`)
            .send({ note: '', tags: [] });
        expect(cleared.body.link.note).toBeNull();
        expect(cleared.body.link.tags).toEqual([]);
    });

    it('sets a review day for a parked link, 30 days out unless one is given', async () => {
        await capture('https://example.com/later');
        const link = await Link.findOne({ where: { user_id: user.id } });
        const plusDays = (offset) => {
            const d = new Date();
            d.setDate(d.getDate() + offset);
            return [
                d.getFullYear(),
                String(d.getMonth() + 1).padStart(2, '0'),
                String(d.getDate()).padStart(2, '0'),
            ].join('-');
        };

        const parked = await agent
            .patch(`/api/links/${link.uid}`)
            .send({ status: 'parked' });
        expect(parked.body.link.review_at).toBe(plusDays(30));

        const dated = await agent
            .patch(`/api/links/${link.uid}`)
            .send({ status: 'parked', review_at: '2027-03-01' });
        expect(dated.body.link.review_at).toBe('2027-03-01');

        const cleared = await agent
            .patch(`/api/links/${link.uid}`)
            .send({ review_at: null });
        expect(cleared.body.link.review_at).toBeNull();
    });

    it('refuses a review day that is not a date', async () => {
        await capture('https://example.com/date');
        const link = await Link.findOne({ where: { user_id: user.id } });

        const res = await agent
            .patch(`/api/links/${link.uid}`)
            .send({ review_at: 'next week' });

        expect(res.status).toBe(400);
    });

    it('drops a deleted tag from its links', async () => {
        await capture('https://example.com/tagged');
        const link = await Link.findOne({ where: { user_id: user.id } });
        await agent.patch(`/api/links/${link.uid}`).send({ tags: ['gone'] });
        const tag = await Tag.findOne({ where: { name: 'gone' } });

        const res = await agent.delete(`/api/tag/${tag.uid}`);

        expect(res.status).toBeLessThan(300);
        const fresh = await agent.get(`/api/links/${link.uid}`);
        expect(fresh.body.link.tags).toEqual([]);
    });

    it('erases links and their tags with the account', async () => {
        const member = await signIn('links-erased@example.com');
        await member.agent
            .post('/api/inbox')
            .send({ content: 'https://example.com/erased' });
        await jobs.drain();
        const link = await Link.findOne({ where: { user_id: member.user.id } });
        await member.agent
            .patch(`/api/links/${link.uid}`)
            .send({ tags: ['keep'] });

        const res = await member.agent
            .delete('/api/profile')
            .send({ password: 'password123' });

        expect(res.status).toBe(204);
        expect(await Link.count({ where: { user_id: member.user.id } })).toBe(
            0
        );
        const [rows] = await Link.sequelize.query(
            'SELECT COUNT(*) AS n FROM links_tags'
        );
        expect(Number(rows[0].n)).toBe(0);
    });

    it("hides another user's links", async () => {
        await capture('https://example.com/mine');
        const link = await Link.findOne({ where: { user_id: user.id } });
        const other = await signIn('links-other@example.com');

        const res = await other.agent.get(`/api/links/${link.uid}`);
        expect(res.status).toBe(404);
        const patch = await other.agent
            .patch(`/api/links/${link.uid}`)
            .send({ note: 'x' });
        expect(patch.status).toBe(404);
        expect((await other.agent.get('/api/links')).body.total).toBe(0);
    });

    describe('offline sync', () => {
        it('sends links to devices with their metadata', async () => {
            await capture('https://github.com/o/r');

            const meta = await agent.get('/api/v1/sync/meta');
            expect(meta.body.entities.map((e) => e.name)).toContain('link');
            const pulled = await agent.get('/api/v1/sync/pull?cursor=0');
            const change = pulled.body.changes
                .filter((c) => c.entity === 'link')
                .pop();
            expect(change.data).toEqual(
                expect.objectContaining({
                    url: 'https://github.com/o/r',
                    title: 'Title of https://github.com/o/r',
                    kind: 'repo',
                    github_stars: 42,
                    fetch_status: 'done',
                    status: 'new',
                    tag_uids: [],
                })
            );
        });

        it('applies a note, status and tags pushed by a device', async () => {
            await capture('https://example.com/x');
            const link = await Link.findOne({ where: { user_id: user.id } });
            const tag = await Tag.create({ name: 'later', user_id: user.id });

            const res = await agent.post('/api/v1/sync/push').send({
                ops: [
                    upsert(
                        'op-l1',
                        link.uid,
                        {
                            note: 'from phone',
                            status: 'parked',
                            tag_uids: [tag.uid],
                        },
                        hlc(Date.now())
                    ),
                ],
            });

            expect(res.body.results[0].status).toBe('applied');
            const fresh = await agent.get(`/api/links/${link.uid}`);
            expect(fresh.body.link.note).toBe('from phone');
            expect(fresh.body.link.status).toBe('parked');
            expect(fresh.body.link.tags.map((t) => t.name)).toEqual(['later']);
        });

        it('applies a review day pushed by a device and refuses a bad one', async () => {
            await capture('https://example.com/review');
            const link = await Link.findOne({ where: { user_id: user.id } });

            const res = await agent.post('/api/v1/sync/push').send({
                ops: [
                    upsert(
                        'op-r1',
                        link.uid,
                        { review_at: '2027-02-14' },
                        hlc(Date.now())
                    ),
                    upsert(
                        'op-r2',
                        link.uid,
                        { review_at: 'someday' },
                        hlc(Date.now() + 1)
                    ),
                ],
            });

            expect(res.body.results.map((r) => r.status)).toEqual([
                'applied',
                'rejected',
            ]);
            expect(res.body.results[1].reason).toBe('invalid_review_at');
            const fresh = await agent.get(`/api/links/${link.uid}`);
            expect(fresh.body.link.review_at).toBe('2027-02-14');
        });

        it('refuses server fields, unknown links and bad statuses', async () => {
            await capture('https://example.com/y');
            const link = await Link.findOne({ where: { user_id: user.id } });

            const res = await agent.post('/api/v1/sync/push').send({
                ops: [
                    upsert(
                        'op-l2',
                        link.uid,
                        { url: 'https://evil.example' },
                        hlc(Date.now())
                    ),
                    upsert(
                        'op-l3',
                        'clientlink00001',
                        { note: 'x' },
                        hlc(Date.now())
                    ),
                    upsert(
                        'op-l4',
                        link.uid,
                        { status: 'bogus' },
                        hlc(Date.now())
                    ),
                ],
            });

            expect(res.body.results.map((r) => r.status)).toEqual([
                'rejected',
                'rejected',
                'rejected',
            ]);
            expect(res.body.results[1].reason).toBe('unknown_link');
            expect(await Link.count()).toBe(1);
        });
    });
});
