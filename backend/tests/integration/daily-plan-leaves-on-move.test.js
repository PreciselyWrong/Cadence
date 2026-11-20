const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const { Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

// A one-off task whose due date moves past a planned day (today or later)
// leaves that day's plan, whatever changed it (task API, sync push, MCP).
// A recurring task keeps its plan: the clients ask first, then send unplan.
describe('Daily plan: a due date moved later leaves the planned day', () => {
    const TZ = 'Europe/Athens';
    let agent, today, tomorrow, nextWeek;

    beforeEach(async () => {
        await createTestUser({
            email: 'leaves-on-move@example.com',
            timezone: TZ,
        });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'leaves-on-move@example.com',
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

    it('takes a task off today when its due date moves to a later day', async () => {
        const moved = await makeTask('Write report', today);
        const kept = await makeTask('File receipts', today);
        await plan(today, [moved, kept]);

        const res = await agent
            .patch(`/api/task/${moved.uid}`)
            .send({ due_date: nextWeek });
        expect(res.status).toBe(200);

        expect(await plannedUids(today)).toEqual([kept.uid]);
    });

    it('takes a task off a later planned day when its due date moves past it', async () => {
        const task = await makeTask('Call the bank', tomorrow);
        await plan(tomorrow, [task]);

        await agent.patch(`/api/task/${task.uid}`).send({ due_date: nextWeek });

        expect(await plannedUids(tomorrow)).toEqual([]);
    });

    it('takes a task planned early off today when its later due date moves again', async () => {
        const task = await makeTask('Draft talk', nextWeek);
        await plan(today, [task]);

        await agent.patch(`/api/task/${task.uid}`).send({
            due_date: moment(nextWeek).add(1, 'day').format('YYYY-MM-DD'),
        });

        expect(await plannedUids(today)).toEqual([]);
    });

    it('keeps a task planned on its new due day', async () => {
        const task = await makeTask('Renew domain', today);
        await plan(nextWeek, [task]);

        await agent.patch(`/api/task/${task.uid}`).send({ due_date: nextWeek });

        expect(await plannedUids(nextWeek)).toEqual([task.uid]);
    });

    it('keeps a recurring task on today when its due date moves', async () => {
        const task = await makeTask('Water plants', today, {
            recurrence_type: 'weekly',
        });
        await plan(today, [task]);

        await agent.patch(`/api/task/${task.uid}`).send({ due_date: nextWeek });

        expect(await plannedUids(today)).toEqual([task.uid]);
    });

    it('takes a recurring task off today when the client sends unplan', async () => {
        const task = await makeTask('Water plants', today, {
            recurrence_type: 'weekly',
        });
        await plan(today, [task]);

        await agent
            .patch(`/api/task/${task.uid}`)
            .send({ due_date: nextWeek, unplan: true });

        expect(await plannedUids(today)).toEqual([]);
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

    it('takes a task off today when a sync push moves its due date later', async () => {
        const task = await makeTask('Pay invoice', today);
        await plan(today, [task]);

        const clock = `${String(Date.now()).padStart(13, '0')}-0000-devA`;
        const res = await agent.post('/api/v1/sync/push').send({
            ops: [
                {
                    op_id: 'leaves-on-move-push',
                    entity: 'task',
                    uid: task.uid,
                    action: 'upsert',
                    fields: {
                        due_date: {
                            value: moment.tz(nextWeek, TZ).toISOString(),
                            hlc: clock,
                        },
                    },
                },
            ],
        });
        expect(res.body.results[0].status).toBe('applied');

        expect(await plannedUids(today)).toEqual([]);
    });
});
