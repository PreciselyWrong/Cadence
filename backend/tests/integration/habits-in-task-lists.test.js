const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const { Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

// Habits stored as tasks (before Cadence habits) stay in the database but are
// no longer tasks: they were imported once, and no list shows them.
describe('Habit tasks left over from before Cadence habits', () => {
    let agent;
    let user;
    const today = moment.utc().format('YYYY-MM-DD');

    beforeEach(async () => {
        user = await createTestUser({
            email: 'habit-lists@example.com',
            timezone: 'UTC',
        });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'habit-lists@example.com',
            password: 'password123',
        });
        await Task.create({
            name: 'Old habit',
            user_id: user.id,
            habit_mode: true,
            recurrence_type: 'daily',
            due_date: new Date(),
            status: Task.STATUS.IN_PROGRESS,
        });
        await Task.create({
            name: 'Plain task',
            user_id: user.id,
            due_date: new Date(),
            status: Task.STATUS.IN_PROGRESS,
        });
    });

    const names = (tasks) => tasks.map((t) => t.original_name ?? t.name);

    it('keeps the habit task in the database', async () => {
        expect(
            await Task.count({
                where: { user_id: user.id, habit_mode: true },
            })
        ).toBe(1);
    });

    it('leaves it out of All tasks', async () => {
        const res = await agent
            .get('/api/tasks')
            .query({ type: 'all', status: 'active' });
        expect(res.status).toBe(200);
        expect(names(res.body.tasks)).toContain('Plain task');
        expect(names(res.body.tasks)).not.toContain('Old habit');
    });

    it('leaves it out of Today', async () => {
        const res = await agent.get('/api/tasks').query({ type: 'today' });
        expect(res.status).toBe(200);
        expect(names(res.body.tasks)).toContain('Plain task');
        expect(names(res.body.tasks)).not.toContain('Old habit');
    });

    it('leaves it out of Upcoming', async () => {
        const res = await agent.get('/api/tasks').query({
            type: 'upcoming',
            groupBy: 'day',
            maxDays: 7,
            include_subtasks: 'true',
        });
        expect(res.status).toBe(200);
        expect(names(res.body.tasks)).toContain('Plain task');
        expect(names(res.body.tasks)).not.toContain('Old habit');
    });

    it('leaves it out of the calendar', async () => {
        const end = moment.utc().add(6, 'days').format('YYYY-MM-DD');
        const res = await agent
            .get('/api/tasks')
            .query({ type: 'calendar', start: today, end });
        expect(res.status).toBe(200);
        expect(names(res.body.tasks)).toContain('Plain task');
        expect(names(res.body.tasks)).not.toContain('Old habit');
    });

    it('leaves it out of the planner suggestions', async () => {
        const res = await agent.get('/api/daily-plan/candidates');
        expect(res.status).toBe(200);
        const all = [
            ...res.body.suggested,
            ...res.body.due_today,
            ...res.body.overdue,
            ...res.body.in_progress,
        ];
        expect(names(all)).toContain('Plain task');
        expect(names(all)).not.toContain('Old habit');
    });
});
