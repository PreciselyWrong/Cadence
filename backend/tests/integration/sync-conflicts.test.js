const request = require('supertest');
const app = require('../../app');
const { Task, SyncConflict, SyncChange, ApiToken } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

const hlc = (ms, counter = 0, node = 'devA') =>
    `${String(ms).padStart(13, '0')}-${String(counter).padStart(4, '0')}-${node}`;

const signIn = async (email) => {
    const user = await createTestUser({ email });
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email, password: 'password123' });
    return { user, agent };
};

const upsert = (opId, entity, uid, fields, clock) => ({
    op_id: opId,
    entity,
    uid,
    action: 'upsert',
    fields: Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, { value: v, hlc: clock }])
    ),
});

const push = (agent, ops) => agent.post('/api/v1/sync/push').send({ ops });

// A newer write, then an older one on the same field: the older one loses.
async function loseName(agent, uid, kept, lost) {
    await push(agent, [
        upsert('op-new', 'task', uid, { name: kept }, hlc(5000)),
    ]);
    const res = await push(agent, [
        upsert('op-old', 'task', uid, { name: lost }, hlc(1000, 0, 'devB')),
    ]);
    expect(res.body.results[0].status).toBe('conflict');
}

describe('Sync status and conflicts', () => {
    let agent;
    let user;

    beforeEach(async () => {
        ({ agent, user } = await signIn('conflicts@example.com'));
    });

    it('lists a lost value next to the value that won', async () => {
        await loseName(agent, 'conflicttask001', 'Kept title', 'Lost title');

        const res = await agent.get('/api/v1/sync/status');

        expect(res.status).toBe(200);
        expect(res.body.conflicts).toHaveLength(1);
        expect(res.body.conflicts[0]).toMatchObject({
            entity: 'task',
            uid: 'conflicttask001',
            field: 'name',
            name: 'Kept title',
            lost: { value: 'Lost title' },
            current: { value: 'Kept title' },
            can_keep_lost: true,
        });
    });

    it('names referenced rows instead of showing their uid', async () => {
        await push(agent, [
            upsert(
                'op-p1',
                'project',
                'conflictproj001',
                { name: 'Home' },
                hlc(1)
            ),
            upsert(
                'op-p2',
                'project',
                'conflictproj002',
                { name: 'Work' },
                hlc(1)
            ),
            upsert(
                'op-t1',
                'task',
                'conflicttask002',
                { name: 'T', project_uid: 'conflictproj001' },
                hlc(5000)
            ),
        ]);
        await push(agent, [
            upsert(
                'op-t2',
                'task',
                'conflicttask002',
                { project_uid: 'conflictproj002' },
                hlc(1000, 0, 'devB')
            ),
        ]);

        const res = await agent.get('/api/v1/sync/status');

        expect(res.body.conflicts[0]).toMatchObject({
            field: 'project_uid',
            lost: { value: 'conflictproj002', label: 'Work' },
            current: { value: 'conflictproj001', label: 'Home' },
        });
    });

    it('keeps the lost value: the row takes it and devices pull it', async () => {
        await loseName(agent, 'conflicttask003', 'Kept title', 'Lost title');
        const { body } = await agent.get('/api/v1/sync/status');
        const before = await SyncChange.max('id');

        const res = await agent
            .post(`/api/v1/sync/conflicts/${body.conflicts[0].id}/resolve`)
            .send({ keep: 'lost' });

        expect(res.status).toBe(200);
        const task = await Task.findOne({ where: { uid: 'conflicttask003' } });
        expect(task.name).toBe('Lost title');
        expect(task.field_clocks.name > hlc(5000)).toBe(true);
        expect(
            await SyncChange.count({
                where: {
                    uid: 'conflicttask003',
                    id: { [require('sequelize').Op.gt]: before },
                },
            })
        ).toBeGreaterThan(0);
        expect(
            await SyncConflict.count({ where: { uid: 'conflicttask003' } })
        ).toBe(0);
    });

    it('keeps the current value: the row stays, the conflict goes', async () => {
        await loseName(agent, 'conflicttask004', 'Kept title', 'Lost title');
        const { body } = await agent.get('/api/v1/sync/status');

        const res = await agent
            .post(`/api/v1/sync/conflicts/${body.conflicts[0].id}/resolve`)
            .send({ keep: 'current' });

        expect(res.status).toBe(200);
        const task = await Task.findOne({ where: { uid: 'conflicttask004' } });
        expect(task.name).toBe('Kept title');
        expect(
            await SyncConflict.count({ where: { uid: 'conflicttask004' } })
        ).toBe(0);
    });

    it('rejects an unknown choice', async () => {
        await loseName(agent, 'conflicttask005', 'A', 'B');
        const { body } = await agent.get('/api/v1/sync/status');

        const res = await agent
            .post(`/api/v1/sync/conflicts/${body.conflicts[0].id}/resolve`)
            .send({ keep: 'both' });

        expect(res.status).toBe(400);
        expect(
            await SyncConflict.count({ where: { uid: 'conflicttask005' } })
        ).toBe(1);
    });

    it('hides a conflict already settled and one whose row is gone', async () => {
        await loseName(agent, 'conflicttask006', 'A', 'B');
        await Task.update(
            { name: 'B' },
            { where: { uid: 'conflicttask006' }, individualHooks: true }
        );
        await loseName(agent, 'conflicttask007', 'C', 'D');
        await Task.destroy({ where: { uid: 'conflicttask007' } });

        const res = await agent.get('/api/v1/sync/status');

        expect(res.body.conflicts).toEqual([]);
    });

    it("never shows nor resolves another user's conflicts", async () => {
        await loseName(agent, 'conflicttask008', 'A', 'B');
        const { body } = await agent.get('/api/v1/sync/status');
        const other = await signIn('other-conflicts@example.com');

        const list = await other.agent.get('/api/v1/sync/status');
        const resolve = await other.agent
            .post(`/api/v1/sync/conflicts/${body.conflicts[0].id}/resolve`)
            .send({ keep: 'current' });

        expect(list.body.conflicts).toEqual([]);
        expect(resolve.status).toBe(404);
        expect(
            await SyncConflict.count({ where: { uid: 'conflicttask008' } })
        ).toBe(1);
    });

    it('lists the devices that have synced, most recent first', async () => {
        const base = {
            user_id: user.id,
            token_hash: 'x',
            token_prefix: 'tt_test',
        };
        await ApiToken.create({
            ...base,
            name: 'Pixel',
            last_used_at: new Date('2026-10-30T10:00:00Z'),
        });
        await ApiToken.create({
            ...base,
            name: 'Laptop',
            last_used_at: new Date('2026-10-31T10:00:00Z'),
        });
        await ApiToken.create({ ...base, name: 'Never used' });
        await ApiToken.create({
            ...base,
            name: 'Revoked',
            last_used_at: new Date(),
            revoked_at: new Date(),
        });

        const res = await agent.get('/api/v1/sync/status');

        expect(res.body.devices.map((d) => d.name)).toEqual([
            'Laptop',
            'Pixel',
        ]);
        expect(res.body.devices[0]).not.toHaveProperty('token_hash');
    });
});
