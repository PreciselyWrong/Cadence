const request = require('supertest');
const app = require('../../app');
const { Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const {
    completeOccurrence,
} = require('../../modules/tasks/operations/recurring');

// A recurring task with a time block (start 14:00, due 15:00) must keep that
// block on each new occurrence. A start left behind on the first occurrence
// turns the task into a bar spanning weeks in the calendar.
describe('Recurring task start dates', () => {
    let user, agent;

    beforeEach(async () => {
        user = await createTestUser({ email: 'rstart@example.com' });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: 'rstart@example.com', password: 'password123' });
    });

    const create = (overrides = {}) =>
        Task.create({
            user_id: user.id,
            name: 'Sport',
            status: 0,
            recurrence_type: 'daily',
            recurrence_interval: 1,
            due_date: new Date('2030-03-15T15:00:00Z'),
            due_has_time: true,
            start_date: new Date('2030-03-15T14:00:00Z'),
            start_has_time: true,
            ...overrides,
        });

    it('moves the start with the due date when the task is completed over the API', async () => {
        const task = await create();

        const response = await agent
            .patch(`/api/task/${task.uid}`)
            .send({ status: 2 });

        expect(response.status).toBe(200);
        await task.reload();
        expect(task.due_date.toISOString()).toBe('2030-03-16T15:00:00.000Z');
        expect(task.start_date.toISOString()).toBe('2030-03-16T14:00:00.000Z');
    });

    it('moves the start when the occurrence is skipped', async () => {
        const task = await create();

        const response = await agent.post(
            `/api/task/${task.uid}/skip-occurrence`
        );

        expect(response.status).toBe(200);
        await task.reload();
        expect(task.start_date.toISOString()).toBe('2030-03-16T14:00:00.000Z');
    });

    it('moves the start in completeOccurrence', async () => {
        const task = await create();

        await completeOccurrence(task, { userId: user.id });

        await task.reload();
        expect(task.start_date.toISOString()).toBe('2030-03-16T14:00:00.000Z');
    });

    it('moves the start with the whole series', async () => {
        const task = await create();

        const response = await agent
            .post(`/api/task/${task.uid}/edit-occurrence`)
            .send({
                scope: 'all',
                occurrence_date: '2030-03-15',
                changes: { due_date: '2030-03-17', due_time: '15:00' },
            });

        expect(response.status).toBe(200);
        await task.reload();
        expect(task.start_date.toISOString()).toBe('2030-03-17T14:00:00.000Z');
    });

    it('leaves tasks without a start alone', async () => {
        const task = await create({ start_date: null, start_has_time: false });

        await agent.patch(`/api/task/${task.uid}`).send({ status: 2 });

        await task.reload();
        expect(task.start_date).toBeNull();
    });
});
