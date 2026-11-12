'use strict';

// Horizon month: a task can be committed to a calendar month ("This month",
// "Next month"). Like week_of, it is not a due date and syncs with the task.
const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const { Task, DailyPlan, DailyPlanItem } = require('../../models');
const { weekStart } = require('../../modules/review/fields');
const { createTestUser } = require('../helpers/testUtils');
const registry = require('../../modules/sync/registry');

const TZ = 'Europe/Zurich';

describe('month_of', () => {
    let user;
    let agent;

    beforeEach(async () => {
        user = await createTestUser({
            email: `month_${Date.now()}@test.com`,
            timezone: TZ,
        });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });
    });

    const monthStart = (offset) =>
        moment
            .tz(TZ)
            .startOf('month')
            .add(offset, 'months')
            .format('YYYY-MM-DD');

    const newTask = (name) =>
        Task.create({ user_id: user.id, name, status: 0 });

    it('commits a task to this month or next month', async () => {
        const task = await newTask('Ce mois');
        let res = await agent
            .patch(`/api/task/${task.uid}`)
            .send({ month_of: 'this_month' });
        expect(res.status).toBe(200);
        expect(res.body.month_of).toBe(monthStart(0));

        res = await agent
            .patch(`/api/task/${task.uid}`)
            .send({ month_of: 'next_month' });
        expect(res.status).toBe(200);
        expect(res.body.month_of).toBe(monthStart(1));
    });

    it('normalizes a date to the first day of its month', async () => {
        const task = await newTask('Date');
        const res = await agent
            .patch(`/api/task/${task.uid}`)
            .send({ month_of: '2030-03-17' });
        expect(res.status).toBe(200);
        expect(res.body.month_of).toBe('2030-03-01');
        expect((await Task.findByPk(task.id)).month_of).toBe('2030-03-01');
    });

    it('is not a due date', async () => {
        const task = await newTask('Pas une échéance');
        await agent
            .patch(`/api/task/${task.uid}`)
            .send({ month_of: 'this_month' });
        await task.reload();
        expect(task.due_date).toBeNull();
    });

    it('clears the month on null or an empty value', async () => {
        const task = await newTask('Retirer');
        await agent
            .patch(`/api/task/${task.uid}`)
            .send({ month_of: '2030-03-01' });
        for (const value of [null, '']) {
            const res = await agent
                .patch(`/api/task/${task.uid}`)
                .send({ month_of: value });
            expect(res.status).toBe(200);
            expect(res.body.month_of).toBeNull();
        }
    });

    it('refuses a malformed month with a clear 400', async () => {
        const task = await newTask('Mauvais');
        for (const value of ['2030-13-01', 'this_week', 'soon']) {
            const res = await agent
                .patch(`/api/task/${task.uid}`)
                .send({ month_of: value });
            expect(res.status).toBe(400);
            expect(res.body.error || res.body.message).toMatch(
                /month_of must be/
            );
        }
    });

    it('later takes the task out of its month', async () => {
        const task = await newTask('Plus tard');
        await agent
            .patch(`/api/task/${task.uid}`)
            .send({ month_of: 'this_month' });
        const res = await agent
            .patch(`/api/task/${task.uid}`)
            .send({ later: true });
        expect(res.status).toBe(200);
        expect(res.body.month_of).toBeNull();
    });

    it('brings back a loose task from the 1st of its month, like a past « This week »', async () => {
        const create = (name, month_of) =>
            Task.create({ user_id: user.id, name, status: 0, month_of });
        await create('Mois passé', '2020-01-01');
        await create('Ce mois', monthStart(0));
        await create('Mois prochain', monthStart(1));

        const res = await agent.get('/api/tasks?type=unsorted');
        expect(res.status).toBe(200);
        expect(res.body.tasks.map((task) => task.name).sort()).toEqual([
            'Ce mois',
            'Mois passé',
        ]);
    });

    it('keeps a task of this month out once planned, dated or done', async () => {
        const create = (name, extra = {}) =>
            Task.create({
                user_id: user.id,
                name,
                status: 0,
                month_of: monthStart(0),
                ...extra,
            });
        await create('À planifier');
        const planned = await create('Planifiée demain');
        await create('Datée', { due_date: new Date('2030-03-17T10:00:00Z') });
        await create('Faite', { status: 2 });
        await create('Cette semaine', {
            week_of: weekStart(moment.tz(TZ).format('YYYY-MM-DD'), 1),
        });
        const tomorrow = moment.tz(TZ).add(1, 'day').format('YYYY-MM-DD');
        const plan = await DailyPlan.create({
            user_id: user.id,
            plan_date: tomorrow,
        });
        await DailyPlanItem.create({
            daily_plan_id: plan.id,
            task_id: planned.id,
        });

        const res = await agent.get('/api/tasks?type=unsorted');
        expect(res.body.tasks.map((task) => task.name)).toEqual([
            'À planifier',
        ]);
    });

    it('travels through sync', async () => {
        expect(registry.ENTITIES.task.fields).toContain('month_of');

        const task = await newTask('Synchro');
        await agent
            .patch(`/api/task/${task.uid}`)
            .send({ month_of: 'next_month' });
        const snap = await agent.get('/api/v1/sync/snapshot?entity=task');
        const row = (snap.body.rows || []).find((r) => r.uid === task.uid);
        expect(row.month_of).toBe(monthStart(1));
    });
});
