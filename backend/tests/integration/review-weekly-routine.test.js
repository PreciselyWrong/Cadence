const request = require('supertest');
const app = require('../../app');
const { Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('Weekly review routine', () => {
    let user, agent;

    beforeEach(async () => {
        user = await createTestUser({ email: 'weekly-routine@example.com' });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'weekly-routine@example.com',
            password: 'password123',
        });
    });

    const exists = async () =>
        (await agent.get('/api/review/weekly-routine')).body.exists;

    it('is absent until the user asks for it', async () => {
        expect(await exists()).toBe(false);
        expect(await Task.count({ where: { user_id: user.id } })).toBe(0);
    });

    it('creates a weekly Friday task whose note links to the review', async () => {
        const res = await agent
            .post('/api/review/weekly-routine')
            .send({ name: 'Revue hebdomadaire' });

        expect(res.status).toBe(201);
        expect(res.body.created).toBe(true);
        const task = await Task.findOne({ where: { uid: res.body.task.uid } });
        expect(task.name).toBe('Revue hebdomadaire');
        expect(task.recurrence_type).toBe('weekly');
        expect(task.recurrence_interval).toBe(1);
        expect(task.recurrence_weekday).toBe(5);
        expect(task.note).toContain('/review');
        expect(task.reminder_at ?? null).toBeNull();
        expect(await exists()).toBe(true);
    });

    it('uses a default name when none is sent', async () => {
        const res = await agent.post('/api/review/weekly-routine').send({});
        expect(res.status).toBe(201);
        expect(res.body.task.name).toBe('Weekly review');
    });

    it('creates it only once', async () => {
        await agent.post('/api/review/weekly-routine').send({});
        const again = await agent.post('/api/review/weekly-routine').send({});

        expect(again.status).toBe(200);
        expect(again.body.created).toBe(false);
        expect(await Task.count({ where: { user_id: user.id } })).toBe(1);
    });

    it('counts a weekly task the user already linked to the review', async () => {
        await Task.create({
            name: 'My own routine',
            user_id: user.id,
            recurrence_type: 'weekly',
            recurrence_interval: 1,
            note: 'Open [the review](/review) and decide.',
        });

        expect(await exists()).toBe(true);
        const res = await agent.post('/api/review/weekly-routine').send({});
        expect(res.body.created).toBe(false);
    });

    it('does not count a finished routine or another weekly task', async () => {
        await Task.create({
            name: 'Cleaning',
            user_id: user.id,
            recurrence_type: 'weekly',
            recurrence_interval: 1,
            note: 'Kitchen',
        });
        await Task.create({
            name: 'Old routine',
            user_id: user.id,
            recurrence_type: 'weekly',
            recurrence_interval: 1,
            note: '[/review](/review)',
            status: Task.STATUS.ARCHIVED,
        });

        expect(await exists()).toBe(false);
    });

    it("does not see another user's routine", async () => {
        const other = await createTestUser({
            email: 'weekly-other@example.com',
        });
        await Task.create({
            name: 'Theirs',
            user_id: other.id,
            recurrence_type: 'weekly',
            recurrence_interval: 1,
            note: '[/review](/review)',
        });

        expect(await exists()).toBe(false);
    });
});
