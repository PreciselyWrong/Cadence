const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const { Task, DailyPlan, DailyPlanItem } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

// A planned task whose due date moves past the planned day leaves that
// day's plan, whatever moved it (Calendar page, task pane, sync, MCP).
describe('Daily plan: a task moved past its planned day', () => {
    const TZ = 'Europe/Athens';
    let user, agent, today, tomorrow, nextWeek;

    beforeEach(async () => {
        user = await createTestUser({
            email: 'leave-on-move@example.com',
            timezone: TZ,
        });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'leave-on-move@example.com',
            password: 'password123',
        });
        today = moment.tz(TZ).format('YYYY-MM-DD');
        tomorrow = moment.tz(TZ).add(1, 'day').format('YYYY-MM-DD');
        nextWeek = moment.tz(TZ).add(7, 'days').format('YYYY-MM-DD');
    });

    const makeTask = async (name, due, attrs = {}) => {
        const res = await agent
            .post('/api/task')
            .send({ name, due_date: due, ...attrs });
        expect(res.status).toBe(201);
        return Task.findOne({ where: { uid: res.body.uid } });
    };

    const plan = async (date, tasks) => {
        const res = await agent.put(`/api/daily-plan/${date}`).send({
            items: tasks.map((task) => ({
                task_uid: task.uid,
                start_minute: null,
            })),
        });
        expect(res.status).toBe(200);
    };

    const plannedUids = async (date) => {
        const res = await agent.get(`/api/daily-plan?date=${date}`);
        return (res.body.plan?.items || []).map((item) => item.task_uid);
    };

    it('takes a task due today off today when its due date moves to a later day', async () => {
        const moved = await makeTask('Write report', today);
        const kept = await makeTask('File receipts', today);
        await plan(today, [moved, kept]);

        const res = await agent
            .patch(`/api/task/${moved.uid}`)
            .send({ due_date: nextWeek });
        expect(res.status).toBe(200);

        expect(await plannedUids(today)).toEqual([kept.uid]);
    });

    it('takes a task off a later planned day it no longer falls on', async () => {
        const task = await makeTask('Call the bank', tomorrow);
        await plan(tomorrow, [task]);

        await agent.patch(`/api/task/${task.uid}`).send({ due_date: nextWeek });

        expect(await plannedUids(tomorrow)).toEqual([]);
    });

    it('keeps a task planned early when its later due date moves again', async () => {
        const task = await makeTask('Draft talk', nextWeek);
        await plan(today, [task]);

        await agent.patch(`/api/task/${task.uid}`).send({
            due_date: moment(nextWeek).add(1, 'day').format('YYYY-MM-DD'),
        });

        expect(await plannedUids(today)).toEqual([task.uid]);
    });

    it('keeps the task when its due date moves earlier or loses its date', async () => {
        const earlier = await makeTask('Earlier', tomorrow);
        const undated = await makeTask('Undated', today);
        await plan(tomorrow, [earlier]);
        await plan(today, [undated]);

        await agent.patch(`/api/task/${earlier.uid}`).send({ due_date: today });
        await agent.patch(`/api/task/${undated.uid}`).send({ due_date: null });

        expect(await plannedUids(tomorrow)).toEqual([earlier.uid]);
        expect(await plannedUids(today)).toEqual([undated.uid]);
    });

    it('never rewrites a past day', async () => {
        const yesterday = moment.tz(TZ).subtract(1, 'day').format('YYYY-MM-DD');
        const task = await makeTask('Old', yesterday);
        const past = await DailyPlan.create({
            user_id: user.id,
            plan_date: yesterday,
        });
        await DailyPlanItem.create({
            daily_plan_id: past.id,
            task_id: task.id,
            position: 0,
        });

        await agent.patch(`/api/task/${task.uid}`).send({ due_date: nextWeek });

        expect(
            await DailyPlanItem.count({ where: { daily_plan_id: past.id } })
        ).toBe(1);
    });

    it('leaves a recurring task in the plan when it moves on to its next occurrence', async () => {
        const task = await makeTask('Water plants', today, {
            recurrence_type: 'daily',
        });
        await plan(today, [task]);

        await agent.patch(`/api/task/${task.uid}`).send({ status: 'done' });

        expect(await plannedUids(today)).toEqual([task.uid]);
    });
});
