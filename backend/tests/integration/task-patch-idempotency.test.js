const request = require('supertest');
const app = require('../../app');
const { Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

// The desktop's "Terminé" button retries a lost answer with the same key: a
// recurring task must advance once, not twice.
describe('PATCH /api/task/:uid with Idempotency-Key', () => {
    let agent;

    beforeEach(async () => {
        await createTestUser({ email: 'test@example.com' });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'test@example.com',
            password: 'password123',
        });
    });

    async function dailyTask() {
        const today = new Date().toISOString().split('T')[0];
        const created = await agent.post('/api/task').send({
            name: 'Water the plants',
            recurrence_type: 'daily',
            recurrence_interval: 1,
            due_date: today,
        });
        expect(created.status).toBe(201);
        return created.body.uid;
    }

    it('completes a recurring task once when the same key is sent twice', async () => {
        const uid = await dailyTask();
        const before = (await Task.findOne({ where: { uid } })).due_date;

        const first = await agent
            .patch(`/api/task/${uid}`)
            .set('Idempotency-Key', 'done-1')
            .send({ status: 2 });
        const afterFirst = (await Task.findOne({ where: { uid } })).due_date;
        const retry = await agent
            .patch(`/api/task/${uid}`)
            .set('Idempotency-Key', 'done-1')
            .send({ status: 2 });
        const afterRetry = (await Task.findOne({ where: { uid } })).due_date;

        expect(first.status).toBe(200);
        expect(retry.status).toBe(200);
        expect(retry.headers['idempotent-replayed']).toBe('true');
        expect(new Date(afterFirst).getTime()).toBeGreaterThan(
            new Date(before).getTime()
        );
        expect(new Date(afterRetry).getTime()).toBe(
            new Date(afterFirst).getTime()
        );
    });

    it('applies every PATCH sent without a key', async () => {
        const uid = await dailyTask();
        await agent.patch(`/api/task/${uid}`).send({ status: 2 });
        const once = (await Task.findOne({ where: { uid } })).due_date;
        await agent.patch(`/api/task/${uid}`).send({ status: 2 });
        const twice = (await Task.findOne({ where: { uid } })).due_date;

        expect(new Date(twice).getTime()).toBeGreaterThan(
            new Date(once).getTime()
        );
    });
});
