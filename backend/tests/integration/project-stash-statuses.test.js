const request = require('supertest');
const app = require('../../app');
const { createTestUser } = require('../helpers/testUtils');

describe('Project stash statuses', () => {
    let agent;

    beforeEach(async () => {
        await createTestUser({ email: 'stash@example.com' });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'stash@example.com',
            password: 'password123',
        });
    });

    const create = (name, status) =>
        agent.post('/api/project').send({ name, status });

    const names = (res) => res.body.projects.map((p) => p.name);

    it('stores paused and archived projects', async () => {
        const paused = await create('Parked idea', 'paused');
        const archived = await create('Old work', 'archived');

        expect(paused.status).toBe(201);
        expect(paused.body.status).toBe('paused');
        expect(archived.status).toBe(201);
        expect(archived.body.status).toBe('archived');
    });

    it('moves an active project to the stash and back', async () => {
        const created = await create('Side quest', 'in_progress');

        const parked = await agent
            .patch(`/api/project/${created.body.uid}`)
            .send({ status: 'paused' });
        expect(parked.status).toBe(200);
        expect(parked.body.status).toBe('paused');

        const resumed = await agent
            .patch(`/api/project/${created.body.uid}`)
            .send({ status: 'in_progress' });
        expect(resumed.body.status).toBe('in_progress');
    });

    it('lists the stash with the paused filter only', async () => {
        await create('Active one', 'in_progress');
        await create('Parked one', 'paused');
        await create('Archived one', 'archived');

        const res = await agent.get('/api/projects?status=paused');

        expect(res.status).toBe(200);
        expect(names(res)).toEqual(['Parked one']);
    });

    it('does not count stash or archive as active', async () => {
        await create('Active one', 'in_progress');
        await create('Parked one', 'paused');
        await create('Archived one', 'archived');

        const res = await agent.get('/api/projects?active=true');

        expect(names(res)).toEqual(['Active one']);
    });

    it('rejects an unknown status filter', async () => {
        const res = await agent.get('/api/projects?status=someday');
        expect(res.status).toBe(400);
    });
});
