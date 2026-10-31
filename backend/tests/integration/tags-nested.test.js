const request = require('supertest');
const app = require('../../app');
const { Tag, Task, Note } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('Tag namespaces', () => {
    let user, agent;

    beforeEach(async () => {
        user = await createTestUser({ email: 'nested@example.com' });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'nested@example.com',
            password: 'password123',
        });
    });

    const createTag = (body) => agent.post('/api/tag').send(body);
    const tagByName = async (name) =>
        Tag.findOne({ where: { user_id: user.id, name } });
    const namesOf = async () =>
        (await Tag.findAll({ where: { user_id: user.id, tag_type: 'user' } }))
            .map((t) => t.name)
            .sort();

    describe('creating a path', () => {
        it('creates a tag at any depth and its missing ancestors', async () => {
            const res = await createTag({ name: 'perso/sport/course' });
            expect(res.status).toBe(201);
            expect(res.body.name).toBe('perso/sport/course');

            expect(await namesOf()).toEqual([
                'perso',
                'perso/sport',
                'perso/sport/course',
            ]);

            const perso = await tagByName('perso');
            const sport = await tagByName('perso/sport');
            const course = await tagByName('perso/sport/course');
            expect(perso.parent_id).toBeNull();
            expect(sport.parent_id).toBe(perso.id);
            expect(course.parent_id).toBe(sport.id);
        });

        it('normalizes whitespace around segments', async () => {
            const res = await createTag({ name: ' perso / sport ' });
            expect(res.status).toBe(201);
            expect(res.body.name).toBe('perso/sport');
        });

        it('rejects an empty segment with 400', async () => {
            const res = await createTag({ name: 'perso//sport' });
            expect(res.status).toBe(400);
        });

        it('creates ancestors when a task is saved with a deep tag', async () => {
            const res = await agent
                .post('/api/task')
                .send({ name: 'Run', tags: [{ name: 'x/y/z' }] });
            expect(res.status).toBe(201);

            expect(await namesOf()).toEqual(['x', 'x/y', 'x/y/z']);
            const task = await Task.findOne({
                where: { uid: res.body.uid },
                include: [Tag],
            });
            expect(task.Tags.map((t) => t.name)).toEqual(['x/y/z']);
        });

        it('exposes parent_uid along the chain', async () => {
            await createTag({ name: 'a/b/c' });
            const list = await agent.get('/api/tags');
            const byName = Object.fromEntries(
                list.body.map((t) => [t.name, t])
            );
            expect(byName['a/b/c'].parent_uid).toBe(byName['a/b'].uid);
            expect(byName['a/b'].parent_uid).toBe(byName.a.uid);
            expect(byName.a.parent_uid).toBeNull();
        });
    });

    describe('parent_uid compatibility', () => {
        it('creates a child by name under parent_uid as a path', async () => {
            const parent = await createTag({ name: 'a' });
            const child = await createTag({
                name: 'b',
                parent_uid: parent.body.uid,
            });

            expect(child.status).toBe(201);
            expect(child.body.name).toBe('a/b');
            expect(child.body.parent_uid).toBe(parent.body.uid);
            expect((await tagByName('a/b')).parent_id).toBe(
                (await tagByName('a')).id
            );
        });

        it('nests a tag two levels deep with parent_uid', async () => {
            const a = await createTag({ name: 'a' });
            const b = await createTag({ name: 'b', parent_uid: a.body.uid });
            const c = await createTag({ name: 'c', parent_uid: b.body.uid });

            expect(c.status).toBe(201);
            expect(c.body.name).toBe('a/b/c');
        });

        it('turns a nested tag into a top-level one when parent_uid is cleared', async () => {
            const a = await createTag({ name: 'a' });
            const child = await createTag({
                name: 'b',
                parent_uid: a.body.uid,
            });

            const cleared = await agent
                .patch(`/api/tag/${child.body.uid}`)
                .send({ parent_uid: null });
            expect(cleared.status).toBe(200);
            expect(cleared.body.name).toBe('b');
            expect(cleared.body.parent_uid).toBeNull();
            expect((await tagByName('b')).parent_id).toBeNull();
        });

        it('moves a top-level tag under another with parent_uid', async () => {
            const home = await createTag({ name: 'home' });
            const garden = await createTag({ name: 'garden' });

            const set = await agent
                .patch(`/api/tag/${garden.body.uid}`)
                .send({ parent_uid: home.body.uid });
            expect(set.status).toBe(200);
            expect(set.body.name).toBe('home/garden');
            expect(set.body.parent_uid).toBe(home.body.uid);
        });

        it('rejects a tag as its own parent', async () => {
            const tag = await createTag({ name: 'self' });
            const res = await agent
                .patch(`/api/tag/${tag.body.uid}`)
                .send({ parent_uid: tag.body.uid });
            expect(res.status).toBe(400);
        });

        it('rejects a parent owned by another user', async () => {
            const otherUser = await createTestUser({
                email: 'other-nested@example.com',
            });
            const foreign = await Tag.create({
                name: 'foreign',
                user_id: otherUser.id,
            });

            const res = await createTag({
                name: 'mine',
                parent_uid: foreign.uid,
            });
            expect(res.status).toBe(403);
        });

        it('rejects an unknown parent', async () => {
            const res = await createTag({
                name: 'orphan',
                parent_uid: 'doesnotexist',
            });
            expect(res.status).toBe(400);
        });
    });

    describe('renaming', () => {
        it('renames the whole subtree at every depth', async () => {
            await createTag({ name: 'a/b/c' });
            const a = await tagByName('a');

            const res = await agent
                .patch(`/api/tag/${a.uid}`)
                .send({ name: 'x' });
            expect(res.status).toBe(200);

            expect(await namesOf()).toEqual(['x', 'x/b', 'x/b/c']);
            const xb = await tagByName('x/b');
            const xbc = await tagByName('x/b/c');
            expect(xb.parent_id).toBe(a.id);
            expect(xbc.parent_id).toBe(xb.id);
        });

        it('answers 409 when a renamed subtree would collide with a tag', async () => {
            await createTag({ name: 'a/b' });
            await createTag({ name: 'x/b' });
            await createTag({ name: 'z' });
            const a = await tagByName('a');

            const res = await agent
                .patch(`/api/tag/${a.uid}`)
                .send({ name: 'x' });
            expect(res.status).toBe(409);
            expect(await tagByName('a/b')).not.toBeNull();
        });

        it('rejects moving a tag under its own descendant', async () => {
            await createTag({ name: 'a/b' });
            const a = await tagByName('a');
            const b = await tagByName('a/b');

            const cycle = await agent
                .patch(`/api/tag/${a.uid}`)
                .send({ parent_uid: b.uid });
            expect(cycle.status).toBe(400);

            const renameInside = await agent
                .patch(`/api/tag/${a.uid}`)
                .send({ name: 'a/z' });
            expect(renameInside.status).toBe(400);
            expect(await namesOf()).toEqual(['a', 'a/b']);
        });
    });

    describe('deleting a parent', () => {
        it('keeps the children as top-level tags', async () => {
            const parent = await createTag({ name: 'parent' });
            const child = await createTag({
                name: 'child',
                parent_uid: parent.body.uid,
            });

            const del = await agent.delete(`/api/tag/${parent.body.uid}`);
            expect(del.status).toBe(200);

            const row = await Tag.findOne({ where: { uid: child.body.uid } });
            expect(row).not.toBeNull();
            expect(row.name).toBe('child');
            expect(row.parent_id).toBeNull();
        });
    });

    describe('filtering by a parent tag', () => {
        beforeEach(async () => {
            await createTag({ name: 'a/b/c' });
            await createTag({ name: 'ab' });
        });

        it('matches tasks tagged at any depth below the tag, not similar names', async () => {
            await agent
                .post('/api/task')
                .send({ name: 'Deep task', tags: [{ name: 'a/b/c' }] });
            await agent
                .post('/api/task')
                .send({ name: 'Similar task', tags: [{ name: 'ab' }] });

            const res = await agent.get('/api/tasks?tag=a');
            expect(res.status).toBe(200);
            expect(res.body.tasks.map((t) => t.name)).toEqual(['Deep task']);

            const middle = await agent.get('/api/tasks?tag=a/b');
            expect(middle.body.tasks.map((t) => t.name)).toEqual(['Deep task']);
        });

        it('matches notes tagged at any depth below the tag', async () => {
            await agent
                .post('/api/note')
                .send({ title: 'Deep note', tags: ['a/b/c'] });
            await agent
                .post('/api/note')
                .send({ title: 'Similar note', tags: ['ab'] });

            const res = await agent.get('/api/notes?tag=a');
            expect(res.status).toBe(200);
            const notes = Array.isArray(res.body) ? res.body : res.body.notes;
            expect(notes.map((n) => n.title)).toEqual(['Deep note']);
        });

        it('keeps AND semantics when a listed tag is nested', async () => {
            await agent.post('/api/task').send({
                name: 'Both',
                tags: [{ name: 'perso/sport/course' }, { name: 'urgent' }],
            });
            await agent.post('/api/task').send({
                name: 'Only nested',
                tags: [{ name: 'perso/sport/course' }],
            });
            await agent.post('/api/task').send({
                name: 'Only urgent',
                tags: [{ name: 'urgent' }],
            });

            const res = await agent
                .get('/api/search')
                .query({ tags: 'perso,urgent', filters: 'Task' });
            expect(res.status).toBe(200);
            const tasks = res.body.results.filter((r) => r.type === 'Task');
            expect(tasks.map((t) => t.name)).toEqual(['Both']);
        });
    });
});
