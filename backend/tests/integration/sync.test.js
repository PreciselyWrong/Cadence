const request = require('supertest');
const app = require('../../app');
const { Task, Project, SyncOp } = require('../../models');
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

describe('Offline sync API', () => {
    let agent;

    beforeEach(async () => {
        ({ agent } = await signIn('sync@example.com'));
    });

    it('describes the syncable entities', async () => {
        const res = await agent.get('/api/v1/sync/meta');

        expect(res.status).toBe(200);
        expect(res.body.schema_version).toBeGreaterThanOrEqual(1);
        expect(res.body.entities.map((e) => e.name)).toEqual(
            expect.arrayContaining([
                'task',
                'project',
                'area',
                'tag',
                'note',
                'inbox_item',
            ])
        );
    });

    it('creates a task with a client-chosen uid once, even if pushed twice', async () => {
        const op = upsert(
            'op-1',
            'task',
            'clienttask00001',
            { name: 'Offline task', priority: 1 },
            hlc(1000)
        );

        const first = await push(agent, [op]);
        const second = await push(agent, [op]);

        expect(first.status).toBe(200);
        expect(first.body.results[0].status).toBe('applied');
        expect(second.body.results).toEqual(first.body.results);
        expect(await Task.count({ where: { uid: 'clienttask00001' } })).toBe(1);
        expect(await SyncOp.count({ where: { op_id: 'op-1' } })).toBe(1);
    });

    it('resolves references by uid', async () => {
        const res = await push(agent, [
            upsert('op-p', 'project', 'clientproj00001', { name: 'P' }, hlc(1)),
            upsert(
                'op-t',
                'task',
                'clienttask00002',
                { name: 'In P', project_uid: 'clientproj00001' },
                hlc(2)
            ),
        ]);

        expect(res.body.results.map((r) => r.status)).toEqual([
            'applied',
            'applied',
        ]);
        const project = await Project.findOne({
            where: { uid: 'clientproj00001' },
        });
        const task = await Task.findOne({ where: { uid: 'clienttask00002' } });
        expect(task.project_id).toBe(project.id);
    });

    it('merges two offline edits field by field', async () => {
        await push(agent, [
            upsert(
                'op-c',
                'task',
                'clienttask00003',
                { name: 'Base', note: 'n0' },
                hlc(10)
            ),
        ]);

        // Device A renames, device B edits the note; both were offline.
        await push(agent, [
            upsert(
                'op-a',
                'task',
                'clienttask00003',
                { name: 'Renamed' },
                hlc(20, 0, 'devA')
            ),
            upsert(
                'op-b',
                'task',
                'clienttask00003',
                { note: 'from B' },
                hlc(15, 0, 'devB')
            ),
        ]);

        const task = await Task.findOne({ where: { uid: 'clienttask00003' } });
        expect(task.name).toBe('Renamed');
        expect(task.note).toBe('from B');
    });

    it('keeps the newer value and reports the older one as a conflict', async () => {
        await push(agent, [
            upsert('op-n', 'task', 'clienttask00004', { name: 'New' }, hlc(50)),
        ]);

        const stale = await push(agent, [
            upsert(
                'op-s',
                'task',
                'clienttask00004',
                { name: 'Stale' },
                hlc(40, 0, 'devB')
            ),
        ]);

        expect(stale.body.results[0].status).toBe('conflict');
        expect(stale.body.results[0].rejected_fields).toEqual(['name']);
        const task = await Task.findOne({ where: { uid: 'clienttask00004' } });
        expect(task.name).toBe('New');
    });

    it('lets a web edit win over an older offline edit', async () => {
        const created = await agent
            .post('/api/task')
            .send({ name: 'From web' });
        expect(created.status).toBeLessThan(300);

        const res = await push(agent, [
            upsert(
                'op-old',
                'task',
                created.body.uid,
                { name: 'Old offline' },
                hlc(1)
            ),
        ]);

        expect(res.body.results[0].status).toBe('conflict');
        const task = await Task.findOne({ where: { uid: created.body.uid } });
        expect(task.name).toBe('From web');
    });

    it('streams every change, web ones included, through the pull cursor', async () => {
        const start = await agent.get('/api/v1/sync/pull?cursor=0');
        expect(start.status).toBe(200);

        await agent.post('/api/task').send({ name: 'Web task' });
        await push(agent, [
            upsert(
                'op-x',
                'task',
                'clienttask00005',
                { name: 'Synced' },
                hlc(5)
            ),
        ]);

        const pulled = await agent.get(
            `/api/v1/sync/pull?cursor=${start.body.cursor}`
        );
        const names = pulled.body.changes
            .filter((c) => c.entity === 'task' && c.op === 'upsert')
            .map((c) => c.data.name);
        expect(names).toContain('Web task');
        expect(names[names.length - 1]).toBe('Synced');
        expect(pulled.body.cursor).toBeGreaterThan(start.body.cursor);

        const again = await agent.get(
            `/api/v1/sync/pull?cursor=${pulled.body.cursor}`
        );
        expect(again.body.changes).toEqual([]);
    });

    it('tags pushed changes with their op_id so clients can skip echoes', async () => {
        await push(agent, [
            upsert('op-echo', 'area', 'clientarea00001', { name: 'A' }, hlc(1)),
        ]);

        const pulled = await agent.get('/api/v1/sync/pull?cursor=0');
        const change = pulled.body.changes.find(
            (c) => c.uid === 'clientarea00001'
        );
        expect(change.op_id).toBe('op-echo');
    });

    it('propagates a deletion as a tombstone', async () => {
        await push(agent, [
            upsert(
                'op-d1',
                'task',
                'clienttask00006',
                { name: 'Gone' },
                hlc(1)
            ),
        ]);
        const before = await agent.get('/api/v1/sync/pull?cursor=0');

        const del = await push(agent, [
            {
                op_id: 'op-d2',
                entity: 'task',
                uid: 'clienttask00006',
                action: 'delete',
                hlc: hlc(2),
            },
        ]);

        expect(del.body.results[0].status).toBe('applied');
        expect(await Task.count({ where: { uid: 'clienttask00006' } })).toBe(0);
        const after = await agent.get(
            `/api/v1/sync/pull?cursor=${before.body.cursor}`
        );
        expect(after.body.changes).toEqual([
            expect.objectContaining({
                entity: 'task',
                uid: 'clienttask00006',
                op: 'delete',
            }),
        ]);
    });

    it('serves a snapshot of rows that existed before the device synced', async () => {
        await agent.post('/api/project').send({ name: 'Old project' });

        const snap = await agent.get('/api/v1/sync/snapshot?entity=project');

        expect(snap.status).toBe(200);
        expect(snap.body.rows.map((r) => r.name)).toContain('Old project');
        expect(typeof snap.body.cursor).toBe('number');
    });

    describe('recurring occurrences', () => {
        const dailyTask = (uid, due) =>
            upsert(
                `op-mk-${uid}`,
                'task',
                uid,
                {
                    name: 'Water plants',
                    recurrence_type: 'daily',
                    recurrence_interval: 1,
                    due_date: due,
                },
                hlc(1)
            );
        const occurrence = (opId, uid, action, date) => ({
            op_id: opId,
            entity: 'task',
            uid,
            action,
            occurrence_date: date,
            hlc: hlc(5, 0, opId),
        });

        it('completes an occurrence once, even from two offline devices', async () => {
            await push(agent, [
                dailyTask('clientrecur0001', '2026-11-02T09:00:00.000Z'),
            ]);

            const a = await push(agent, [
                occurrence(
                    'devA-1',
                    'clientrecur0001',
                    'complete_occurrence',
                    '2026-11-02T09:00:00.000Z'
                ),
            ]);
            const b = await push(agent, [
                occurrence(
                    'devB-1',
                    'clientrecur0001',
                    'complete_occurrence',
                    '2026-11-02T09:00:00.000Z'
                ),
            ]);

            expect(a.body.results[0].status).toBe('applied');
            expect(b.body.results[0].status).toBe('applied');
            const task = await Task.findOne({
                where: { uid: 'clientrecur0001' },
            });
            expect(new Date(task.due_date).toISOString()).toBe(
                '2026-11-03T09:00:00.000Z'
            );
            const { RecurringCompletion } = require('../../models');
            expect(
                await RecurringCompletion.count({ where: { task_id: task.id } })
            ).toBe(1);
        });

        it('skips an occurrence and refuses an occurrence that is not due', async () => {
            await push(agent, [
                dailyTask('clientrecur0002', '2026-11-02T09:00:00.000Z'),
            ]);

            const skip = await push(agent, [
                occurrence(
                    'op-sk',
                    'clientrecur0002',
                    'skip_occurrence',
                    '2026-11-02T09:00:00.000Z'
                ),
            ]);
            const stale = await push(agent, [
                occurrence(
                    'op-st',
                    'clientrecur0002',
                    'complete_occurrence',
                    '2026-11-10T09:00:00.000Z'
                ),
            ]);

            expect(skip.body.results[0].status).toBe('applied');
            expect(stale.body.results[0]).toMatchObject({
                status: 'rejected',
                reason: 'occurrence_not_due',
            });
            const task = await Task.findOne({
                where: { uid: 'clientrecur0002' },
            });
            expect(new Date(task.due_date).toISOString()).toBe(
                '2026-11-03T09:00:00.000Z'
            );
        });
    });

    describe('tags', () => {
        it('sets task tags by uid and pulls them back', async () => {
            const res = await push(agent, [
                upsert(
                    'op-tg1',
                    'tag',
                    'clienttag000001',
                    { name: 'home' },
                    hlc(1)
                ),
                upsert(
                    'op-tg2',
                    'tag',
                    'clienttag000002',
                    { name: 'calls' },
                    hlc(1)
                ),
                upsert(
                    'op-tg3',
                    'task',
                    'clienttask00010',
                    {
                        name: 'Tagged',
                        tag_uids: ['clienttag000001', 'clienttag000002'],
                    },
                    hlc(2)
                ),
            ]);
            expect(res.body.results.map((r) => r.status)).toEqual([
                'applied',
                'applied',
                'applied',
            ]);

            const task = await Task.findOne({
                where: { uid: 'clienttask00010' },
            });
            const names = (await task.getTags()).map((t) => t.name).sort();
            expect(names).toEqual(['calls', 'home']);

            const pulled = await agent.get('/api/v1/sync/pull?cursor=0');
            const last = pulled.body.changes
                .filter((c) => c.uid === 'clienttask00010')
                .pop();
            expect([...last.data.tag_uids].sort()).toEqual([
                'clienttag000001',
                'clienttag000002',
            ]);
        });

        it('journals a tag change made from the web', async () => {
            const created = await agent
                .post('/api/task')
                .send({ name: 'Web tags' });
            const before = await agent.get('/api/v1/sync/pull?cursor=0');

            await agent
                .patch(`/api/task/${created.body.uid}`)
                .send({ tags: [{ name: 'errands' }] });

            const after = await agent.get(
                `/api/v1/sync/pull?cursor=${before.body.cursor}`
            );
            const change = after.body.changes
                .filter((c) => c.uid === created.body.uid)
                .pop();
            expect(change).toBeDefined();
            expect(change.data.tag_uids).toHaveLength(1);
            expect(change.data.field_clocks.tag_uids).toBeDefined();
        });

        it("refuses another user's tag", async () => {
            const other = await signIn('othertags@example.com');
            await push(other.agent, [
                upsert(
                    'op-ot',
                    'tag',
                    'othertag0000001',
                    { name: 'x' },
                    hlc(1)
                ),
            ]);

            const res = await push(agent, [
                upsert(
                    'op-ot2',
                    'task',
                    'clienttask00011',
                    { name: 'T', tag_uids: ['othertag0000001'] },
                    hlc(2)
                ),
            ]);

            expect(res.body.results[0].status).toBe('rejected');
        });
    });

    it('rejects unknown entities and fields without failing the batch', async () => {
        const res = await push(agent, [
            upsert(
                'op-u1',
                'spaceship',
                'abcdefghij12345',
                { name: 'x' },
                hlc(1)
            ),
            upsert(
                'op-u2',
                'task',
                'clienttask00008',
                { name: 'ok', user_id: 999 },
                hlc(1)
            ),
            upsert(
                'op-u3',
                'task',
                'clienttask00009',
                { name: 'fine' },
                hlc(1)
            ),
        ]);

        expect(res.body.results.map((r) => r.status)).toEqual([
            'rejected',
            'rejected',
            'applied',
        ]);
    });

    it('forgets the journal, ops and conflicts of an erased account', async () => {
        const { SyncChange, SyncConflict } = require('../../models');
        const {
            eraseUserAccount,
        } = require('../../services/accountErasureService');
        const gone = await signIn('erased@example.com');
        await push(gone.agent, [
            upsert('op-e1', 'task', 'erasedtask00001', { name: 'A' }, hlc(9)),
            upsert('op-e2', 'task', 'erasedtask00001', { name: 'B' }, hlc(1)),
        ]);

        await eraseUserAccount(gone.user.id);

        const byUser = { where: { user_id: gone.user.id } };
        expect(await SyncChange.count(byUser)).toBe(0);
        expect(await SyncOp.count(byUser)).toBe(0);
        expect(await SyncConflict.count(byUser)).toBe(0);
    });

    describe('isolation', () => {
        it("never shows another user's changes and refuses their uids", async () => {
            const other = await signIn('other@example.com');
            await push(other.agent, [
                upsert(
                    'op-o',
                    'task',
                    'othertask000001',
                    { name: 'Theirs' },
                    hlc(1, 0, 'devO')
                ),
            ]);

            const pulled = await agent.get('/api/v1/sync/pull?cursor=0');
            expect(
                pulled.body.changes.some((c) => c.uid === 'othertask000001')
            ).toBe(false);

            const steal = await push(agent, [
                upsert(
                    'op-steal',
                    'task',
                    'othertask000001',
                    { name: 'Mine' },
                    hlc(9)
                ),
            ]);
            expect(steal.body.results[0].status).toBe('rejected');
            const task = await Task.findOne({
                where: { uid: 'othertask000001' },
            });
            expect(task.name).toBe('Theirs');
        });

        it('does not let two users collide on an op_id', async () => {
            const other = await signIn('other3@example.com');
            await push(other.agent, [
                upsert(
                    'same-op',
                    'area',
                    'otherarea000001',
                    { name: 'O' },
                    hlc(1)
                ),
            ]);

            const mine = await push(agent, [
                upsert(
                    'same-op',
                    'area',
                    'myarea000000001',
                    { name: 'M' },
                    hlc(1)
                ),
            ]);

            expect(mine.body.results[0].status).toBe('applied');
        });

        it("refuses a reference to another user's project", async () => {
            const other = await signIn('other2@example.com');
            await push(other.agent, [
                upsert(
                    'op-op',
                    'project',
                    'otherproj000001',
                    { name: 'X' },
                    hlc(1)
                ),
            ]);

            const res = await push(agent, [
                upsert(
                    'op-r',
                    'task',
                    'clienttask00007',
                    { name: 'T', project_uid: 'otherproj000001' },
                    hlc(2)
                ),
            ]);

            expect(res.body.results[0].status).toBe('rejected');
            expect(
                await Task.count({ where: { uid: 'clienttask00007' } })
            ).toBe(0);
        });
    });
});
