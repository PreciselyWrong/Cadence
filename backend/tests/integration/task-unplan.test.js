const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const { Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

// PATCH /task { unplan: true }: the task leaves every plan from today on
// (a horizon chosen from the task sheet's date chip); earlier days keep it.
describe('PATCH /api/task/:uid unplan', () => {
    let user, agent;
    const zone = 'Europe/Zurich';
    const day = (offset) =>
        moment.tz(zone).add(offset, 'days').format('YYYY-MM-DD');

    beforeEach(async () => {
        user = await createTestUser({
            email: 'unplan@example.com',
            timezone: zone,
        });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'unplan@example.com',
            password: 'password123',
        });
    });

    const plannedOn = async (date) =>
        (
            (await agent.get(`/api/daily-plan?date=${date}`)).body.plan
                ?.items || []
        ).map((item) => item.task_uid);

    it('removes the task from today and later plans only', async () => {
        const task = await Task.create({ name: 'Planned', user_id: user.id });
        const other = await Task.create({ name: 'Other', user_id: user.id });
        for (const date of [day(-1), day(0), day(3)]) {
            const res = await agent.patch(`/api/daily-plan/${date}`).send({
                ops: [
                    { op: 'add', task_uid: task.uid },
                    { op: 'add', task_uid: other.uid },
                ],
            });
            expect(res.status).toBe(200);
        }

        const res = await agent
            .patch(`/api/task/${task.uid}`)
            .send({ unplan: true, week_of: 'next_week', due_date: null });
        expect(res.status).toBe(200);

        expect(await plannedOn(day(-1))).toEqual([task.uid, other.uid]);
        expect(await plannedOn(day(0))).toEqual([other.uid]);
        expect(await plannedOn(day(3))).toEqual([other.uid]);
    });

    it('rejects a value that is not a boolean', async () => {
        const task = await Task.create({ name: 'A', user_id: user.id });
        const res = await agent
            .patch(`/api/task/${task.uid}`)
            .send({ unplan: 'soon' });
        expect(res.status).toBe(400);
    });
});
