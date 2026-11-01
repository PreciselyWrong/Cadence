const request = require('supertest');
const app = require('../../app');
const { Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const {
    completeOccurrence,
} = require('../../modules/tasks/operations/recurring');

describe('Recurring task reminders', () => {
    let user, agent;
    const due = new Date('2030-03-15T09:00:00Z');
    const hourBefore = new Date('2030-03-15T08:00:00Z');

    beforeEach(async () => {
        user = await createTestUser({ email: 'rrem@example.com' });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: 'rrem@example.com', password: 'password123' });
    });

    const create = (overrides = {}) =>
        Task.create({
            user_id: user.id,
            name: 'Water the plants',
            status: 0,
            recurrence_type: 'daily',
            recurrence_interval: 1,
            due_date: due,
            reminder_at: hourBefore,
            reminder_sent_at: new Date('2030-03-15T08:00:05Z'),
            ...overrides,
        });

    it('moves the reminder with the due date when the task is completed over the API', async () => {
        const task = await create();

        const response = await agent
            .patch(`/api/task/${task.uid}`)
            .send({ status: 2 });

        expect(response.status).toBe(200);
        await task.reload();
        expect(task.due_date.toISOString()).toBe('2030-03-16T09:00:00.000Z');
        expect(task.reminder_at.toISOString()).toBe('2030-03-16T08:00:00.000Z');
        expect(task.reminder_sent_at).toBeNull();
    });

    it('moves the reminder when the occurrence is skipped', async () => {
        const task = await create();

        const response = await agent.post(
            `/api/task/${task.uid}/skip-occurrence`
        );

        expect(response.status).toBe(200);
        await task.reload();
        expect(task.reminder_at.toISOString()).toBe('2030-03-16T08:00:00.000Z');
        expect(task.reminder_sent_at).toBeNull();
    });

    it('moves the reminder in completeOccurrence', async () => {
        const task = await create();

        await completeOccurrence(task, { userId: user.id });

        await task.reload();
        expect(task.reminder_at.toISOString()).toBe('2030-03-16T08:00:00.000Z');
        expect(task.reminder_sent_at).toBeNull();
    });

    it('leaves tasks without a reminder alone', async () => {
        const task = await create({
            reminder_at: null,
            reminder_sent_at: null,
        });

        await agent.patch(`/api/task/${task.uid}`).send({ status: 2 });

        await task.reload();
        expect(task.reminder_at).toBeNull();
    });
});
