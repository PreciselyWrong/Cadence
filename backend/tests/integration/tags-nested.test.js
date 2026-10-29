const request = require('supertest');
const app = require('../../app');
const { Tag } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('Nested tags', () => {
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

    describe('parent_uid on create and update', () => {
        it('creates a child tag under a parent and lists parent_uid', async () => {
            const parent = await createTag({ name: 'work' });
            const child = await createTag({
                name: 'meetings',
                parent_uid: parent.body.uid,
            });

            expect(child.status).toBe(201);
            expect(child.body.parent_uid).toBe(parent.body.uid);

            const list = await agent.get('/api/tags');
            const byName = Object.fromEntries(
                list.body.map((t) => [t.name, t])
            );
            expect(byName.meetings.parent_uid).toBe(parent.body.uid);
            expect(byName.work.parent_uid).toBeNull();

            const one = await agent.get(`/api/tag?uid=${child.body.uid}`);
            expect(one.body.parent_uid).toBe(parent.body.uid);
        });

        it('sets and clears a parent with PATCH', async () => {
            const parent = await createTag({ name: 'home' });
            const child = await createTag({ name: 'garden' });

            const set = await agent
                .patch(`/api/tag/${child.body.uid}`)
                .send({ parent_uid: parent.body.uid });
            expect(set.status).toBe(200);
            expect(set.body.parent_uid).toBe(parent.body.uid);

            const cleared = await agent
                .patch(`/api/tag/${child.body.uid}`)
                .send({ parent_uid: null });
            expect(cleared.status).toBe(200);
            expect(cleared.body.parent_uid).toBeNull();
        });

        it('rejects a tag as its own parent', async () => {
            const tag = await createTag({ name: 'self' });
            const res = await agent
                .patch(`/api/tag/${tag.body.uid}`)
                .send({ parent_uid: tag.body.uid });
            expect(res.status).toBe(400);
        });

        it('rejects cycles and a second level of nesting', async () => {
            const a = await createTag({ name: 'a' });
            const b = await createTag({ name: 'b', parent_uid: a.body.uid });

            // a under b would make a cycle
            const cycle = await agent
                .patch(`/api/tag/${a.body.uid}`)
                .send({ parent_uid: b.body.uid });
            expect(cycle.status).toBe(400);

            // c under b would be a second level
            const deep = await createTag({ name: 'c', parent_uid: b.body.uid });
            expect(deep.status).toBe(400);

            // a has children, so it cannot go under another tag
            const other = await createTag({ name: 'other' });
            const parentWithChildren = await agent
                .patch(`/api/tag/${a.body.uid}`)
                .send({ parent_uid: other.body.uid });
            expect(parentWithChildren.status).toBe(400);
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
            expect(row.parent_id).toBeNull();
        });
    });

    describe('filtering by a parent tag', () => {
        let parentUid;

        beforeEach(async () => {
            const parent = await createTag({ name: 'work' });
            parentUid = parent.body.uid;
            await createTag({ name: 'calls', parent_uid: parentUid });
            await createTag({ name: 'unrelated' });
        });

        it('matches tasks tagged with a child tag', async () => {
            await agent
                .post('/api/task')
                .send({ name: 'Parent task', tags: [{ name: 'work' }] });
            await agent
                .post('/api/task')
                .send({ name: 'Child task', tags: [{ name: 'calls' }] });
            await agent
                .post('/api/task')
                .send({ name: 'Other task', tags: [{ name: 'unrelated' }] });

            const res = await agent.get('/api/tasks?tag=work');
            expect(res.status).toBe(200);
            const names = res.body.tasks.map((t) => t.name).sort();
            expect(names).toEqual(['Child task', 'Parent task']);

            const childOnly = await agent.get('/api/tasks?tag=calls');
            expect(childOnly.body.tasks.map((t) => t.name)).toEqual([
                'Child task',
            ]);
        });

        it('matches notes tagged with a child tag', async () => {
            await agent
                .post('/api/note')
                .send({ title: 'Parent note', tags: ['work'] });
            await agent
                .post('/api/note')
                .send({ title: 'Child note', tags: ['calls'] });
            await agent
                .post('/api/note')
                .send({ title: 'Other note', tags: ['unrelated'] });

            const res = await agent.get('/api/notes?tag=work');
            expect(res.status).toBe(200);
            const notes = Array.isArray(res.body) ? res.body : res.body.notes;
            const titles = notes.map((n) => n.title).sort();
            expect(titles).toEqual(['Child note', 'Parent note']);
        });
    });
});
