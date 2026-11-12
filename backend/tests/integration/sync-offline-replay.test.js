const request = require('supertest');
const app = require('../../app');
const { Task, Project, InboxItem } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

// Writes the web UI made offline reach the server later through the normal
// routes, stamped with when they were made (X-Cadence-Offline-Clock): they
// merge field by field like a device push (docs/fork/WEB-OFFLINE.md).

const hlc = (ms, counter = 0, node = 'devA') =>
    `${String(ms).padStart(13, '0')}-${String(counter).padStart(4, '0')}-${node}`;

const signIn = async (email) => {
    const user = await createTestUser({ email });
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email, password: 'password123' });
    return { user, agent };
};

const push = (agent, ops) => agent.post('/api/v1/sync/push').send({ ops });

const upsert = (opId, entity, uid, fields, clock) => ({
    op_id: opId,
    entity,
    uid,
    action: 'upsert',
    fields: Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, { value: v, hlc: clock }])
    ),
});

describe('Offline web writes replayed with their edit time', () => {
    let agent;
    const now = Date.now();

    beforeEach(async () => {
        ({ agent } = await signIn('offline-replay@example.com'));
    });

    it('keeps a newer change from a device and records the offline value', async () => {
        await push(agent, [
            upsert(
                'dev-1',
                'task',
                'offlinetask0001',
                { name: 'From the phone', priority: 1 },
                hlc(now - 1000)
            ),
        ]);

        const res = await agent
            .patch('/api/task/offlinetask0001')
            .set('X-Cadence-Offline-Clock', hlc(now - 60000, 0, 'web-abc'))
            .send({ name: 'Typed offline', priority: 2 });
        expect(res.status).toBe(200);

        const task = await Task.findOne({ where: { uid: 'offlinetask0001' } });
        expect(task.name).toBe('From the phone');
        expect(task.priority).toBe(1);

        const status = await agent.get('/api/v1/sync/status');
        const fields = status.body.conflicts.map((c) => c.field).sort();
        expect(fields).toEqual(['name', 'priority']);
        expect(
            status.body.conflicts.find((c) => c.field === 'name')
        ).toMatchObject({
            lost: { value: 'Typed offline' },
            current: { value: 'From the phone' },
            can_keep_lost: true,
        });
    });

    it('applies an offline change newer than the stored one, stamped with its clock', async () => {
        const deviceClock = hlc(now - 60000);
        await push(agent, [
            upsert(
                'dev-2',
                'task',
                'offlinetask0002',
                { name: 'Old' },
                deviceClock
            ),
        ]);
        const webClock = hlc(now - 1000, 3, 'web-abc');

        await agent
            .patch('/api/task/offlinetask0002')
            .set('X-Cadence-Offline-Clock', webClock)
            .send({ name: 'Newer offline' })
            .expect(200);

        const task = await Task.findOne({ where: { uid: 'offlinetask0002' } });
        expect(task.name).toBe('Newer offline');
        expect(task.field_clocks.name).toBe(webClock);

        // A device edit made between the two still loses to it.
        const res = await push(agent, [
            upsert(
                'dev-3',
                'task',
                'offlinetask0002',
                { name: 'Phone, older' },
                hlc(now - 30000)
            ),
        ]);
        expect(res.body.results[0].status).toBe('conflict');
    });

    it('records the lost project of a task as its uid', async () => {
        const home = await agent.post('/api/project').send({ name: 'Home' });
        const work = await agent.post('/api/project').send({ name: 'Work' });
        await push(agent, [
            upsert(
                'dev-4',
                'task',
                'offlinetask0003',
                { name: 'Task', project_uid: home.body.uid },
                hlc(now - 1000)
            ),
        ]);

        await agent
            .patch('/api/task/offlinetask0003')
            .set('X-Cadence-Offline-Clock', hlc(now - 60000, 0, 'web-abc'))
            .send({ project_id: work.body.id })
            .expect(200);

        const status = await agent.get('/api/v1/sync/status');
        expect(status.body.conflicts).toEqual([
            expect.objectContaining({
                field: 'project_uid',
                lost: { value: work.body.uid, label: 'Work' },
            }),
        ]);
        const task = await Task.findOne({ where: { uid: 'offlinetask0003' } });
        expect(task.project_id).toBe(home.body.id);
    });

    it('creates a row with the uid the browser chose', async () => {
        const res = await agent
            .post('/api/task')
            .set('X-Cadence-Offline-Clock', hlc(now - 5000, 0, 'web-abc'))
            .set('X-Cadence-Create-Uid', 'abcdefghijk2345')
            .send({ name: 'Made offline' });
        expect(res.status).toBe(201);
        expect(res.body.uid).toBe('abcdefghijk2345');

        const task = await Task.findOne({ where: { uid: 'abcdefghijk2345' } });
        expect(task.name).toBe('Made offline');
        expect(task.field_clocks.name).toBe(hlc(now - 5000, 0, 'web-abc'));

        const project = await agent
            .post('/api/project')
            .set('X-Cadence-Create-Uid', 'pqrstuvwxyz2345')
            .send({ name: 'Offline project' });
        expect(project.body.uid).toBe('pqrstuvwxyz2345');
        expect(await Project.count({ where: { uid: 'pqrstuvwxyz2345' } })).toBe(
            1
        );
    });

    it('refuses a malformed clock or uid', async () => {
        const badClock = await agent
            .patch('/api/task/whatever0000001')
            .set('X-Cadence-Offline-Clock', 'yesterday')
            .send({ name: 'x' });
        const badUid = await agent
            .post('/api/task')
            .set('X-Cadence-Create-Uid', 'NOT A UID')
            .send({ name: 'x' });
        const future = await agent
            .post('/api/task')
            .set(
                'X-Cadence-Offline-Clock',
                hlc(now + 3 * 24 * 3600 * 1000, 0, 'web-abc')
            )
            .send({ name: 'x' });

        expect([badClock.status, badClock.body]).toEqual([
            400,
            { error: 'invalid_offline_clock' },
        ]);
        expect([badUid.status, badUid.body]).toEqual([
            400,
            { error: 'invalid_create_uid' },
        ]);
        expect(future.body).toEqual({ error: 'invalid_offline_clock' });
        expect(await Task.count({ where: { name: 'x' } })).toBe(0);
    });

    it('answers a repeated create with the first answer, once', async () => {
        const send = () =>
            agent
                .post('/api/task')
                .set('Idempotency-Key', 'web-replay-key-0001')
                .send({ name: 'Only once' });
        const first = await send();
        const second = await send();
        expect(second.status).toBe(first.status);
        expect(second.body.uid).toBe(first.body.uid);
        expect(second.headers['idempotent-replayed']).toBe('true');
        expect(await Task.count({ where: { name: 'Only once' } })).toBe(1);
    });

    it('claims a key once on a route that has its own idempotency', async () => {
        const send = () =>
            agent
                .post('/api/inbox')
                .set('Idempotency-Key', 'web-replay-key-0002')
                .send({ content: 'An idea' });
        expect((await send()).status).toBeLessThan(300);
        expect((await send()).status).toBeLessThan(300);
        expect(await InboxItem.count({ where: { content: 'An idea' } })).toBe(
            1
        );
    });
});
