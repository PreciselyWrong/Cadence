const request = require('supertest');
const app = require('../../app');
const { InboxItem, Link, Tag } = require('../../models');
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

    describe('rows written before links were captured', () => {
        it('captures their links once, skipping thrown-away ideas and habits', async () => {
            jobs.configure({ enabled: false });
            const { InboxItem, Task, Note } = require('../../models');
            const idea = await InboxItem.create({
                user_id: user.id,
                content: 'HTTPS://github.com/old/repo - old idea',
                source: 'android',
            });
            await InboxItem.create({
                user_id: user.id,
                content: 'https://example.com/thrown-away',
                source: 'android',
                status: 'deleted',
            });
            const task = await Task.create({
                user_id: user.id,
                name: 'Read',
                note: 'https://example.com/article',
            });
            await Task.create({
                user_id: user.id,
                name: 'Habit https://example.com/habit',
                habit_mode: true,
            });
            await Note.create({
                user_id: user.id,
                title: 'Refs',
                content: 'See https://example.com/article and no other',
            });
            await Task.create({ user_id: user.id, name: 'No link here' });
            expect(await Link.count({ where: { user_id: user.id } })).toBe(0);
            jobs.configure({ enabled: true });

            await jobs.captureExisting();
            await jobs.captureExisting();
            await jobs.drain();

            const links = (
                await Link.findAll({
                    where: { user_id: user.id },
                    order: [['url', 'ASC']],
                })
            ).map((l) => [l.url, l.source_type, l.source_uid, l.note]);
            expect(links).toEqual([
                ['https://example.com/article', 'task', task.uid, null],
                [
                    'https://github.com/old/repo',
                    'inbox_item',
                    idea.uid,
                    'old idea',
                ],
            ]);
            expect(fetched.sort()).toEqual([
                'https://example.com/article',
                'https://github.com/old/repo',
            ]);
        });
    });

    describe('refresh of read pages', () => {
        const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000);
        const make = (url, fields) =>
            Link.create({ user_id: user.id, url, kind: 'other', ...fields });

        it('reads stale and failed links again, never fresh or dropped ones', async () => {
            const stale = await make('https://github.com/s/stale', {
                kind: 'repo',
                fetch_status: 'done',
                fetched_at: daysAgo(40),
                github_stars: 10,
                image_url: 'https://img.example.com/s.png',
            });
            const failed = await make('https://example.com/failed', {
                fetch_status: 'failed',
                fetched_at: daysAgo(8),
            });
            const fresh = await make('https://example.com/fresh', {
                fetch_status: 'done',
                fetched_at: daysAgo(2),
                title: 'Fresh',
            });
            const recentFailure = await make(
                'https://example.com/recent-fail',
                {
                    fetch_status: 'failed',
                    fetched_at: daysAgo(1),
                }
            );
            const dropped = await make('https://example.com/dropped', {
                fetch_status: 'done',
                fetched_at: daysAgo(90),
                status: 'dropped',
            });

            const queued = await jobs.refreshStale();
            await jobs.drain();

            expect(queued).toBe(2);
            expect(fetched.sort()).toEqual([
                'https://example.com/failed',
                'https://github.com/s/stale',
            ]);
            await stale.reload();
            expect(stale.github_stars).toBe(42);
            // Nothing read before is erased by a reading that lacks it.
            expect(stale.image_url).toBe('https://img.example.com/s.png');
            expect(stale.fetched_at.getTime()).toBeGreaterThan(
                daysAgo(1).getTime()
            );
            await failed.reload();
            expect(failed.fetch_status).toBe('done');
            for (const untouched of [fresh, recentFailure, dropped]) {
                const before = untouched.fetched_at.getTime();
                await untouched.reload();
                expect(untouched.fetched_at.getTime()).toBe(before);
            }
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
            expect(link.fetched_at.getTime()).toBeGreaterThan(
                daysAgo(1).getTime()
            );
        });
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

    it('sends a shared address straight to the links, not to the inbox', async () => {
        await capture('https://example.com/article - à lire ce soir');
        const item = await InboxItem.findOne({ where: { user_id: user.id } });
        expect(item.status).toBe('processed');
        const [link] = (await agent.get('/api/links')).body.links;
        expect(link.note).toBe('à lire ce soir');
    });

    it('keeps in the inbox a share whose text the saved link does not hold', async () => {
        await capture('https://example.com/deja');
        await capture('https://example.com/deja - un avis à ne pas perdre');
        const items = await InboxItem.findAll({
            where: { user_id: user.id },
            order: [['id', 'ASC']],
        });
        expect(items.map((item) => item.status)).toEqual([
            'processed',
            'added',
        ]);
    });

    it('settles a share sent twice with the same text', async () => {
        await capture('https://example.com/deux - le même titre');
        await capture('https://example.com/deux - le même titre');
        const items = await InboxItem.findAll({
            where: { user_id: user.id },
        });
        expect(items.map((item) => item.status)).toEqual([
            'processed',
            'processed',
        ]);
    });

    it('answers with the existing link when two saves of one address meet', async () => {
        const repository = require('../../modules/links/repository');
        const first = await agent
            .post('/api/links')
            .send({ url: 'https://example.com/course' });
        const spy = jest
            .spyOn(repository, 'findByUrl')
            .mockResolvedValueOnce(null);
        const second = await agent
            .post('/api/links')
            .send({ url: 'https://example.com/course' });
        spy.mockRestore();
        expect(second.status).toBe(200);
        expect(second.body.created).toBe(false);
        expect(second.body.link.uid).toBe(first.body.link.uid);
    });

    it('reads every link still waiting after a restart', async () => {
        const seen = [];
        jobs.configure({
            enabled: true,
            spacingMs: 0,
            fetcher: async (url) => {
                seen.push(url);
                return { status: 'done' };
            },
        });
        await Link.bulkCreate(
            Array.from({ length: 205 }, (_, index) => ({
                user_id: user.id,
                url: `https://example.com/attente/${index}`,
                kind: 'web',
                fetch_status: 'pending',
            }))
        );
        await jobs.initialize();
        await jobs.drain();
        expect(seen.length).toBeGreaterThanOrEqual(205);
    });

    it('leaves dropped and unread links out of what the themes read', async () => {
        const links = require('../../modules/links/service');
        await Link.bulkCreate([
            {
                user_id: user.id,
                url: 'https://a.example/1',
                kind: 'web',
                fetch_status: 'done',
            },
            {
                user_id: user.id,
                url: 'https://a.example/2',
                kind: 'web',
                fetch_status: 'pending',
            },
            {
                user_id: user.id,
                url: 'https://a.example/3',
                kind: 'web',
                status: 'dropped',
                fetch_status: 'done',
            },
        ]);
        const found = await links.list(user.id, {
            untagged: true,
            readable: true,
            limit: 1,
        });
        expect(found.links.map((link) => link.url)).toEqual([
            'https://a.example/1',
        ]);
    });

    it('leaves in the inbox an idea that only mentions a link', async () => {
        await capture(
            `https://example.com/idee ${'une vraie idée à creuser pour le projet, '.repeat(4)}`
        );
        const item = await InboxItem.findOne({ where: { user_id: user.id } });
        expect(item.status).toBe('added');
    });

    it('leaves in the inbox what was there before, when links are read again', async () => {
        const { captureFrom } = require('../../modules/links/capture');
        // Saved while capture was off, as at a server's first start.
        jobs.configure({ enabled: false });
        const item = await InboxItem.create({
            user_id: user.id,
            content: 'https://example.com/ancienne',
            source: 'test',
        });
        await captureFrom({
            userId: user.id,
            type: 'inbox_item',
            uid: item.uid,
            texts: [item.content],
        });
        await item.reload();
        expect(item.status).toBe('added');
    });

    it('leaves in the inbox an idea with several links', async () => {
        await capture('https://example.com/a et https://example.com/b');
        const item = await InboxItem.findOne({ where: { user_id: user.id } });
        expect(item.status).toBe('added');
    });

    it('adds a link directly, once per page', async () => {
        const first = await agent.post('/api/links').send({
            url: 'https://example.com/page?utm_source=x',
            title: 'Une page',
            tags: ['dev/outils'],
            status: 'to_evaluate',
        });
        expect(first.status).toBe(200);
        expect(first.body).toMatchObject({
            created: true,
            link: {
                url: 'https://example.com/page',
                title: 'Une page',
                status: 'to_evaluate',
            },
        });
        expect(first.body.link.tags.map((t) => t.name)).toContain('dev/outils');

        const again = await agent
            .post('/api/links')
            .send({ url: 'https://example.com/page', title: 'Autre titre' });
        expect(again.body.created).toBe(false);
        expect(again.body.link.title).not.toBe('Autre titre');

        const bad = await agent.post('/api/links').send({ url: 'ftp://x' });
        expect(bad.status).toBe(400);
        await jobs.drain();
    });

    it('imports bookmarks and counts what happened to each', async () => {
        await agent.post('/api/links').send({ url: 'https://example.com/a' });
        const res = await agent.post('/api/links/import').send({
            items: [
                { url: 'https://example.com/a', title: 'Déjà là' },
                {
                    url: 'https://example.com/b',
                    title: 'Nouveau',
                    tags: ['lecture'],
                },
                { url: 'pas une adresse' },
            ],
        });
        expect(res.body).toEqual({ created: 1, existing: 1, invalid: 1 });
        await jobs.drain();
        const { links } = (await agent.get('/api/links')).body;
        expect(links.map((l) => l.url).sort()).toEqual([
            'https://example.com/a',
            'https://example.com/b',
        ]);
    });

    it('takes a link from an API token, as the Firefox add-on sends it', async () => {
        const created = await agent
            .post('/api/profile/api-keys')
            .send({ name: 'Firefox' });
        expect(created.status).toBe(201);
        const res = await request(app)
            .post('/api/links')
            .set('Authorization', `Bearer ${created.body.token}`)
            .send({ url: 'https://example.com/depuis-firefox', title: 'Page' });
        expect(res.status).toBe(200);
        expect(res.body.created).toBe(true);
        await jobs.drain();
    });

    it('refuses too many bookmarks at once', async () => {
        const res = await agent.post('/api/links/import').send({
            items: Array.from({ length: 501 }, (_, i) => ({
                url: `https://example.com/${i}`,
            })),
        });
        expect(res.status).toBe(400);
    });
});
