const request = require('supertest');
const app = require('../../app');
const { Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

const DAY_MS = 24 * 60 * 60 * 1000;

// Noon UTC keeps each due date on its calendar day for a UTC user.
const atNoonUtc = (daysFromToday) => {
    const date = new Date();
    date.setUTCHours(12, 0, 0, 0);
    return new Date(date.getTime() + daysFromToday * DAY_MS);
};

describe('Smart task counts and the tomorrow list', () => {
    let user, agent;

    beforeEach(async () => {
        user = await createTestUser({
            email: 'smart-counts@example.com',
            timezone: 'UTC',
        });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'smart-counts@example.com',
            password: 'password123',
        });
    });

    const createTask = (overrides) =>
        Task.create({
            user_id: user.id,
            name: 'Task',
            status: Task.STATUS.NOT_STARTED,
            parent_task_id: null,
            recurring_parent_id: null,
            ...overrides,
        });

    describe('GET /api/tasks/smart-counts', () => {
        it('counts open tasks due today, tomorrow and within seven days', async () => {
            await createTask({ name: 'today', due_date: atNoonUtc(0) });
            await createTask({ name: 'tomorrow', due_date: atNoonUtc(1) });
            await createTask({ name: 'day five', due_date: atNoonUtc(5) });
            await createTask({ name: 'day nine', due_date: atNoonUtc(9) });
            await createTask({
                name: 'done today',
                due_date: atNoonUtc(0),
                status: Task.STATUS.DONE,
            });

            const response = await agent.get('/api/tasks/smart-counts');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ today: 1, tomorrow: 1, next7: 3 });
        });

        it('does not count subtasks', async () => {
            const parent = await createTask({
                name: 'parent',
                due_date: atNoonUtc(1),
            });
            await createTask({
                name: 'child',
                due_date: atNoonUtc(1),
                parent_task_id: parent.id,
            });

            const response = await agent.get('/api/tasks/smart-counts');

            expect(response.body.tomorrow).toBe(1);
        });

        it('requires a signed-in user', async () => {
            const response = await request(app).get('/api/tasks/smart-counts');

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/tasks?type=tomorrow', () => {
        it('lists only open tasks due tomorrow', async () => {
            await createTask({ name: 'today', due_date: atNoonUtc(0) });
            await createTask({ name: 'tomorrow', due_date: atNoonUtc(1) });
            await createTask({ name: 'day two', due_date: atNoonUtc(2) });

            const response = await agent
                .get('/api/tasks')
                .query({ type: 'tomorrow' });

            expect(response.status).toBe(200);
            expect(response.body.tasks.map((t) => t.name)).toEqual([
                'tomorrow',
            ]);
        });
    });
});
