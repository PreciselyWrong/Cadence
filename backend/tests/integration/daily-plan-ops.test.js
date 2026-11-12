const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const { Task, DailyPlan, DailyPlanItem } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('Daily plan operations (PATCH, ETag, If-Match)', () => {
    let user, agent, today, tomorrow;

    beforeEach(async () => {
        user = await createTestUser({
            email: 'ops-planner@example.com',
            timezone: 'Europe/Athens',
        });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'ops-planner@example.com',
            password: 'password123',
        });
        today = moment.tz('Europe/Athens').format('YYYY-MM-DD');
        tomorrow = moment
            .tz('Europe/Athens')
            .add(1, 'day')
            .format('YYYY-MM-DD');
    });

    const makeTask = (attrs = {}) =>
        Task.create({ name: 'A task', user_id: user.id, ...attrs });

    const patchOps = (date, ops, headers = {}) => {
        const req = agent.patch(`/api/daily-plan/${date}`);
        Object.entries(headers).forEach(([key, value]) => req.set(key, value));
        return req.send({ ops });
    };

    const getPlan = async (date = today) =>
        (await agent.get(`/api/daily-plan?date=${date}`)).body;

    const itemsOf = (body) =>
        (body.plan?.items || []).map((item) => ({
            task_uid: item.task_uid,
            position: item.position,
            start_minute: item.start_minute,
            duration_minutes: item.duration_minutes,
        }));

    describe('operations', () => {
        it('add appends the task with its estimate as duration', async () => {
            const a = await makeTask({ estimated_minutes: 45 });
            const b = await makeTask();

            const res = await patchOps(today, [
                { op: 'add', task_uid: a.uid },
                { op: 'add', task_uid: b.uid, start_minute: 600 },
            ]);

            expect(res.status).toBe(200);
            expect(itemsOf(res.body)).toEqual([
                {
                    task_uid: a.uid,
                    position: 0,
                    start_minute: null,
                    duration_minutes: 45,
                },
                {
                    task_uid: b.uid,
                    position: 1,
                    start_minute: 600,
                    duration_minutes: 30,
                },
            ]);
        });

        it('add of a task already planned updates it instead of duplicating', async () => {
            const a = await makeTask();
            await patchOps(today, [{ op: 'add', task_uid: a.uid }]);

            const res = await patchOps(today, [
                {
                    op: 'add',
                    task_uid: a.uid,
                    start_minute: 540,
                    duration_minutes: 90,
                },
            ]);

            expect(itemsOf(res.body)).toEqual([
                {
                    task_uid: a.uid,
                    position: 0,
                    start_minute: 540,
                    duration_minutes: 90,
                },
            ]);
            expect(await DailyPlanItem.count()).toBe(1);
        });

        it('add before another item inserts it there', async () => {
            const a = await makeTask();
            const b = await makeTask();
            const c = await makeTask();
            await patchOps(today, [
                { op: 'add', task_uid: a.uid },
                { op: 'add', task_uid: b.uid },
            ]);

            const res = await patchOps(today, [
                { op: 'add', task_uid: c.uid, before_uid: b.uid },
            ]);

            expect(res.body.plan.items.map((i) => i.task_uid)).toEqual([
                a.uid,
                c.uid,
                b.uid,
            ]);
            expect(res.body.plan.items.map((i) => i.position)).toEqual([
                0, 1, 2,
            ]);
        });

        it('remove drops the line and ignores a task that is not planned', async () => {
            const a = await makeTask();
            const b = await makeTask();
            await patchOps(today, [
                { op: 'add', task_uid: a.uid },
                { op: 'add', task_uid: b.uid },
            ]);

            const res = await patchOps(today, [
                { op: 'remove', task_uid: a.uid },
                { op: 'remove', task_uid: a.uid },
            ]);

            expect(res.status).toBe(200);
            expect(res.body.plan.items.map((i) => i.task_uid)).toEqual([b.uid]);
        });

        it('slot sets the time and adds the task when it is absent', async () => {
            const a = await makeTask();

            const res = await patchOps(today, [
                {
                    op: 'slot',
                    task_uid: a.uid,
                    start_minute: 480,
                    duration_minutes: 60,
                },
            ]);

            expect(itemsOf(res.body)).toEqual([
                {
                    task_uid: a.uid,
                    position: 0,
                    start_minute: 480,
                    duration_minutes: 60,
                },
            ]);
        });

        it('unslot clears the time and keeps the item on the day', async () => {
            const a = await makeTask();
            await patchOps(today, [
                { op: 'slot', task_uid: a.uid, start_minute: 480 },
            ]);

            const res = await patchOps(today, [
                { op: 'unslot', task_uid: a.uid },
            ]);

            expect(itemsOf(res.body)).toEqual([
                {
                    task_uid: a.uid,
                    position: 0,
                    start_minute: null,
                    duration_minutes: 30,
                },
            ]);
        });

        it('resize changes only the duration', async () => {
            const a = await makeTask();
            await patchOps(today, [
                { op: 'slot', task_uid: a.uid, start_minute: 480 },
            ]);

            const res = await patchOps(today, [
                { op: 'resize', task_uid: a.uid, duration_minutes: 75 },
            ]);

            expect(itemsOf(res.body)[0]).toMatchObject({
                start_minute: 480,
                duration_minutes: 75,
            });
        });

        it('reorder moves the task before another and renumbers positions', async () => {
            const a = await makeTask();
            const b = await makeTask();
            const c = await makeTask();
            await patchOps(today, [
                { op: 'add', task_uid: a.uid },
                { op: 'add', task_uid: b.uid },
                { op: 'add', task_uid: c.uid },
            ]);

            const res = await patchOps(today, [
                { op: 'reorder', task_uid: c.uid, before_uid: a.uid },
            ]);

            expect(itemsOf(res.body)).toEqual([
                {
                    task_uid: c.uid,
                    position: 0,
                    start_minute: null,
                    duration_minutes: 30,
                },
                {
                    task_uid: a.uid,
                    position: 1,
                    start_minute: null,
                    duration_minutes: 30,
                },
                {
                    task_uid: b.uid,
                    position: 2,
                    start_minute: null,
                    duration_minutes: 30,
                },
            ]);
        });

        it('reorder with a null before_uid sends the task to the end', async () => {
            const a = await makeTask();
            const b = await makeTask();
            await patchOps(today, [
                { op: 'add', task_uid: a.uid },
                { op: 'add', task_uid: b.uid },
            ]);

            const res = await patchOps(today, [
                { op: 'reorder', task_uid: a.uid, before_uid: null },
            ]);

            expect(res.body.plan.items.map((i) => i.task_uid)).toEqual([
                b.uid,
                a.uid,
            ]);
        });

        it('move takes the line to another day, keeping its duration', async () => {
            const a = await makeTask();
            const b = await makeTask();
            const c = await makeTask();
            await patchOps(today, [
                {
                    op: 'slot',
                    task_uid: a.uid,
                    start_minute: 480,
                    duration_minutes: 50,
                },
                { op: 'add', task_uid: b.uid },
            ]);
            await patchOps(tomorrow, [{ op: 'add', task_uid: c.uid }]);

            const res = await patchOps(today, [
                { op: 'move', task_uid: a.uid, to_date: tomorrow },
            ]);

            expect(res.status).toBe(200);
            expect(res.body.plan.items.map((i) => i.task_uid)).toEqual([b.uid]);
            const next = await getPlan(tomorrow);
            expect(itemsOf(next)).toEqual([
                {
                    task_uid: c.uid,
                    position: 0,
                    start_minute: null,
                    duration_minutes: 30,
                },
                {
                    task_uid: a.uid,
                    position: 1,
                    start_minute: null,
                    duration_minutes: 50,
                },
            ]);
        });

        it('move to a day that already holds the task keeps the existing line', async () => {
            const a = await makeTask();
            await patchOps(today, [
                {
                    op: 'slot',
                    task_uid: a.uid,
                    start_minute: 480,
                    duration_minutes: 50,
                },
            ]);
            await patchOps(tomorrow, [
                {
                    op: 'slot',
                    task_uid: a.uid,
                    start_minute: 600,
                    duration_minutes: 20,
                },
            ]);

            await patchOps(today, [
                { op: 'move', task_uid: a.uid, to_date: tomorrow },
            ]);

            expect(itemsOf(await getPlan())).toEqual([]);
            expect(itemsOf(await getPlan(tomorrow))).toEqual([
                {
                    task_uid: a.uid,
                    position: 0,
                    start_minute: 600,
                    duration_minutes: 20,
                },
            ]);
        });

        it('never writes task fields', async () => {
            const a = await makeTask({
                estimated_minutes: 40,
                due_date: new Date('2030-01-02T10:00:00Z'),
            });

            await patchOps(today, [
                {
                    op: 'slot',
                    task_uid: a.uid,
                    start_minute: 480,
                    duration_minutes: 15,
                },
            ]);

            const fresh = await Task.findByPk(a.id);
            expect(fresh.estimated_minutes).toBe(40);
            expect(fresh.due_date.toISOString()).toBe(
                '2030-01-02T10:00:00.000Z'
            );
        });
    });

    describe('validation and atomicity', () => {
        it('lets a slot overlap an existing timed item', async () => {
            const a = await makeTask();
            const b = await makeTask();
            await patchOps(today, [
                {
                    op: 'slot',
                    task_uid: a.uid,
                    start_minute: 540,
                    duration_minutes: 60,
                },
            ]);

            const res = await patchOps(today, [
                {
                    op: 'slot',
                    task_uid: b.uid,
                    start_minute: 570,
                    duration_minutes: 30,
                },
            ]);

            expect(res.status).toBe(200);
            expect(itemsOf(await getPlan())).toEqual([
                {
                    task_uid: a.uid,
                    position: 0,
                    start_minute: 540,
                    duration_minutes: 60,
                },
                {
                    task_uid: b.uid,
                    position: 1,
                    start_minute: 570,
                    duration_minutes: 30,
                },
            ]);
        });

        it('applies nothing when a later op is invalid', async () => {
            const a = await makeTask();
            const b = await makeTask();

            const res = await patchOps(today, [
                { op: 'add', task_uid: a.uid },
                {
                    op: 'slot',
                    task_uid: b.uid,
                    start_minute: 1435,
                    duration_minutes: 60,
                },
            ]);

            expect(res.status).toBe(400);
            expect(await DailyPlan.count()).toBe(0);
            expect(await DailyPlanItem.count()).toBe(0);
        });

        it('rejects an unknown op, an empty list and more than 100 ops', async () => {
            const a = await makeTask();

            expect(
                (await patchOps(today, [{ op: 'explode', task_uid: a.uid }]))
                    .status
            ).toBe(400);
            expect((await patchOps(today, [])).status).toBe(400);
            const many = Array.from({ length: 101 }, () => ({
                op: 'add',
                task_uid: a.uid,
            }));
            expect((await patchOps(today, many)).status).toBe(400);
            expect(await DailyPlanItem.count()).toBe(0);
        });

        it('rejects a body without ops', async () => {
            const res = await agent
                .patch(`/api/daily-plan/${today}`)
                .send({ items: [] });

            expect(res.status).toBe(400);
        });

        it('rejects a move to an invalid date', async () => {
            const a = await makeTask();
            await patchOps(today, [{ op: 'add', task_uid: a.uid }]);

            const res = await patchOps(today, [
                { op: 'move', task_uid: a.uid, to_date: '2026-13-40' },
            ]);

            expect(res.status).toBe(400);
            expect(itemsOf(await getPlan())).toHaveLength(1);
        });

        it('returns 404 for a task of another user and writes nothing', async () => {
            const other = await createTestUser({
                email: 'ops-not-mine@example.com',
            });
            const foreign = await Task.create({
                name: 'Foreign',
                user_id: other.id,
            });
            const mine = await makeTask();

            const res = await patchOps(today, [
                { op: 'add', task_uid: mine.uid },
                { op: 'add', task_uid: foreign.uid },
            ]);

            expect(res.status).toBe(404);
            expect(await DailyPlan.count()).toBe(0);
            expect(await DailyPlanItem.count()).toBe(0);
        });
    });

    describe('concurrent writes', () => {
        it('keeps both lines when two PATCHes add to the same new day at once', async () => {
            const a = await makeTask();
            const b = await makeTask();

            const [first, second] = await Promise.all([
                patchOps(tomorrow, [{ op: 'add', task_uid: a.uid }]),
                patchOps(tomorrow, [{ op: 'add', task_uid: b.uid }]),
            ]);

            expect(first.status).toBe(200);
            expect(second.status).toBe(200);
            const uids = itemsOf(await getPlan(tomorrow)).map(
                (i) => i.task_uid
            );
            expect(uids.sort()).toEqual([a.uid, b.uid].sort());
        });
    });

    describe('ETag and If-Match', () => {
        it('returns an etag in GET, PUT and PATCH that matches for the same items', async () => {
            const a = await makeTask();

            const put = await agent
                .put(`/api/daily-plan/${today}`)
                .send({ items: [{ task_uid: a.uid, start_minute: 480 }] });
            const patch = await patchOps(today, [
                { op: 'resize', task_uid: a.uid, duration_minutes: 30 },
            ]);
            const get = await getPlan();

            expect(put.body.etag).toMatch(/^[0-9a-f]{16}$/);
            expect(put.headers.etag).toBe(`"${put.body.etag}"`);
            expect(patch.headers.etag).toBe(`"${patch.body.etag}"`);
            expect(patch.body.etag).toBe(put.body.etag);
            expect(get.etag).toBe(put.body.etag);
        });

        it('changes when the items change', async () => {
            const a = await makeTask();
            const first = await patchOps(today, [
                { op: 'add', task_uid: a.uid },
            ]);
            const second = await patchOps(today, [
                { op: 'slot', task_uid: a.uid, start_minute: 480 },
            ]);

            expect(second.body.etag).not.toBe(first.body.etag);
        });

        it('applies a PATCH whose If-Match matches the current plan', async () => {
            const a = await makeTask();
            const { body } = await patchOps(today, [
                { op: 'add', task_uid: a.uid },
            ]);

            const res = await patchOps(
                today,
                [{ op: 'slot', task_uid: a.uid, start_minute: 480 }],
                { 'If-Match': `"${body.etag}"` }
            );

            expect(res.status).toBe(200);
            expect(itemsOf(res.body)[0].start_minute).toBe(480);
        });

        it('answers 409 with the current plan and writes nothing when a PATCH is stale', async () => {
            const a = await makeTask();
            const b = await makeTask();
            const { body: before } = await patchOps(today, [
                { op: 'add', task_uid: a.uid },
            ]);
            await patchOps(today, [{ op: 'add', task_uid: b.uid }]);

            const res = await patchOps(
                today,
                [{ op: 'remove', task_uid: a.uid }],
                { 'If-Match': `"${before.etag}"` }
            );

            expect(res.status).toBe(409);
            expect(res.body.error).toBe('plan_changed');
            expect(res.body.plan.etag).toBeDefined();
            expect(res.body.plan.plan.items.map((i) => i.task_uid)).toEqual([
                a.uid,
                b.uid,
            ]);
            expect(itemsOf(await getPlan())).toHaveLength(2);
        });

        it('a stale PUT with If-Match answers 409 and keeps the plan', async () => {
            const a = await makeTask();
            const b = await makeTask();
            await patchOps(today, [{ op: 'add', task_uid: a.uid }]);

            const res = await agent
                .put(`/api/daily-plan/${today}`)
                .set('If-Match', '"0000000000000000"')
                .send({ items: [{ task_uid: b.uid }] });

            expect(res.status).toBe(409);
            expect(res.body.error).toBe('plan_changed');
            expect(itemsOf(await getPlan()).map((i) => i.task_uid)).toEqual([
                a.uid,
            ]);
        });

        it('a PUT with a matching If-Match is applied', async () => {
            const a = await makeTask();
            const b = await makeTask();
            const { body } = await patchOps(today, [
                { op: 'add', task_uid: a.uid },
            ]);

            const res = await agent
                .put(`/api/daily-plan/${today}`)
                .set('If-Match', `"${body.etag}"`)
                .send({ items: [{ task_uid: b.uid }] });

            expect(res.status).toBe(200);
            expect(res.body.plan.items.map((i) => i.task_uid)).toEqual([b.uid]);
        });

        it('a PUT without If-Match keeps replacing the list', async () => {
            const a = await makeTask();
            const b = await makeTask();
            await patchOps(today, [{ op: 'add', task_uid: a.uid }]);

            const res = await agent
                .put(`/api/daily-plan/${today}`)
                .send({ items: [{ task_uid: b.uid }] });

            expect(res.status).toBe(200);
            expect(res.body.plan.items.map((i) => i.task_uid)).toEqual([b.uid]);
        });
    });

    describe('task today flag', () => {
        it('today: true then today: false still adds and removes the line', async () => {
            const task = await makeTask();

            await agent.patch(`/api/task/${task.uid}`).send({ today: true });
            expect((await getPlan()).plan.items.map((i) => i.task_uid)).toEqual(
                [task.uid]
            );

            await agent.patch(`/api/task/${task.uid}`).send({ today: false });
            expect(itemsOf(await getPlan())).toEqual([]);
        });
    });
});
