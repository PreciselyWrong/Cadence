const request = require('supertest');
const app = require('../../app');
const { createTestUser } = require('../helpers/testUtils');

describe('Icons on projects and tags', () => {
    let agent;

    beforeEach(async () => {
        await createTestUser({ email: 'icons@example.com' });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: 'icons@example.com', password: 'password123' });
    });

    describe('projects', () => {
        it('stores and returns an icon on create, get and list', async () => {
            const created = await agent
                .post('/api/project')
                .send({ name: 'Garage', icon: 'bike' });
            expect(created.status).toBe(201);
            expect(created.body.icon).toBe('bike');

            const single = await agent.get(`/api/project/${created.body.uid}`);
            expect(single.body.icon).toBe('bike');

            const list = await agent.get('/api/projects');
            const row = list.body.projects.find(
                (p) => p.uid === created.body.uid
            );
            expect(row.icon).toBe('bike');
        });

        it('updates, keeps the icon when omitted, and clears it with null', async () => {
            const { body } = await agent
                .post('/api/project')
                .send({ name: 'Home', icon: 'home' });

            const changed = await agent
                .patch(`/api/project/${body.uid}`)
                .send({ icon: 'smoke-free' });
            expect(changed.body.icon).toBe('smoke-free');

            const renamed = await agent
                .patch(`/api/project/${body.uid}`)
                .send({ name: 'Home 2' });
            expect(renamed.body.icon).toBe('smoke-free');

            const cleared = await agent
                .patch(`/api/project/${body.uid}`)
                .send({ icon: null });
            expect(cleared.body.icon).toBeNull();
        });

        it('rejects an invalid icon with 400', async () => {
            const res = await agent
                .post('/api/project')
                .send({ name: 'Bad', icon: 'Home!' });
            expect(res.status).toBe(400);

            const tooLong = await agent
                .post('/api/project')
                .send({ name: 'Bad', icon: 'a'.repeat(41) });
            expect(tooLong.status).toBe(400);
        });

        it('exposes the icon of a project on its tasks', async () => {
            const project = await agent
                .post('/api/project')
                .send({ name: 'Shown', icon: 'bike' });
            const tag = await agent
                .post('/api/tag')
                .send({ name: 'errands', icon: 'home' });
            await agent.post('/api/task').send({
                name: 'Ride',
                project_uid: project.body.uid,
                tags: [tag.body.name],
            });

            const res = await agent.get('/api/tasks');
            const task = res.body.tasks.find((t) => t.name === 'Ride');
            expect(task.Project.icon).toBe('bike');
            expect(task.tags[0].icon).toBe('home');
        });
    });

    describe('tags', () => {
        it('stores and returns an icon on create, get and list', async () => {
            const created = await agent
                .post('/api/tag')
                .send({ name: 'sport', icon: 'bike' });
            expect(created.body.icon).toBe('bike');

            const single = await agent
                .get('/api/tag')
                .query({ uid: created.body.uid });
            expect(single.body.icon).toBe('bike');

            const list = await agent.get('/api/tags');
            const row = list.body.find((t) => t.uid === created.body.uid);
            expect(row.icon).toBe('bike');
        });

        it('updates, keeps the icon when omitted, and clears it with empty string', async () => {
            const { body } = await agent
                .post('/api/tag')
                .send({ name: 'chores', icon: 'home' });

            const changed = await agent
                .patch(`/api/tag/${body.uid}`)
                .send({ icon: 'bike' });
            expect(changed.body.icon).toBe('bike');

            const pinned = await agent
                .patch(`/api/tag/${body.uid}`)
                .send({ pinned: true });
            expect(pinned.body.icon).toBe('bike');

            const cleared = await agent
                .patch(`/api/tag/${body.uid}`)
                .send({ icon: '' });
            expect(cleared.body.icon).toBeNull();
        });

        it('rejects an invalid icon with 400', async () => {
            const res = await agent
                .post('/api/tag')
                .send({ name: 'bad', icon: 'Home!' });
            expect(res.status).toBe(400);
        });
    });
});
