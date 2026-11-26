const request = require('supertest');
const app = require('../../app');
const {
    Task,
    Project,
    ProjectSection,
    Area,
    SyncOp,
    SyncChange,
    Tag,
    Comment,
    Person,
    Permission,
    UserGroup,
    GroupShare,
    GroupPermission,
    TaskEvent,
    Notification,
} = require('../../models');
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

    it('re-arms a reminder moved from a device', async () => {
        await push(agent, [
            upsert(
                'op-r1',
                'task',
                'clienttask00r01',
                { name: 'Call', reminder_at: '2026-11-02T08:00:00.000Z' },
                hlc(10)
            ),
        ]);
        await Task.update(
            { reminder_sent_at: new Date('2026-11-02T08:00:00.000Z') },
            { where: { uid: 'clienttask00r01' } }
        );

        await push(agent, [
            upsert(
                'op-r2',
                'task',
                'clienttask00r01',
                { reminder_at: '2026-11-03T08:00:00.000Z' },
                hlc(20)
            ),
        ]);

        const task = await Task.findOne({ where: { uid: 'clienttask00r01' } });
        expect(task.reminder_at.toISOString()).toBe('2026-11-03T08:00:00.000Z');
        expect(task.reminder_sent_at).toBeNull();
    });

    it('sends reminder_sent_at to devices but refuses a push that writes it', async () => {
        await push(agent, [
            upsert(
                'op-rs1',
                'task',
                'clienttask00r02',
                { name: 'Call', reminder_at: '2026-11-02T08:00:00.000Z' },
                hlc(10)
            ),
        ]);
        await Task.update(
            { reminder_sent_at: new Date('2026-11-02T08:00:05.000Z') },
            { where: { uid: 'clienttask00r02' } }
        );

        const pulled = await agent.get('/api/v1/sync/pull?cursor=0');
        const change = pulled.body.changes
            .filter((c) => c.uid === 'clienttask00r02')
            .pop();
        expect(change.data.reminder_sent_at).toBe('2026-11-02T08:00:05.000Z');

        const res = await push(agent, [
            upsert(
                'op-rs2',
                'task',
                'clienttask00r02',
                { reminder_sent_at: null },
                hlc(30)
            ),
        ]);
        expect(res.body.results[0].status).toBe('rejected');
        const task = await Task.findOne({ where: { uid: 'clienttask00r02' } });
        expect(task.reminder_sent_at.toISOString()).toBe(
            '2026-11-02T08:00:05.000Z'
        );
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

    it('stamps and journals a server-side bulk update, so it beats older offline edits', async () => {
        await push(agent, [
            upsert(
                'op-bk',
                'task',
                'clienttask00020',
                { name: 'Bulk' },
                hlc(1)
            ),
        ]);
        const before = await agent.get('/api/v1/sync/pull?cursor=0');

        await Task.update(
            { note: 'set in bulk' },
            { where: { uid: 'clienttask00020' } }
        );

        const after = await agent.get(
            `/api/v1/sync/pull?cursor=${before.body.cursor}`
        );
        expect(after.body.changes).toHaveLength(1);
        expect(after.body.changes[0].data.note).toBe('set in bulk');

        const stale = await push(agent, [
            upsert(
                'op-bk2',
                'task',
                'clienttask00020',
                { note: 'older' },
                hlc(2, 0, 'devB')
            ),
        ]);
        expect(stale.body.results[0].status).toBe('conflict');
    });

    describe('review fixes', () => {
        it('journals the tasks and child tags touched by a tag deletion', async () => {
            await push(agent, [
                upsert(
                    'op-td1',
                    'tag',
                    'clienttag000020',
                    { name: 'parent' },
                    hlc(1)
                ),
                upsert(
                    'op-td2',
                    'tag',
                    'clienttag000021',
                    { name: 'child', parent_uid: 'clienttag000020' },
                    hlc(1)
                ),
                upsert(
                    'op-td3',
                    'task',
                    'clienttask00041',
                    { name: 'T', tag_uids: ['clienttag000020'] },
                    hlc(1)
                ),
            ]);
            const before = await agent.get('/api/v1/sync/pull?cursor=0');

            const del = await agent.delete('/api/tag/clienttag000020');
            expect(del.status).toBeLessThan(300);

            const after = await agent.get(
                `/api/v1/sync/pull?cursor=${before.body.cursor}`
            );
            const last = (uid) =>
                after.body.changes.filter((c) => c.uid === uid).pop();
            expect(last('clienttask00041').data.tag_uids).toEqual([]);
            expect(last('clienttag000021').data.parent_uid).toBeNull();
            expect(last('clienttag000020').op).toBe('delete');
        });

        it('lets a web edit beat a stored future clock after a server restart', async () => {
            const ahead = Date.now() + 60 * 60 * 1000;
            await push(agent, [
                upsert(
                    'op-fc1',
                    'task',
                    'clienttask00040',
                    { name: 'Device' },
                    hlc(ahead)
                ),
            ]);
            require('../../modules/sync/hlc').resetForTests();

            await agent
                .patch('/api/task/clienttask00040')
                .send({ name: 'Web after restart' });
            const stale = await push(agent, [
                upsert(
                    'op-fc2',
                    'task',
                    'clienttask00040',
                    { name: 'Older' },
                    hlc(ahead - 1000, 0, 'devB')
                ),
            ]);

            expect(stale.body.results[0].status).toBe('conflict');
            const task = await Task.findOne({
                where: { uid: 'clienttask00040' },
            });
            expect(task.name).toBe('Web after restart');
        });

        it('rejects a reference without a value but keeps the batch going', async () => {
            const res = await push(agent, [
                {
                    op_id: 'op-rv1',
                    entity: 'task',
                    uid: 'clienttask00030',
                    action: 'upsert',
                    fields: {
                        name: { value: 'x', hlc: hlc(1) },
                        project_uid: { hlc: hlc(1) },
                    },
                },
                upsert(
                    'op-rv2',
                    'task',
                    'clienttask00031',
                    { name: 'ok' },
                    hlc(1)
                ),
            ]);

            expect(res.status).toBe(200);
            expect(res.body.results.map((r) => r.status)).toEqual([
                'rejected',
                'applied',
            ]);
        });

        it('keeps the cursor given by the first snapshot page', async () => {
            await agent.post('/api/project').send({ name: 'P1' });
            const first = await agent.get(
                '/api/v1/sync/snapshot?entity=project&limit=1'
            );
            await agent.post('/api/project').send({ name: 'P2' });

            const next = await agent.get(
                `/api/v1/sync/snapshot?entity=project&limit=1&after=${first.body.next || 0}&cursor=${first.body.cursor}`
            );

            expect(next.body.cursor).toBe(first.body.cursor);
        });

        it('deletes a project through sync like the web does, tasks included', async () => {
            await push(agent, [
                upsert(
                    'op-pd1',
                    'project',
                    'clientproj00030',
                    { name: 'P' },
                    hlc(1)
                ),
                upsert(
                    'op-pd2',
                    'task',
                    'clienttask00032',
                    { name: 'T', project_uid: 'clientproj00030' },
                    hlc(1)
                ),
            ]);

            await push(agent, [
                {
                    op_id: 'op-pd3',
                    entity: 'project',
                    uid: 'clientproj00030',
                    action: 'delete',
                    hlc: hlc(2),
                },
            ]);

            expect(
                await Project.count({ where: { uid: 'clientproj00030' } })
            ).toBe(0);
            expect(
                await Task.count({ where: { uid: 'clienttask00032' } })
            ).toBe(0);
        });

        it('accepts a tag nested under a grandchild level', async () => {
            const res = await push(agent, [
                upsert(
                    'op-n1',
                    'tag',
                    'clienttag000010',
                    { name: 'a' },
                    hlc(1)
                ),
                upsert(
                    'op-n2',
                    'tag',
                    'clienttag000011',
                    { name: 'b', parent_uid: 'clienttag000010' },
                    hlc(1)
                ),
                upsert(
                    'op-n3',
                    'tag',
                    'clienttag000012',
                    { name: 'c', parent_uid: 'clienttag000011' },
                    hlc(1)
                ),
            ]);

            expect(res.body.results.map((r) => r.status)).toEqual([
                'applied',
                'applied',
                'applied',
            ]);
            const c = await Tag.findOne({ where: { uid: 'clienttag000012' } });
            expect(c.name).toBe('a/b/c');
        });

        it('refuses to move a tag under one of its descendants', async () => {
            const res = await push(agent, [
                upsert(
                    'op-m1',
                    'tag',
                    'clienttag000013',
                    { name: 'top' },
                    hlc(1)
                ),
                upsert(
                    'op-m2',
                    'tag',
                    'clienttag000014',
                    { name: 'mid', parent_uid: 'clienttag000013' },
                    hlc(1)
                ),
                upsert(
                    'op-m3',
                    'tag',
                    'clienttag000013',
                    { parent_uid: 'clienttag000014' },
                    hlc(2)
                ),
            ]);

            expect(res.body.results.map((r) => r.status)).toEqual([
                'applied',
                'applied',
                'rejected',
            ]);
        });
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

    describe('project image', () => {
        it('sends the image to clients and ignores one pushed by a client', async () => {
            const image = '/api/uploads/projects/project-1.jpg';
            await push(agent, [
                upsert(
                    'op-img1',
                    'project',
                    'clientproj0img1',
                    { name: 'Banner' },
                    hlc(1)
                ),
            ]);
            await Project.update(
                { image_url: image },
                { where: { uid: 'clientproj0img1' }, individualHooks: true }
            );

            const pulled = await agent.get('/api/v1/sync/pull?cursor=0');
            const change = pulled.body.changes
                .filter((c) => c.uid === 'clientproj0img1')
                .pop();
            expect(change.data.image_url).toBe(image);

            await push(agent, [
                upsert(
                    'op-img2',
                    'project',
                    'clientproj0img1',
                    { image_url: '/api/uploads/projects/other.jpg' },
                    hlc(2)
                ),
            ]);
            const row = await Project.findOne({
                where: { uid: 'clientproj0img1' },
            });
            expect(row.image_url).toBe(image);
        });
    });

    describe('file-backed board fields', () => {
        it('sends the task section and the project handoff state, and ignores client values', async () => {
            const handoff = {
                next_action: 'Ship it',
                blockers: ['CI'],
                updated_at: '2026-11-20T10:00:00.000Z',
            };
            await push(agent, [
                upsert(
                    'op-bd1',
                    'project',
                    'clientproj0bd01',
                    { name: 'Board' },
                    hlc(1)
                ),
                upsert(
                    'op-bd2',
                    'task',
                    'clienttask0bd01',
                    { name: 'Bullet' },
                    hlc(1)
                ),
            ]);
            await Project.update(
                { handoff_state: handoff },
                { where: { uid: 'clientproj0bd01' }, individualHooks: true }
            );
            await Task.update(
                { source_section: 'Now' },
                { where: { uid: 'clienttask0bd01' }, individualHooks: true }
            );

            const pulled = await agent.get('/api/v1/sync/pull?cursor=0');
            const last = (uid) =>
                pulled.body.changes.filter((c) => c.uid === uid).pop();
            expect(last('clientproj0bd01').data.handoff_state).toEqual(handoff);
            expect(last('clienttask0bd01').data.source_section).toBe('Now');

            await push(agent, [
                upsert(
                    'op-bd3',
                    'project',
                    'clientproj0bd01',
                    { handoff_state: { next_action: 'Mine' } },
                    hlc(2)
                ),
                upsert(
                    'op-bd4',
                    'task',
                    'clienttask0bd01',
                    { source_section: 'Ideas' },
                    hlc(2)
                ),
            ]);
            const project = await Project.findOne({
                where: { uid: 'clientproj0bd01' },
            });
            const task = await Task.findOne({
                where: { uid: 'clienttask0bd01' },
            });
            expect(project.handoff_state).toEqual(handoff);
            expect(task.source_section).toBe('Now');
        });
    });

    describe('icons', () => {
        it('syncs a project and a tag icon both ways', async () => {
            const res = await push(agent, [
                upsert(
                    'op-ic1',
                    'project',
                    'clientproj00ic1',
                    { name: 'Bike', icon: 'bike' },
                    hlc(1)
                ),
                upsert(
                    'op-ic2',
                    'tag',
                    'clienttag00icon2',
                    { name: 'fit', icon: 'smoke-free' },
                    hlc(1)
                ),
            ]);
            expect(res.body.results.map((r) => r.status)).toEqual([
                'applied',
                'applied',
            ]);

            const pulled = await agent.get('/api/v1/sync/pull?cursor=0');
            const project = pulled.body.changes
                .filter((c) => c.uid === 'clientproj00ic1')
                .pop();
            const tag = pulled.body.changes
                .filter((c) => c.uid === 'clienttag00icon2')
                .pop();
            expect(project.data.icon).toBe('bike');
            expect(tag.data.icon).toBe('smoke-free');
        });

        it('rejects an invalid icon from a client', async () => {
            const res = await push(agent, [
                upsert(
                    'op-ic3',
                    'tag',
                    'clienttag00icon3',
                    { name: 'bad', icon: 'Home!' },
                    hlc(1)
                ),
            ]);
            expect(res.body.results[0].status).toBe('rejected');
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

    it('keeps an offline task or note whose project or tag was deleted meanwhile', async () => {
        const res = await push(agent, [
            upsert(
                'op-g1',
                'task',
                'clienttask00031',
                {
                    name: 'Written offline',
                    note: 'Long body',
                    project_uid: 'goneproject0001',
                    area_uid: 'goneareaxxxx001',
                    tag_uids: ['gonetagxxxxx001'],
                },
                hlc(1)
            ),
            upsert(
                'op-g2',
                'note',
                'clientnote00031',
                {
                    title: 'Offline note',
                    content: 'Body',
                    project_uid: 'goneproject0001',
                },
                hlc(1)
            ),
        ]);

        expect(res.body.results.map((r) => r.status)).toEqual([
            'applied',
            'applied',
        ]);
        const task = await Task.findOne({ where: { uid: 'clienttask00031' } });
        expect(task.note).toBe('Long body');
        expect(task.project_id).toBeNull();
        expect(task.area_id).toBeNull();
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

    describe('comments and assigned_to', () => {
        it('lists comment entity and task.assigned_to in /sync/meta', async () => {
            const res = await agent.get('/api/v1/sync/meta');
            expect(res.status).toBe(200);
            const comment = res.body.entities.find((e) => e.name === 'comment');
            expect(comment).toBeDefined();
            expect(comment.fields).toContain('body');
            expect(comment.refs.task_uid).toBe('task');

            const task = res.body.entities.find((e) => e.name === 'task');
            expect(task.fields).toContain('assigned_to');
        });

        it('pulls a comment created on the web', async () => {
            const snap = await agent.get('/api/v1/sync/snapshot?entity=task');
            const cursor = snap.body.cursor;

            const createdTask = await agent
                .post('/api/task')
                .send({ name: 'Task with web comment' });
            const taskUid = createdTask.body.uid;

            const createdComment = await agent
                .post(`/api/task/${taskUid}/comments`)
                .send({ body: 'Hello from web' });
            expect(createdComment.status).toBe(201);

            const pulled = await agent.get(
                `/api/v1/sync/pull?cursor=${cursor}`
            );
            expect(pulled.status).toBe(200);
            const commentChange = pulled.body.changes.find(
                (c) =>
                    c.entity === 'comment' && c.uid === createdComment.body.uid
            );
            expect(commentChange).toBeDefined();
            expect(commentChange.op).toBe('upsert');
            expect(commentChange.data.body).toBe('Hello from web');
            expect(commentChange.data.task_uid).toBe(taskUid);
            expect(commentChange.data.author_uid).toBeTruthy();
        });

        it('pushes a comment from phone and exposes it in GET /task/:uid/comments', async () => {
            await push(agent, [
                upsert(
                    'op-t-cmt',
                    'task',
                    'clienttaskcmt01',
                    { name: 'Phone task' },
                    hlc(10)
                ),
                upsert(
                    'op-c-1',
                    'comment',
                    'clientcmt000001',
                    { body: 'From phone', task_uid: 'clienttaskcmt01' },
                    hlc(11)
                ),
            ]).then((r) => {
                expect(r.status).toBe(200);
                expect(r.body.results.map((x) => x.status)).toEqual([
                    'applied',
                    'applied',
                ]);
            });

            const list = await agent.get('/api/task/clienttaskcmt01/comments');
            expect(list.status).toBe(200);
            expect(list.body.comments).toHaveLength(1);
            expect(list.body.comments[0].uid).toBe('clientcmt000001');
            expect(list.body.comments[0].body).toBe('From phone');
            expect(list.body.comments[0].is_own).toBe(true);
        });

        it('soft-deletes a comment via sync, journals an upsert with deleted_at, and preserves replies', async () => {
            const owner = await signIn('cmt-reply-owner@example.com');
            const collab = await signIn('cmt-reply-survive@example.com');
            await push(owner.agent, [
                upsert(
                    'op-t-delc',
                    'task',
                    'clienttaskcmt02',
                    { name: 'Task' },
                    hlc(10)
                ),
                upsert(
                    'op-c-del1',
                    'comment',
                    'clientcmt000002',
                    { body: 'To delete', task_uid: 'clienttaskcmt02' },
                    hlc(11)
                ),
            ]);
            await Permission.create({
                user_id: collab.user.id,
                resource_type: 'task',
                resource_uid: 'clienttaskcmt02',
                access_level: 'rw',
                granted_by_user_id: owner.user.id,
                status: 'accepted',
            });
            await push(collab.agent, [
                upsert(
                    'op-c-reply-keep',
                    'comment',
                    'clientcmt000003',
                    {
                        body: 'Reply survives',
                        task_uid: 'clienttaskcmt02',
                        parent_comment_uid: 'clientcmt000002',
                    },
                    hlc(11, 1)
                ),
            ]);
            const snap = await owner.agent.get(
                '/api/v1/sync/snapshot?entity=comment'
            );
            const cursor = snap.body.cursor;

            const del = await push(owner.agent, [
                {
                    op_id: 'op-c-del2',
                    entity: 'comment',
                    uid: 'clientcmt000002',
                    action: 'delete',
                    hlc: hlc(12),
                },
            ]);
            expect(del.body.results[0].status).toBe('applied');
            const deletedRow = await Comment.findOne({
                where: { uid: 'clientcmt000002' },
            });
            expect(deletedRow).not.toBeNull();
            expect(deletedRow.body).toBe('');
            expect(deletedRow.deleted_at).not.toBeNull();

            const replyRow = await Comment.findOne({
                where: { uid: 'clientcmt000003' },
            });
            expect(replyRow).not.toBeNull();
            expect(replyRow.body).toBe('Reply survives');
            expect(replyRow.deleted_at).toBeNull();

            const pulled = await owner.agent.get(
                `/api/v1/sync/pull?cursor=${cursor}`
            );
            const tomb = pulled.body.changes.find(
                (c) => c.entity === 'comment' && c.uid === 'clientcmt000002'
            );
            expect(tomb).toBeDefined();
            expect(tomb.op).toBe('upsert');
            expect(tomb.data.deleted_at).toBeTruthy();
        });

        it('scopes shared task comments: collaborator can read and add own, cannot edit/delete others', async () => {
            const owner = await signIn('cmt-owner@example.com');
            const collab = await signIn('cmt-collab@example.com');

            const taskRes = await owner.agent
                .post('/api/task')
                .send({ name: 'Shared task' });
            const taskUid = taskRes.body.uid;

            await Permission.create({
                user_id: collab.user.id,
                resource_type: 'task',
                resource_uid: taskUid,
                access_level: 'rw',
                granted_by_user_id: owner.user.id,
            });

            const ownerComment = await owner.agent
                .post(`/api/task/${taskUid}/comments`)
                .send({ body: 'Owner note' });
            expect(ownerComment.status).toBe(201);

            const snap = await collab.agent.get(
                '/api/v1/sync/snapshot?entity=comment'
            );
            expect(snap.status).toBe(200);
            expect(
                snap.body.rows.some((r) => r.uid === ownerComment.body.uid)
            ).toBe(true);

            // Collab cannot overwrite or delete owner's comment
            const steal = await push(collab.agent, [
                upsert(
                    'op-steal-cmt',
                    'comment',
                    ownerComment.body.uid,
                    { body: 'Hacked' },
                    hlc(50)
                ),
            ]);
            expect(steal.body.results[0].status).toBe('rejected');
            expect(steal.body.results[0].reason).toBe('forbidden');

            const del = await push(collab.agent, [
                {
                    op_id: 'op-del-other-cmt',
                    entity: 'comment',
                    uid: ownerComment.body.uid,
                    action: 'delete',
                    hlc: hlc(51),
                },
            ]);
            expect(del.body.results[0].status).toBe('rejected');
            expect(del.body.results[0].reason).toBe('forbidden');

            // Collab can push their own comment on the shared task
            const own = await push(collab.agent, [
                upsert(
                    'op-collab-cmt',
                    'comment',
                    'collabcmt000001',
                    { body: 'Collab reply', task_uid: taskUid },
                    hlc(52)
                ),
            ]);
            expect(own.body.results[0].status).toBe('applied');
        });

        it('syncs task.assigned_to by person uid and rejects unauthorized assignees', async () => {
            const owner = await signIn('assign-sync@example.com');
            const person = await Person.create({
                name: 'Alice',
                user_id: owner.user.id,
            });
            const stranger = await signIn('stranger-sync@example.com');
            const strangerPerson = await Person.create({
                name: 'Bob',
                user_id: stranger.user.id,
            });

            const res = await push(owner.agent, [
                upsert(
                    'op-assign-1',
                    'task',
                    'clienttaskasg01',
                    { name: 'Assigned task', assigned_to: person.uid },
                    hlc(20)
                ),
                upsert(
                    'op-assign-bad',
                    'task',
                    'clienttaskasg02',
                    { name: 'Bad assign', assigned_to: strangerPerson.uid },
                    hlc(21)
                ),
            ]);
            expect(res.body.results[0].status).toBe('applied');
            expect(res.body.results[1].status).toBe('rejected');
            expect(res.body.results[1].reason).toBe('invalid_assignee');

            const snap = await owner.agent.get(
                '/api/v1/sync/snapshot?entity=task'
            );
            const row = snap.body.rows.find((r) => r.uid === 'clienttaskasg01');
            expect(row.assigned_to).toBe(person.uid);
        });

        it('excludes pending invitees and includes group-share, area, and subtask-parent users in comment pull', async () => {
            const owner = await signIn('cmt-aud-owner@example.com');
            const pendingUser = await signIn('cmt-aud-pending@example.com');
            const groupUser = await signIn('cmt-aud-group@example.com');
            const areaCollab = await signIn('cmt-aud-area@example.com');
            const parentProjCollab = await signIn('cmt-aud-pproj@example.com');

            const pendingSnap = await pendingUser.agent.get(
                '/api/v1/sync/snapshot?entity=comment'
            );
            const groupSnap = await groupUser.agent.get(
                '/api/v1/sync/snapshot?entity=comment'
            );
            const areaSnap = await areaCollab.agent.get(
                '/api/v1/sync/snapshot?entity=comment'
            );
            const pProjSnap = await parentProjCollab.agent.get(
                '/api/v1/sync/snapshot?entity=comment'
            );

            const area = await Area.create({
                name: 'Shared Area',
                user_id: owner.user.id,
            });
            await Permission.create({
                user_id: areaCollab.user.id,
                resource_type: 'area',
                resource_uid: area.uid,
                access_level: 'ro',
                status: 'accepted',
                granted_by_user_id: owner.user.id,
            });

            const project = await Project.create({
                name: 'Shared Parent Project',
                user_id: owner.user.id,
            });
            await Permission.create({
                user_id: parentProjCollab.user.id,
                resource_type: 'project',
                resource_uid: project.uid,
                access_level: 'ro',
                status: 'accepted',
                granted_by_user_id: owner.user.id,
            });

            const areaTask = await Task.create({
                name: 'Area task',
                user_id: owner.user.id,
                area_id: area.id,
            });
            await Permission.create({
                user_id: pendingUser.user.id,
                resource_type: 'task',
                resource_uid: areaTask.uid,
                access_level: 'rw',
                status: 'pending',
                granted_by_user_id: owner.user.id,
            });
            const group = await UserGroup.create({ name: 'Comment Group' });
            const groupShare = await GroupShare.create({
                group_id: group.id,
                resource_type: 'task',
                resource_uid: areaTask.uid,
                access_level: 'ro',
                granted_by_user_id: owner.user.id,
            });
            await GroupPermission.create({
                group_share_id: groupShare.id,
                user_id: groupUser.user.id,
                resource_type: 'task',
                resource_uid: areaTask.uid,
                access_level: 'ro',
                status: 'accepted',
                granted_by_user_id: owner.user.id,
            });

            const parentTask = await Task.create({
                name: 'Parent task',
                user_id: owner.user.id,
                project_id: project.id,
            });
            const subTask = await Task.create({
                name: 'Subtask',
                user_id: owner.user.id,
                parent_task_id: parentTask.id,
            });

            const c1 = await owner.agent
                .post(`/api/task/${areaTask.uid}/comments`)
                .send({ body: 'Secret to pending' });
            expect(c1.status).toBe(201);

            const c2 = await owner.agent
                .post(`/api/task/${subTask.uid}/comments`)
                .send({ body: 'Subtask comment' });
            expect(c2.status).toBe(201);

            const pendingPull = await pendingUser.agent.get(
                `/api/v1/sync/pull?cursor=${pendingSnap.body.cursor}`
            );
            expect(
                pendingPull.body.changes.some((c) => c.uid === c1.body.uid)
            ).toBe(false);

            const groupPull = await groupUser.agent.get(
                `/api/v1/sync/pull?cursor=${groupSnap.body.cursor}`
            );
            expect(
                groupPull.body.changes.some((c) => c.uid === c1.body.uid)
            ).toBe(true);

            const areaPull = await areaCollab.agent.get(
                `/api/v1/sync/pull?cursor=${areaSnap.body.cursor}`
            );
            expect(
                areaPull.body.changes.some((c) => c.uid === c1.body.uid)
            ).toBe(true);

            const pProjPull = await parentProjCollab.agent.get(
                `/api/v1/sync/pull?cursor=${pProjSnap.body.cursor}`
            );
            expect(
                pProjPull.body.changes.some((c) => c.uid === c2.body.uid)
            ).toBe(true);

            // Snapshot also includes group-share user
            const groupSnapAfter = await groupUser.agent.get(
                '/api/v1/sync/snapshot?entity=comment'
            );
            expect(
                groupSnapAfter.body.rows.some((r) => r.uid === c1.body.uid)
            ).toBe(true);
        });

        it('orders SyncChange rows by ascending numeric user_id when journaling a comment', async () => {
            const owner = await signIn('cmt-ord-owner@example.com');
            const collab = await signIn('cmt-ord-collab@example.com');
            expect(collab.user.id).toBeGreaterThan(owner.user.id);

            const taskRes = await owner.agent
                .post('/api/task')
                .send({ name: 'Ordered journal task' });
            await Permission.create({
                user_id: collab.user.id,
                resource_type: 'task',
                resource_uid: taskRes.body.uid,
                access_level: 'rw',
                status: 'accepted',
                granted_by_user_id: owner.user.id,
            });

            // Collab (higher user_id) creates the comment, so row.user_id > owner.user.id
            const res = await push(collab.agent, [
                upsert(
                    'op-ord-1',
                    'comment',
                    'ordcmt000000001',
                    { body: 'Hi owner', task_uid: taskRes.body.uid },
                    hlc(30)
                ),
            ]);
            expect(res.body.results[0].status).toBe('applied');

            const changes = await SyncChange.findAll({
                where: { entity: 'comment', uid: 'ordcmt000000001' },
                order: [['id', 'ASC']],
                raw: true,
            });
            expect(changes.map((c) => c.user_id)).toEqual([
                owner.user.id,
                collab.user.id,
            ]);
        });

        it('rethrows generic Sequelize database errors instead of mapping them to invalid_value', async () => {
            const { Sequelize } = require('sequelize');
            const taskRes = await agent
                .post('/api/task')
                .send({ name: 'DB err task' });
            const spy = jest.spyOn(Comment, 'create').mockRejectedValueOnce(
                new Sequelize.DatabaseError(
                    Object.assign(new Error('deadlock detected'), {
                        code: '40P01',
                    })
                )
            );
            try {
                const res = await push(agent, [
                    upsert(
                        'op-dberr-1',
                        'comment',
                        'dberrcmt0000001',
                        { body: 'Fail 500', task_uid: taskRes.body.uid },
                        hlc(31)
                    ),
                ]);
                expect(res.status).toBe(500);
            } finally {
                spy.mockRestore();
            }
        });

        it('refuses a value the database rejects as bad data (Postgres 22xxx)', async () => {
            const { Sequelize } = require('sequelize');
            const taskRes = await agent
                .post('/api/task')
                .send({ name: 'Bad data task' });
            const spy = jest.spyOn(Comment, 'create').mockRejectedValueOnce(
                new Sequelize.DatabaseError(
                    Object.assign(new Error('invalid input syntax'), {
                        code: '22P02',
                    })
                )
            );
            try {
                const res = await push(agent, [
                    upsert(
                        'op-baddata-1',
                        'comment',
                        'baddatacmt00001',
                        { body: 'Bad', task_uid: taskRes.body.uid },
                        hlc(32)
                    ),
                ]);
                expect(res.status).toBe(200);
                expect(res.body.results[0]).toMatchObject({
                    status: 'rejected',
                    reason: 'invalid_value',
                });
            } finally {
                spy.mockRestore();
            }
        });

        it('refuses comment upsert and delete with forbidden when task access was revoked', async () => {
            const owner = await signIn('cmt-rev-owner@example.com');
            const collab = await signIn('cmt-rev-collab@example.com');

            const taskRes = await owner.agent
                .post('/api/task')
                .send({ name: 'Revocable task' });
            const perm = await Permission.create({
                user_id: collab.user.id,
                resource_type: 'task',
                resource_uid: taskRes.body.uid,
                access_level: 'rw',
                status: 'accepted',
                granted_by_user_id: owner.user.id,
            });

            const created = await push(collab.agent, [
                upsert(
                    'op-rev-create',
                    'comment',
                    'revcmt000000001',
                    { body: 'Initial', task_uid: taskRes.body.uid },
                    hlc(40)
                ),
            ]);
            expect(created.body.results[0].status).toBe('applied');

            await perm.destroy();

            const editRes = await push(collab.agent, [
                upsert(
                    'op-rev-edit',
                    'comment',
                    'revcmt000000001',
                    { body: 'After revoke' },
                    hlc(41)
                ),
            ]);
            expect(editRes.body.results[0]).toMatchObject({
                status: 'rejected',
                reason: 'forbidden',
            });

            const delRes = await push(collab.agent, [
                {
                    op_id: 'op-rev-del',
                    entity: 'comment',
                    uid: 'revcmt000000001',
                    action: 'delete',
                    hlc: hlc(42),
                },
            ]);
            expect(delRes.body.results[0]).toMatchObject({
                status: 'rejected',
                reason: 'forbidden',
            });
        });

        it('refuses pushing body onto a soft-deleted comment with deleted', async () => {
            const taskRes = await agent
                .post('/api/task')
                .send({ name: 'Deleted body task' });
            const cmt = await agent
                .post(`/api/task/${taskRes.body.uid}/comments`)
                .send({ body: 'Will delete' });
            const delRes = await agent.delete(`/api/comment/${cmt.body.uid}`);
            expect(delRes.status).toBe(200);

            const res = await push(agent, [
                upsert(
                    'op-push-del-body',
                    'comment',
                    cmt.body.uid,
                    { body: 'Resurrect' },
                    hlc(50)
                ),
            ]);
            expect(res.body.results[0]).toMatchObject({
                status: 'rejected',
                reason: 'deleted',
            });
        });

        it('refuses changing task_uid on an existing comment with invalid_value', async () => {
            const t1 = await agent.post('/api/task').send({ name: 'T1' });
            const t2 = await agent.post('/api/task').send({ name: 'T2' });

            const created = await push(agent, [
                upsert(
                    'op-move-c1',
                    'comment',
                    'movecmt00000001',
                    { body: 'On T1', task_uid: t1.body.uid },
                    hlc(60)
                ),
            ]);
            expect(created.body.results[0].status).toBe('applied');

            const moved = await push(agent, [
                upsert(
                    'op-move-c2',
                    'comment',
                    'movecmt00000001',
                    { task_uid: t2.body.uid },
                    hlc(61)
                ),
            ]);
            expect(moved.body.results[0]).toMatchObject({
                status: 'rejected',
                reason: 'invalid_value',
            });
        });

        it('refuses replying to a reply or across tasks, and allows replying to another user comment', async () => {
            const owner = await signIn('cmt-rep-owner@example.com');
            const collab = await signIn('cmt-rep-collab@example.com');

            const t1 = await owner.agent
                .post('/api/task')
                .send({ name: 'Thread task' });
            const t2 = await owner.agent
                .post('/api/task')
                .send({ name: 'Other task' });
            await Permission.create({
                user_id: collab.user.id,
                resource_type: 'task',
                resource_uid: t1.body.uid,
                access_level: 'rw',
                status: 'accepted',
                granted_by_user_id: owner.user.id,
            });

            const root = await owner.agent
                .post(`/api/task/${t1.body.uid}/comments`)
                .send({ body: 'Root' });
            const otherTaskCmt = await owner.agent
                .post(`/api/task/${t2.body.uid}/comments`)
                .send({ body: 'Other' });

            // Collab replies to owner's root comment
            const replyRes = await push(collab.agent, [
                upsert(
                    'op-rep-ok',
                    'comment',
                    'repcmt000000001',
                    {
                        body: 'Reply 1',
                        task_uid: t1.body.uid,
                        parent_comment_uid: root.body.uid,
                    },
                    hlc(70)
                ),
            ]);
            expect(replyRes.body.results[0].status).toBe('applied');

            // Reply to a reply -> refused
            const nestedRes = await push(owner.agent, [
                upsert(
                    'op-rep-nested',
                    'comment',
                    'repcmt000000002',
                    {
                        body: 'Reply 2',
                        task_uid: t1.body.uid,
                        parent_comment_uid: 'repcmt000000001',
                    },
                    hlc(71)
                ),
            ]);
            expect(nestedRes.body.results[0].status).toBe('rejected');

            // Reply across tasks -> refused
            const crossRes = await push(owner.agent, [
                upsert(
                    'op-rep-cross',
                    'comment',
                    'repcmt000000003',
                    {
                        body: 'Cross',
                        task_uid: t1.body.uid,
                        parent_comment_uid: otherTaskCmt.body.uid,
                    },
                    hlc(72)
                ),
            ]);
            expect(crossRes.body.results[0].status).toBe('rejected');
        });

        it('logs comment_added task event and creates notification when comment is created via sync', async () => {
            const owner = await signIn('cmt-fx-owner@example.com');
            const collab = await signIn('cmt-fx-collab@example.com');

            const t = await owner.agent
                .post('/api/task')
                .send({ name: 'Notify task' });
            await Permission.create({
                user_id: collab.user.id,
                resource_type: 'task',
                resource_uid: t.body.uid,
                access_level: 'rw',
                status: 'accepted',
                granted_by_user_id: owner.user.id,
            });

            const res = await push(collab.agent, [
                upsert(
                    'op-fx-1',
                    'comment',
                    'fxcmt0000000001',
                    { body: 'Ping owner', task_uid: t.body.uid },
                    hlc(80)
                ),
            ]);
            expect(res.body.results[0].status).toBe('applied');

            const task = await Task.findOne({ where: { uid: t.body.uid } });
            const event = await TaskEvent.findOne({
                where: { task_id: task.id, event_type: 'comment_added' },
            });
            expect(event).not.toBeNull();

            const notif = await Notification.findOne({
                where: { user_id: owner.user.id, type: 'comment_added' },
            });
            expect(notif).not.toBeNull();
        });
    });

    describe('project_section sync', () => {
        it('keeps a queued web rename that loses to a newer device edit as a conflict', async () => {
            const proj = await agent.post('/api/project').send({ name: 'Q' });
            const sec = await agent
                .post(`/api/project/${proj.body.uid}/sections`)
                .send({ name: 'A' });
            await push(agent, [
                upsert(
                    'op-sec-newer',
                    'project_section',
                    sec.body.uid,
                    { name: 'Phone' },
                    hlc(Date.now() + 3600e3)
                ),
            ]);
            const res = await agent
                .patch(`/api/project/${proj.body.uid}/sections/${sec.body.uid}`)
                .set(
                    'X-Cadence-Offline-Clock',
                    hlc(Date.now() - 1000, 0, 'web')
                )
                .send({ name: 'Web old' });
            expect(res.status).toBeLessThan(300);
            const row = await ProjectSection.findOne({
                where: { uid: sec.body.uid },
            });
            expect(row.name).toBe('Phone');
        });

        it('journals a delete for each section when the project is deleted', async () => {
            const proj = await agent.post('/api/project').send({ name: 'D' });
            const sec = await agent
                .post(`/api/project/${proj.body.uid}/sections`)
                .send({ name: 'S' });
            const del = await agent.delete(`/api/project/${proj.body.uid}`);
            expect(del.status).toBeLessThan(300);
            const pullRes = await agent.get('/api/v1/sync/pull?cursor=0');
            const ops = pullRes.body.changes
                .filter(
                    (c) =>
                        c.entity === 'project_section' && c.uid === sec.body.uid
                )
                .map((c) => c.op);
            expect(ops[ops.length - 1]).toBe('delete');
        });

        it('refuses a section position beyond 32-bit range', async () => {
            const proj = await agent.post('/api/project').send({ name: 'H' });
            const res = await push(agent, [
                upsert(
                    'op-sec-huge',
                    'project_section',
                    'secuidhuge00001',
                    { name: 'n', position: 1e20, project_uid: proj.body.uid },
                    hlc(100)
                ),
            ]);
            expect(res.body.results[0].status).toBe('rejected');
        });

        it('pulls a section created on the web', async () => {
            const proj = await agent
                .post('/api/project')
                .send({ name: 'Web Board' });
            const sec = await agent
                .post(`/api/project/${proj.body.uid}/sections`)
                .send({ name: 'In Progress' });
            expect(sec.status).toBe(201);

            const pullRes = await agent.get('/api/v1/sync/pull?cursor=0');
            expect(pullRes.status).toBe(200);
            const change = pullRes.body.changes.find(
                (c) => c.entity === 'project_section' && c.uid === sec.body.uid
            );
            expect(change).toBeDefined();
            expect(change.op).toBe('upsert');
            expect(change.data).toMatchObject({
                uid: sec.body.uid,
                name: 'In Progress',
                position: 0,
                project_uid: proj.body.uid,
            });
        });

        it('pushes a section from phone and lists it in GET project sections', async () => {
            const proj = await agent
                .post('/api/project')
                .send({ name: 'Phone Board' });

            const res = await push(agent, [
                upsert(
                    'op-sec-1',
                    'project_section',
                    'secuid000000001',
                    {
                        name: 'Backlog',
                        position: 0,
                        project_uid: proj.body.uid,
                    },
                    hlc(100)
                ),
            ]);
            expect(res.status).toBe(200);
            expect(res.body.results[0]).toEqual({
                op_id: 'op-sec-1',
                status: 'applied',
            });

            const list = await agent.get(
                `/api/project/${proj.body.uid}/sections`
            );
            expect(list.status).toBe(200);
            expect(list.body).toHaveLength(1);
            expect(list.body[0]).toMatchObject({
                uid: 'secuid000000001',
                name: 'Backlog',
                position: 0,
            });

            // Rejects blank name or foreign project
            const other = await signIn('sec-other@example.com');
            const otherProj = await other.agent
                .post('/api/project')
                .send({ name: 'Foreign' });
            const bad = await push(agent, [
                upsert(
                    'op-sec-blank',
                    'project_section',
                    'secuid000000002',
                    {
                        name: '   ',
                        position: 1,
                        project_uid: proj.body.uid,
                    },
                    hlc(101)
                ),
                upsert(
                    'op-sec-foreign',
                    'project_section',
                    'secuid000000003',
                    {
                        name: 'Hijack',
                        position: 0,
                        project_uid: otherProj.body.uid,
                    },
                    hlc(102)
                ),
            ]);
            expect(bad.body.results[0].status).toBe('rejected');
            expect(bad.body.results[1].status).toBe('rejected');
            expect(bad.body.results[1].reason).toBe(
                'invalid_reference:project_uid'
            );
        });

        it('moves a task to a section via push and shows on web, refusing section of another project', async () => {
            const p1 = await agent.post('/api/project').send({ name: 'P1' });
            const p2 = await agent.post('/api/project').send({ name: 'P2' });
            const sec1 = await agent
                .post(`/api/project/${p1.body.uid}/sections`)
                .send({ name: 'Col 1' });
            const sec2 = await agent
                .post(`/api/project/${p2.body.uid}/sections`)
                .send({ name: 'Col 2' });
            const task = await agent
                .post('/api/task')
                .send({ name: 'Card', project_id: p1.body.id });

            const moveOk = await push(agent, [
                upsert(
                    'op-task-sec-1',
                    'task',
                    task.body.uid,
                    {
                        section_uid: sec1.body.uid,
                        section_position: 2,
                    },
                    hlc(200)
                ),
            ]);
            expect(moveOk.body.results[0].status).toBe('applied');

            const webTask = await agent.get(`/api/task/${task.body.uid}`);
            expect(webTask.status).toBe(200);
            expect(webTask.body.section_uid).toBe(sec1.body.uid);
            expect(webTask.body.section_position).toBe(2);

            // Section from another project is refused
            const moveBad = await push(agent, [
                upsert(
                    'op-task-sec-bad',
                    'task',
                    task.body.uid,
                    { section_uid: sec2.body.uid, section_position: 0 },
                    hlc(201)
                ),
            ]);
            expect(moveBad.body.results[0].status).toBe('rejected');
            expect(moveBad.body.results[0].reason).toMatch(
                /^invalid_reference/
            );

            // Moving task to another project without section_uid clears its section
            const moveProj = await push(agent, [
                upsert(
                    'op-task-proj-2',
                    'task',
                    task.body.uid,
                    { project_uid: p2.body.uid },
                    hlc(Date.now() + 2 * 60 * 60 * 1000)
                ),
            ]);
            expect(moveProj.body.results[0].status).toBe('applied');
            const afterMove = await Task.findOne({
                where: { uid: task.body.uid },
            });
            expect(afterMove.section_id).toBeNull();
            expect(afterMove.section_position).toBeNull();
        });

        it('deletes a section via sync like REST and journals task unsectioning', async () => {
            const proj = await agent
                .post('/api/project')
                .send({ name: 'Del Board' });
            const sec = await agent
                .post(`/api/project/${proj.body.uid}/sections`)
                .send({ name: 'Temp' });
            const createdTask = await agent.post('/api/task').send({
                name: 'Card in Temp',
                project_id: proj.body.id,
            });
            const task = await agent
                .patch(`/api/task/${createdTask.body.uid}`)
                .send({ section_uid: sec.body.uid });
            expect(task.body.section_uid).toBe(sec.body.uid);

            const before = await agent.get('/api/v1/sync/pull?cursor=0');
            const cursor = before.body.cursor;

            const delRes = await push(agent, [
                {
                    op_id: 'op-sec-del',
                    entity: 'project_section',
                    uid: sec.body.uid,
                    action: 'delete',
                    hlc: hlc(300),
                },
            ]);
            expect(delRes.body.results[0]).toEqual({
                op_id: 'op-sec-del',
                status: 'applied',
            });

            expect(
                await ProjectSection.findOne({ where: { uid: sec.body.uid } })
            ).toBeNull();

            const dbTask = await Task.findOne({
                where: { uid: task.body.uid },
            });
            expect(dbTask.section_id).toBeNull();
            expect(dbTask.section_position).toBeNull();

            // Task unsectioning and section tombstone are both journaled
            const pullAfter = await agent.get(
                `/api/v1/sync/pull?cursor=${cursor}`
            );
            const taskUpsert = pullAfter.body.changes.find(
                (c) => c.entity === 'task' && c.uid === task.body.uid
            );
            expect(taskUpsert).toBeDefined();
            expect(taskUpsert.op).toBe('upsert');
            expect(taskUpsert.data.section_uid).toBeNull();
            expect(taskUpsert.data.section_position).toBeNull();

            const secTombstone = pullAfter.body.changes.find(
                (c) => c.entity === 'project_section' && c.uid === sec.body.uid
            );
            expect(secTombstone).toBeDefined();
            expect(secTombstone.op).toBe('delete');
            expect(secTombstone.op_id).toBe('op-sec-del');
        });
    });
});
