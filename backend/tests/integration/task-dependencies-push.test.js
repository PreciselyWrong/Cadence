const request = require('supertest');
const app = require('../../app');
const { SyncChange, TaskRelation, Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('Blocked tasks follow their blocker', () => {
    let agent;
    let user;

    beforeEach(async () => {
        user = await createTestUser({
            email: `push_${Date.now()}@test.com`,
            timezone: 'Europe/Zurich',
        });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });
    });

    const makeTask = async (fields) =>
        (await agent.post('/api/task').send(fields)).body;
    const link = (from, to) =>
        agent
            .post(`/api/task/${from.uid}/relations`)
            .send({ target_uid: to.uid, type: 'blocks' });
    const fetch = async (task) =>
        (await agent.get(`/api/task/${task.uid}`)).body;
    const day = (value) => (value ? String(value).slice(0, 10) : value);

    it('pushes a dated task when its blocker now ends on or after its start', async () => {
        const a = await makeTask({ name: 'A', due_date: '2026-12-02' });
        const b = await makeTask({
            name: 'B',
            start_date: '2026-12-03',
            due_date: '2026-12-04',
        });
        expect((await link(a, b)).status).toBe(201);

        const res = await agent
            .patch(`/api/task/${a.uid}`)
            .send({ due_date: '2026-12-07' });
        expect(res.status).toBe(200);
        expect(res.body.pushed_tasks).toEqual([{ uid: b.uid, name: 'B' }]);

        const moved = await fetch(b);
        expect(day(moved.start_date)).toBe('2026-12-08');
        expect(day(moved.due_date)).toBe('2026-12-09');
    });

    it('carries the push down a chain and never pulls tasks back', async () => {
        const a = await makeTask({ name: 'A', due_date: '2026-12-02' });
        const b = await makeTask({ name: 'B', due_date: '2026-12-03' });
        const c = await makeTask({ name: 'C', due_date: '2026-12-10' });
        await link(a, b);
        await link(b, c);

        await agent
            .patch(`/api/task/${a.uid}`)
            .send({ due_date: '2026-12-10' });
        expect(day((await fetch(b)).due_date)).toBe('2026-12-11');
        expect(day((await fetch(c)).due_date)).toBe('2026-12-12');

        const back = await agent
            .patch(`/api/task/${a.uid}`)
            .send({ due_date: '2026-12-01' });
        expect(back.body.pushed_tasks).toEqual([]);
        expect(day((await fetch(b)).due_date)).toBe('2026-12-11');
    });

    it('pushes a week left behind by its blocker to the blocker week', async () => {
        const a = await makeTask({ name: 'A' });
        const b = await makeTask({ name: 'B' });
        await agent.patch(`/api/task/${a.uid}`).send({ week_of: '2026-12-07' });
        await agent.patch(`/api/task/${b.uid}`).send({ week_of: '2026-12-07' });
        await link(a, b);
        expect(day((await fetch(b)).week_of)).toBe('2026-12-07');

        await agent.patch(`/api/task/${a.uid}`).send({ week_of: '2026-12-14' });
        expect(day((await fetch(b)).week_of)).toBe('2026-12-14');
    });

    it('pushes the blocked task when the link is made', async () => {
        const a = await makeTask({ name: 'A', due_date: '2026-12-05' });
        const b = await makeTask({ name: 'B', due_date: '2026-12-01' });

        const res = await link(a, b);
        expect(res.status).toBe(201);
        expect(res.body.pushed_tasks).toEqual([{ uid: b.uid, name: 'B' }]);
        expect(day((await fetch(b)).due_date)).toBe('2026-12-06');
    });

    it('lets a done blocker move without pushing anything', async () => {
        const a = await makeTask({ name: 'A', due_date: '2026-12-02' });
        const b = await makeTask({ name: 'B', due_date: '2026-12-03' });
        await link(a, b);
        await agent.patch(`/api/task/${a.uid}`).send({ status: 'done' });

        await agent
            .patch(`/api/task/${a.uid}`)
            .send({ due_date: '2026-12-09' });
        expect(day((await fetch(b)).due_date)).toBe('2026-12-03');
    });

    it('sends the pushed task to the devices', async () => {
        const a = await makeTask({ name: 'A', due_date: '2026-12-02' });
        const b = await makeTask({ name: 'B', due_date: '2026-12-03' });
        await link(a, b);
        const before = await SyncChange.count({ where: { uid: b.uid } });

        await agent
            .patch(`/api/task/${a.uid}`)
            .send({ due_date: '2026-12-05' });
        expect(await SyncChange.count({ where: { uid: b.uid } })).toBe(
            before + 1
        );
    });

    it('keeps a diamond in order: the shared task follows both blockers', async () => {
        const a = await makeTask({ name: 'A', due_date: '2026-12-10' });
        const b = await makeTask({ name: 'B', due_date: '2026-12-11' });
        const c = await makeTask({ name: 'C', due_date: '2026-12-12' });
        await link(a, b);
        await link(a, c);
        await link(b, c);

        const res = await agent
            .patch(`/api/task/${a.uid}`)
            .send({ due_date: '2026-12-15' });
        expect(day((await fetch(b)).due_date)).toBe('2026-12-16');
        expect(day((await fetch(c)).due_date)).toBe('2026-12-17');
        // Each pushed task is named once
        expect(res.body.pushed_tasks.map((t) => t.name).sort()).toEqual([
            'B',
            'C',
        ]);
    });

    it('stops on a loop of links instead of pushing forever', async () => {
        const a = await makeTask({ name: 'A', due_date: '2026-12-02' });
        const b = await makeTask({ name: 'B', due_date: '2026-12-03' });
        await link(a, b);
        // A loop the API refuses, as two racing requests could still leave
        const [rowA, rowB] = await Promise.all([
            Task.findOne({ where: { uid: a.uid } }),
            Task.findOne({ where: { uid: b.uid } }),
        ]);
        await TaskRelation.create({
            source_task_id: rowB.id,
            target_task_id: rowA.id,
            relation_type: 'blocks',
        });

        const res = await agent
            .patch(`/api/task/${a.uid}`)
            .send({ due_date: '2026-12-05' });
        expect(res.status).toBe(200);
        expect(day((await fetch(b)).due_date)).toBe('2026-12-06');
    });

    it('never names a pushed task the caller cannot see', async () => {
        const other = await createTestUser({
            email: `push_other_${Date.now()}@test.com`,
            timezone: 'Europe/Zurich',
        });
        const a = await makeTask({ name: 'Mine', due_date: '2026-12-02' });
        const hidden = await Task.create({
            name: 'Private',
            user_id: other.id,
            due_date: new Date('2026-12-02T22:59:59.999Z'),
        });
        const rowA = await Task.findOne({ where: { uid: a.uid } });
        await TaskRelation.create({
            source_task_id: rowA.id,
            target_task_id: hidden.id,
            relation_type: 'blocks',
        });

        const res = await agent
            .patch(`/api/task/${a.uid}`)
            .send({ due_date: '2026-12-04' });
        expect(res.body.pushed_tasks).toEqual([]);
        await hidden.reload();
        expect(hidden.due_date.toISOString()).toBe('2026-12-05T22:59:59.999Z');
    });

    it('moves the week of a dated task along with its dates', async () => {
        const a = await makeTask({ name: 'A', due_date: '2026-12-02' });
        const b = await makeTask({ name: 'B', due_date: '2026-12-03' });
        await agent.patch(`/api/task/${b.uid}`).send({ week_of: '2026-11-30' });
        await link(a, b);

        await agent
            .patch(`/api/task/${a.uid}`)
            .send({ due_date: '2026-12-09' });
        const moved = await fetch(b);
        expect(day(moved.due_date)).toBe('2026-12-10');
        expect(day(moved.week_of)).toBe('2026-12-07');
    });

    it('lets a device batch land before pushing, so its own later date is kept', async () => {
        const a = await makeTask({ name: 'A', due_date: '2026-12-02' });
        const b = await makeTask({ name: 'B', due_date: '2026-12-03' });
        await link(a, b);
        const clock = `${String(Date.now() + 1000).padStart(13, '0')}-0000-devA`;
        const op = (opId, uid, value) => ({
            op_id: opId,
            entity: 'task',
            uid,
            action: 'upsert',
            fields: { due_date: { value, hlc: clock } },
        });

        const res = await agent.post('/api/v1/sync/push').send({
            ops: [
                op('push-a-later', a.uid, '2026-12-10T22:59:59.999Z'),
                op('push-b-later', b.uid, '2026-12-20T22:59:59.999Z'),
            ],
        });
        expect(res.body.results.map((r) => r.status)).toEqual([
            'applied',
            'applied',
        ]);
        expect(day((await fetch(b)).due_date)).toBe('2026-12-20');
    });
});
