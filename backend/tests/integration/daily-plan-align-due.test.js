const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const { Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

const ZONE = 'Europe/Athens';

describe('Planning moves the due date (alignDueToPlan)', () => {
    let user, agent, today, inThreeDays;

    beforeEach(async () => {
        user = await createTestUser({
            email: 'align-due@example.com',
            timezone: ZONE,
        });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'align-due@example.com',
            password: 'password123',
        });
        today = moment.tz(ZONE).format('YYYY-MM-DD');
        inThreeDays = moment.tz(ZONE).add(3, 'day').format('YYYY-MM-DD');
    });

    const endOfDay = (day) => moment.tz(day, ZONE).endOf('day').toDate();
    const makeTask = (attrs = {}) =>
        Task.create({ name: 'A task', user_id: user.id, ...attrs });
    const dueDayOf = async (task) => {
        const fresh = await Task.findByPk(task.id);
        return fresh.due_date
            ? moment(fresh.due_date).tz(ZONE).format('YYYY-MM-DD')
            : null;
    };
    const setAlign = (value) =>
        agent
            .put('/api/daily-plan/suggestions')
            .send({ alignDueToPlan: value });
    const plan = (date, ops) =>
        agent.patch(`/api/daily-plan/${date}`).send({ ops });

    it('is off by default and leaves the due date alone', async () => {
        const settings = await agent.get('/api/daily-plan/suggestions');
        expect(settings.body.settings.alignDueToPlan).toBe(false);

        const task = await makeTask({ due_date: endOfDay(inThreeDays) });
        await plan(today, [{ op: 'add', task_uid: task.uid }]);

        expect(await dueDayOf(task)).toBe(inThreeDays);
    });

    it('when on, planning a task sets its due date to that day', async () => {
        await setAlign(true).expect(200);
        const later = await makeTask({ due_date: endOfDay(inThreeDays) });
        const undated = await makeTask();

        await plan(today, [
            { op: 'add', task_uid: later.uid },
            { op: 'add', task_uid: undated.uid },
        ]).expect(200);

        expect(await dueDayOf(later)).toBe(today);
        expect(await dueDayOf(undated)).toBe(today);
    });

    it('when on, moving a planned task moves its due date', async () => {
        await setAlign(true).expect(200);
        const task = await makeTask({ due_date: endOfDay(today) });
        await plan(today, [{ op: 'add', task_uid: task.uid }]);

        await plan(today, [
            { op: 'move', task_uid: task.uid, to_date: inThreeDays },
        ]).expect(200);

        expect(await dueDayOf(task)).toBe(inThreeDays);
    });

    it('keeps the time of a due date that has one', async () => {
        await setAlign(true).expect(200);
        const at = moment.tz(`${inThreeDays} 14:30`, ZONE).toDate();
        const task = await makeTask({ due_date: at, due_has_time: true });

        await plan(today, [{ op: 'add', task_uid: task.uid }]);

        const fresh = await Task.findByPk(task.id);
        expect(moment(fresh.due_date).tz(ZONE).format('YYYY-MM-DD HH:mm')).toBe(
            `${today} 14:30`
        );
        expect(fresh.due_has_time).toBe(true);
    });

    it('never moves a recurring task', async () => {
        await setAlign(true).expect(200);
        const task = await makeTask({
            due_date: endOfDay(inThreeDays),
            recurrence_type: 'weekly',
        });

        await plan(today, [{ op: 'add', task_uid: task.uid }]);

        expect(await dueDayOf(task)).toBe(inThreeDays);
    });

    it('turning it on aligns the tasks already planned from today on', async () => {
        const planned = await makeTask({ due_date: endOfDay(inThreeDays) });
        const unplanned = await makeTask({ due_date: endOfDay(inThreeDays) });
        await plan(today, [{ op: 'add', task_uid: planned.uid }]);
        expect(await dueDayOf(planned)).toBe(inThreeDays);

        await setAlign(true).expect(200);

        expect(await dueDayOf(planned)).toBe(today);
        expect(await dueDayOf(unplanned)).toBe(inThreeDays);
    });

    it('rejects a value that is not a boolean', async () => {
        const res = await setAlign('yes');
        expect(res.status).toBe(400);
    });
});
