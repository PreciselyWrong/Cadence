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

const plusDays = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
    ].join('-');
};

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

    const addLink = (body) => agent.post('/api/links').send(body);

    it('never makes a link from an inbox item: the idea stays in the inbox', async () => {
        const res = await capture(
            'https://github.com/owner/repo?utm_source=x - invoices CLI'
        );

        expect(res.status).toBe(201);
        expect(await Link.count({ where: { user_id: user.id } })).toBe(0);
        expect(fetched).toEqual([]);
        const item = await InboxItem.findOne({ where: { uid: res.body.uid } });
        expect(item.status).toBe('added');
    });

    it('keeps a link made from an idea, with the idea as its source, and reads its page', async () => {
        const idea = await capture('https://github.com/owner/repo');
        const res = await addLink({
            url: 'https://github.com/owner/repo?utm_source=x',
            note: 'invoices CLI',
            source_type: 'inbox_item',
            source_uid: idea.body.uid,
        });
        await jobs.drain();

        expect(res.body.created).toBe(true);
        const link = await Link.findOne({ where: { user_id: user.id } });
        expect(link.url).toBe('https://github.com/owner/repo');
        expect(link.note).toBe('invoices CLI');
        expect(link.source_type).toBe('inbox_item');
        expect(link.source_uid).toBe(idea.body.uid);
        expect(link.kind).toBe('repo');
        expect(link.fetch_status).toBe('done');
        expect(link.github_stars).toBe(42);
        expect(fetched).toEqual(['https://github.com/owner/repo']);
    });

    it('marks a link whose page cannot be read as failed, keeping the link', async () => {
        const res = await addLink({ url: 'https://broken.example.com/x' });
        await jobs.drain();

        expect(res.status).toBe(200);
        const link = await Link.findOne({ where: { user_id: user.id } });
        expect(link.fetch_status).toBe('failed');
        expect(link.fetched_at).not.toBeNull();
    });

    it('keeps one link per page, however often it is saved', async () => {
        await addLink({ url: 'https://example.com/post' });
        const again = await addLink({ url: 'https://example.com/post#intro' });
        await jobs.drain();

        expect(again.body.created).toBe(false);
        expect(await Link.count({ where: { user_id: user.id } })).toBe(1);
        expect(fetched).toHaveLength(1);
    });

    it('leaves the links written in tasks and notes out of the library', async () => {
        await agent
            .post('/api/note')
            .send({ title: 'Refs', content: 'See https://a.example.org/x' });
        await agent
            .post('/api/task')
            .send({ name: 'Plain', note: 'Docs: https://b.example.org/y' });
        await jobs.drain();

        expect(await Link.count({ where: { user_id: user.id } })).toBe(0);
        expect(fetched).toEqual([]);
    });

    it('never makes a link of a context address, and keeps the idea', async () => {
        const res = await capture('https://mail.google.com/mail/u/0/#inbox/x');
        await capture('Search https://www.google.com/search?q=cadence later');

        expect(await Link.count({ where: { user_id: user.id } })).toBe(0);
        const item = await InboxItem.findOne({ where: { uid: res.body.uid } });
        expect(item.status).toBe('added');
    });

    it('adds a link from a task on purpose, with the task as its source', async () => {
        const task = await agent
            .post('/api/task')
            .send({ name: 'Try https://github.com/a/tool' });
        const res = await agent.post('/api/links').send({
            url: 'https://github.com/a/tool',
            source_type: 'task',
            source_uid: task.body.uid,
        });
        await jobs.drain();

        expect(res.status).toBe(200);
        expect(res.body.created).toBe(true);
        expect(res.body.link.source_type).toBe('task');
        expect(res.body.link.source_uid).toBe(task.body.uid);

        const note = await agent
            .post('/api/note')
            .send({ title: 'N', content: 'https://mail.google.com/x' });
        const context = await agent.post('/api/links').send({
            url: 'https://mail.google.com/x',
            source_type: 'note',
            source_uid: note.body.uid,
        });
        expect(context.status).toBe(200);
        expect(context.body.link.source_type).toBe('note');
    });

    it('refuses a source that is not a task or note of the user', async () => {
        const other = await signIn('links-source@example.com');
        const task = await other.agent
            .post('/api/task')
            .send({ name: 'Theirs' });

        const foreign = await agent.post('/api/links').send({
            url: 'https://example.com/a',
            source_type: 'task',
            source_uid: task.body.uid,
        });
        const kind = await agent.post('/api/links').send({
            url: 'https://example.com/b',
            source_type: 'project',
            source_uid: 'x',
        });

        expect(foreign.status).toBe(404);
        expect(kind.status).toBe(400);
        expect(await Link.count({ where: { user_id: user.id } })).toBe(0);
    });

    it('lists links with filters', async () => {
        await addLink({ url: 'https://github.com/a/b' });
        await addLink({ url: 'https://blog.example.com/post' });
        const blog = await Link.findOne({
            where: { url: 'https://blog.example.com/post' },
        });
        await agent
            .patch(`/api/links/${blog.uid}`)
            .send({ status: 'dropped', tags: ['reading'] });

        const all = await agent.get('/api/links');
        expect(all.status).toBe(200);
        expect(all.body.total).toBe(2);
        expect(all.body.links[0].url).toBe('https://blog.example.com/post');
        expect(all.body.links[0].domain).toBe('blog.example.com');

        const byKind = await agent.get('/api/links?kind=repo');
        expect(byKind.body.links.map((l) => l.url)).toEqual([
            'https://github.com/a/b',
        ]);
        const byStatus = await agent.get('/api/links?status=dropped');
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
        await addLink({ url: 'https://example.com/tool' });
        const link = await Link.findOne({ where: { user_id: user.id } });

        const res = await agent.patch(`/api/links/${link.uid}`).send({
            note: '  try for Q1  ',
            status: 'dropped',
            tags: ['dev/tools'],
        });
        expect(res.status).toBe(200);
        expect(res.body.link.note).toBe('try for Q1');
        expect(res.body.link.status).toBe('dropped');
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

    it('reads the former statuses as new on every input path', async () => {
        const created = await addLink({
            url: 'https://example.com/ancien',
            status: 'kept',
        });
        const link = created.body.link;
        expect(link.status).toBe('new');

        for (const status of ['to_evaluate', 'tested', 'kept']) {
            const res = await agent
                .patch(`/api/links/${link.uid}`)
                .send({ status });
            expect(res.body.link.status).toBe('new');
        }

        const imported = await agent.post('/api/links/import').send({
            items: [{ url: 'https://example.com/importe', status: 'tested' }],
        });
        expect(imported.body.created).toBe(1);
        const fromImport = await Link.findOne({
            where: { url: 'https://example.com/importe' },
        });
        expect(fromImport.status).toBe('new');

        const filtered = await agent.get('/api/links?status=kept');
        expect(filtered.body.total).toBe(2);
    });

    it('refuses a status that is neither a current nor a former one', async () => {
        const link = (await addLink({ url: 'https://example.com/inconnu' }))
            .body.link;

        const res = await agent
            .patch(`/api/links/${link.uid}`)
            .send({ status: 'archived' });

        expect(res.status).toBe(400);
    });

    it('turns a parked link into a new one with a review day 30 days out, unless one is given', async () => {
        await addLink({ url: 'https://example.com/later' });
        const link = await Link.findOne({ where: { user_id: user.id } });

        const parked = await agent
            .patch(`/api/links/${link.uid}`)
            .send({ status: 'parked' });
        expect(parked.body.link.status).toBe('new');
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
        await addLink({ url: 'https://example.com/date' });
        const link = await Link.findOne({ where: { user_id: user.id } });

        const res = await agent
            .patch(`/api/links/${link.uid}`)
            .send({ review_at: 'next week' });

        expect(res.status).toBe(400);
    });

    it('drops a deleted tag from its links', async () => {
        await addLink({ url: 'https://example.com/tagged' });
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
        const created = await member.agent
            .post('/api/links')
            .send({ url: 'https://example.com/erased' });
        const link = created.body.link;
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
        await addLink({ url: 'https://example.com/mine' });
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

    describe('clean-up of links found in texts', () => {
        const { pruneContextLinks } = require('../../modules/links/prune');

        it('deletes once the untouched links of tasks, notes and context addresses', async () => {
            jobs.configure({ enabled: false });
            const {
                SyncChange,
                LinkExclusion,
                Project,
                Setting,
            } = require('../../models');
            const make = (url, fields = {}) =>
                Link.create({
                    user_id: user.id,
                    url,
                    source_type: 'task',
                    source_uid: 'x',
                    ...fields,
                });
            const project = await Project.create({
                user_id: user.id,
                name: 'P',
            });
            const fromTask = await make('https://example.com/task');
            await make('https://example.com/note', {
                source_type: 'note',
                note: 'worth it',
            });
            const tagged = await make('https://example.com/tagged');
            const tag = await Tag.create({ user_id: user.id, name: 'dev' });
            await tagged.setTags([tag]);
            await make('https://example.com/kept', { status: 'dropped' });
            await make('https://example.com/project', {
                project_id: project.id,
            });
            await make('https://example.com/parked', {
                review_at: '2026-12-01',
            });
            const context = await make('https://mail.google.com/x', {
                source_type: 'inbox_item',
            });
            await make('https://example.com/shared', {
                source_type: 'inbox_item',
            });
            await make('https://example.com/added', {
                source_type: null,
                source_uid: null,
            });

            expect(await pruneContextLinks()).toBe(2);

            const left = (
                await Link.findAll({
                    where: { user_id: user.id },
                    order: [['url', 'ASC']],
                })
            ).map((l) => l.url);
            expect(left).toEqual([
                'https://example.com/added',
                'https://example.com/kept',
                'https://example.com/note',
                'https://example.com/parked',
                'https://example.com/project',
                'https://example.com/shared',
                'https://example.com/tagged',
            ]);
            const deletes = await SyncChange.findAll({
                where: { user_id: user.id, entity: 'link', op: 'delete' },
            });
            expect(deletes.map((d) => d.uid).sort()).toEqual(
                [fromTask.uid, context.uid].sort()
            );
            expect(
                await LinkExclusion.count({ where: { user_id: user.id } })
            ).toBe(2);
            expect(
                await Setting.count({ where: { key: 'links_context_pruned' } })
            ).toBe(1);

            await make('https://example.com/later');
            expect(await pruneContextLinks()).toBe(0);
            expect(
                await Link.count({
                    where: { url: 'https://example.com/later' },
                })
            ).toBe(1);
        });

        it('treats the hosts of TUDUDI_LINKS_IGNORE_HOSTS as context', async () => {
            jobs.configure({ enabled: false });
            const { Setting } = require('../../models');
            await Setting.destroy({ where: { key: 'links_context_pruned' } });
            const previous = process.env.TUDUDI_LINKS_IGNORE_HOSTS;
            process.env.TUDUDI_LINKS_IGNORE_HOSTS =
                ' Example.net , intra.example.org';
            try {
                await Link.create({
                    user_id: user.id,
                    url: 'https://git.example.net/me/repo',
                    source_type: 'inbox_item',
                    source_uid: 'x',
                });
                await Link.create({
                    user_id: user.id,
                    url: 'https://example.org/kept',
                    source_type: 'inbox_item',
                    source_uid: 'x',
                });

                expect(await pruneContextLinks()).toBe(1);
            } finally {
                if (previous === undefined) {
                    delete process.env.TUDUDI_LINKS_IGNORE_HOSTS;
                } else {
                    process.env.TUDUDI_LINKS_IGNORE_HOSTS = previous;
                }
            }
            expect(
                (await Link.findAll({ where: { user_id: user.id } })).map(
                    (l) => l.url
                )
            ).toEqual(['https://example.org/kept']);
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
            await addLink({ url: 'https://github.com/o/r' });

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
            await addLink({ url: 'https://example.com/x' });
            const link = await Link.findOne({ where: { user_id: user.id } });
            const tag = await Tag.create({ name: 'later', user_id: user.id });

            const res = await agent.post('/api/v1/sync/push').send({
                ops: [
                    upsert(
                        'op-l1',
                        link.uid,
                        {
                            note: 'from phone',
                            status: 'dropped',
                            tag_uids: [tag.uid],
                        },
                        hlc(Date.now())
                    ),
                ],
            });

            expect(res.body.results[0].status).toBe('applied');
            const fresh = await agent.get(`/api/links/${link.uid}`);
            expect(fresh.body.link.note).toBe('from phone');
            expect(fresh.body.link.status).toBe('dropped');
            expect(fresh.body.link.tags.map((t) => t.name)).toEqual(['later']);
        });

        it('reads a former status pushed by a device as new, a parked one with a review day', async () => {
            await addLink({ url: 'https://example.com/ancien-tel' });
            const link = await Link.findOne({ where: { user_id: user.id } });

            const res = await agent.post('/api/v1/sync/push').send({
                ops: [
                    upsert(
                        'op-k',
                        link.uid,
                        { status: 'kept' },
                        hlc(Date.now())
                    ),
                    upsert(
                        'op-p',
                        link.uid,
                        { status: 'parked' },
                        hlc(Date.now() + 1)
                    ),
                ],
            });

            expect(res.body.results.map((r) => r.status)).toEqual([
                'applied',
                'applied',
            ]);
            const fresh = await agent.get(`/api/links/${link.uid}`);
            expect(fresh.body.link.status).toBe('new');
            expect(fresh.body.link.review_at).toBe(plusDays(30));
        });

        it('applies a review day pushed by a device and refuses a bad one', async () => {
            await addLink({ url: 'https://example.com/review' });
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
            await addLink({ url: 'https://example.com/y' });
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
            expect(res.body.results[0].reason).toBe('url_readonly');
            expect(res.body.results[1].reason).toBe('project_required');
            expect(res.body.results[2].reason).toBe('invalid_status');
            expect(await Link.count()).toBe(1);
        });
    });

    it('answers with the existing page when two saves of one address in a project meet', async () => {
        const repository = require('../../modules/links/repository');
        const { Project } = require('../../models');
        const project = await Project.create({
            name: 'Cours',
            user_id: user.id,
        });
        const first = await agent.post('/api/links').send({
            url: 'https://example.com/course',
            project_uid: project.uid,
        });
        const spy = jest
            .spyOn(repository, 'findByUrl')
            .mockResolvedValueOnce(null);
        const second = await agent.post('/api/links').send({
            url: 'https://example.com/course',
            project_uid: project.uid,
        });
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

    it('adds a link directly, once per page', async () => {
        const first = await agent.post('/api/links').send({
            url: 'https://example.com/page?utm_source=x',
            title: 'Une page',
            tags: ['dev/outils'],
            status: 'dropped',
        });
        expect(first.status).toBe(200);
        expect(first.body).toMatchObject({
            created: true,
            link: {
                url: 'https://example.com/page',
                title: 'Une page',
                status: 'dropped',
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

    describe('managing a link', () => {
        const add = async (url = 'https://example.com/gerer') =>
            (await agent.post('/api/links').send({ url })).body.link;

        it('deletes a link, and an idea holding its address does not bring it back', async () => {
            const link = await add('https://example.com/efface');

            const res = await agent.delete(`/api/links/${link.uid}`);
            expect(res.status).toBe(200);
            expect((await agent.get(`/api/links/${link.uid}`)).status).toBe(
                404
            );

            await capture('An idea about https://example.com/efface to keep');
            expect(
                await Link.count({ where: { url: link.url, user_id: user.id } })
            ).toBe(0);
        });

        it('takes a deleted link back when the user saves it again', async () => {
            const link = await add();
            await agent.delete(`/api/links/${link.uid}`);
            const again = await agent
                .post('/api/links')
                .send({ url: link.url });
            expect(again.body.created).toBe(true);
            expect(
                await Link.count({ where: { url: link.url, user_id: user.id } })
            ).toBe(1);
        });

        it('puts a new link in a project of the user, and refuses a foreign one', async () => {
            const { Project } = require('../../models');
            const mine = await Project.create({
                name: 'Mon projet',
                user_id: user.id,
            });
            const owner = await createTestUser({
                email: 'pro-create@example.com',
            });
            const foreign = await Project.create({
                name: 'Pas à moi',
                user_id: owner.id,
            });

            const res = await addLink({
                url: 'https://example.com/projet',
                project_uid: mine.uid,
            });
            expect(res.status).toBe(200);
            expect(res.body.link).toMatchObject({
                project_uid: mine.uid,
                project_name: 'Mon projet',
            });

            const refused = await addLink({
                url: 'https://example.com/projet-etranger',
                project_uid: foreign.uid,
            });
            expect(refused.status).toBe(400);
            expect(
                await Link.count({
                    where: { url: 'https://example.com/projet-etranger' },
                })
            ).toBe(0);
        });

        it('adds a link from an idea of the user, and refuses an idea of someone else', async () => {
            const idea = await capture('une idée à garder');
            const ok = await addLink({
                url: 'https://example.com/depuis-idee',
                source_type: 'inbox_item',
                source_uid: idea.body.uid,
            });
            expect(ok.status).toBe(200);
            expect(ok.body.link).toMatchObject({
                source_type: 'inbox_item',
                source_uid: idea.body.uid,
            });

            const other = await signIn('idea-other@example.com');
            const foreign = await other.agent
                .post('/api/inbox')
                .send({ content: 'pas à toi' });
            const refused = await addLink({
                url: 'https://example.com/idee-etrangere',
                source_type: 'inbox_item',
                source_uid: foreign.body.uid,
            });
            expect(refused.status).toBe(404);
        });

        it('cannot touch the link of someone else', async () => {
            const link = await add();
            const { agent: other } = await signIn('other-links@example.com');
            expect((await other.delete(`/api/links/${link.uid}`)).status).toBe(
                404
            );
            expect(await Link.count({ where: { uid: link.uid } })).toBe(1);
        });

        it('edits the title, which a later reading keeps', async () => {
            const link = await add();
            await jobs.drain();
            const res = await agent
                .patch(`/api/links/${link.uid}`)
                .send({ title: '  Mon nom  ' });
            expect(res.body.link.title).toBe('Mon nom');
            await jobs.fetchAndStore(
                (await Link.findOne({ where: { uid: link.uid } })).id
            );
            expect(
                (await Link.findOne({ where: { uid: link.uid } })).title
            ).toBe('Mon nom');
        });

        it('moves a link to a new address and reads that page', async () => {
            const link = await add('https://example.com/ancienne');
            await jobs.drain();
            const res = await agent
                .patch(`/api/links/${link.uid}`)
                .send({ url: 'https://example.com/nouvelle?utm_source=x' });
            expect(res.body.link.url).toBe('https://example.com/nouvelle');
            expect(res.body.link.fetch_status).toBe('pending');
            await jobs.drain();
            expect(fetched).toContain('https://example.com/nouvelle');
            const saved = await Link.findOne({ where: { uid: link.uid } });
            expect(saved.description).toBe('A description');
        });

        it('refuses an address that is not valid or already saved', async () => {
            const link = await add('https://example.com/une');
            await add('https://example.com/deuxieme');
            const bad = await agent
                .patch(`/api/links/${link.uid}`)
                .send({ url: 'ftp://x' });
            expect(bad.status).toBe(400);
            const taken = await agent
                .patch(`/api/links/${link.uid}`)
                .send({ url: 'https://example.com/deuxieme' });
            expect(taken.status).toBe(409);
        });

        it('puts a link in a project, takes it out, and survives the project', async () => {
            const { Project } = require('../../models');
            const project = await Project.create({
                name: 'Projet fictif',
                user_id: user.id,
            });
            const link = await add();
            const put = await agent
                .patch(`/api/links/${link.uid}`)
                .send({ project_uid: project.uid });
            expect(put.body.link).toMatchObject({
                project_uid: project.uid,
                project_name: 'Projet fictif',
            });
            const out = await agent
                .patch(`/api/links/${link.uid}`)
                .send({ project_uid: null });
            expect(out.body.link.project_uid).toBeNull();

            await agent
                .patch(`/api/links/${link.uid}`)
                .send({ project_uid: project.uid });
            await agent.delete(`/api/project/${project.uid}`);
            const after = await agent.get(`/api/links/${link.uid}`);
            expect(after.status).toBe(200);
            expect(after.body.link.project_uid).toBeNull();
        });

        it('edits and deletes a link from a device', async () => {
            const { Project } = require('../../models');
            const project = await Project.create({
                name: 'Depuis le téléphone',
                user_id: user.id,
            });
            const link = await add('https://example.com/telephone');
            const edit = await agent.post('/api/v1/sync/push').send({
                ops: [
                    upsert(
                        'op-edit',
                        link.uid,
                        { title: 'Renommé', project_uid: project.uid },
                        hlc(Date.now())
                    ),
                ],
            });
            expect(edit.body.results[0].status).toBe('applied');
            const saved = (await agent.get(`/api/links/${link.uid}`)).body.link;
            expect(saved).toMatchObject({
                title: 'Renommé',
                project_uid: project.uid,
            });

            const removed = await agent.post('/api/v1/sync/push').send({
                ops: [
                    {
                        op_id: 'op-delete',
                        entity: 'link',
                        uid: link.uid,
                        action: 'delete',
                        hlc: hlc(Date.now() + 1000),
                    },
                ],
            });
            expect(removed.body.results[0].status).toBe('applied');
            expect((await agent.get(`/api/links/${link.uid}`)).status).toBe(
                404
            );
            const { LinkExclusion } = require('../../models');
            expect(
                await LinkExclusion.count({ where: { url: link.url } })
            ).toBe(1);
        });

        it('refuses a project of someone else', async () => {
            const { Project } = require('../../models');
            const owner = await createTestUser({ email: 'pro@example.com' });
            const foreign = await Project.create({
                name: 'Pas à moi',
                user_id: owner.id,
            });
            const link = await add();
            const res = await agent
                .patch(`/api/links/${link.uid}`)
                .send({ project_uid: foreign.uid });
            expect(res.status).toBe(400);
        });
    });

    it('keeps the given title once the page has been read', async () => {
        const { body } = await agent
            .post('/api/links')
            .send({ url: 'https://example.com/titre', title: 'Mon titre' });
        await jobs.drain();
        const saved = await Link.findOne({ where: { uid: body.link.uid } });
        expect(saved.title).toBe('Mon titre');
        expect(saved.fetch_status).toBe('done');
        expect(saved.description).toBe('A description');
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
