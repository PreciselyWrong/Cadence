const request = require('supertest');
const app = require('../../app');
const { Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('GET /api/tasks?type=calendar recurring occurrences', () => {
    let user, agent;

    beforeEach(async () => {
        user = await createTestUser({ email: 'calrec@example.com' });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'calrec@example.com',
            password: 'password123',
        });
    });

    const weekly = (overrides = {}) =>
        Task.create({
            user_id: user.id,
            name: 'Team sync',
            status: 0,
            recurrence_type: 'weekly',
            recurrence_interval: 1,
            due_date: new Date('2030-03-04T12:00:00Z'),
            ...overrides,
        });

    const occurrencesOf = (body, id) =>
        body.tasks.filter((t) => t.id === id && t.is_virtual_occurrence);

    it('adds the later occurrences up to the end day', async () => {
        const task = await weekly();

        const res = await agent.get(
            '/api/tasks?type=calendar&start=2030-03-01&end=2030-03-31'
        );

        expect(res.status).toBe(200);
        const parent = res.body.tasks.filter(
            (t) => t.id === task.id && !t.is_virtual_occurrence
        );
        expect(parent).toHaveLength(1);
        expect(occurrencesOf(res.body, task.id).map((t) => t.due_date)).toEqual(
            ['2030-03-11', '2030-03-18', '2030-03-25']
        );
    });

    it('adds nothing without an end day', async () => {
        const task = await weekly();
        const res = await agent.get('/api/tasks?type=calendar');
        expect(occurrencesOf(res.body, task.id)).toHaveLength(0);
    });

    it('stops at the recurrence end date', async () => {
        const task = await weekly({
            recurrence_end_date: new Date('2030-03-12T00:00:00Z'),
        });
        const res = await agent.get(
            '/api/tasks?type=calendar&start=2030-03-01&end=2030-03-31'
        );
        expect(occurrencesOf(res.body, task.id).map((t) => t.due_date)).toEqual(
            ['2030-03-11']
        );
    });

    it('adds no occurrences for a done recurring task', async () => {
        const task = await weekly({ status: 2 });
        const res = await agent.get(
            '/api/tasks?type=calendar&start=2030-03-01&end=2030-03-31'
        );
        expect(occurrencesOf(res.body, task.id)).toHaveLength(0);
    });

    it('lists undated tasks for the arrange panel', async () => {
        const task = await Task.create({
            user_id: user.id,
            name: 'Someday',
            status: 0,
        });
        const res = await agent.get(
            '/api/tasks?type=calendar&start=2030-03-01&end=2030-03-31'
        );
        const listed = res.body.tasks.find((t) => t.id === task.id);
        expect(listed).toBeDefined();
        expect(listed.due_date).toBeNull();
        expect(listed).toHaveProperty('tags');
    });
});
