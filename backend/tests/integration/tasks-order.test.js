const request = require('supertest');
const app = require('../../app');
const { UserTaskOrder, Project, sequelize } = require('../../models');
const { moveProjectOrders } = require('../../modules/tasks/order/service');
const {
    createTestUser,
    acceptAllInvitations,
} = require('../helpers/testUtils');

describe('Tasks manual order', () => {
    let owner, member, ownerAgent, memberAgent, project, tasks;

    const listUids = async (agent, extra = '') => {
        const res = await agent.get(
            `/api/tasks?order_by=custom:asc&limit=50&offset=0${extra}`
        );
        expect(res.status).toBe(200);
        return res.body.tasks.map((t) => t.uid);
    };

    beforeEach(async () => {
        owner = await createTestUser({ email: `owner_${Date.now()}@test.com` });
        member = await createTestUser({
            email: `member_${Date.now()}@test.com`,
        });
        ownerAgent = request.agent(app);
        memberAgent = request.agent(app);
        await ownerAgent
            .post('/api/login')
            .send({ email: owner.email, password: 'password123' });
        await memberAgent
            .post('/api/login')
            .send({ email: member.email, password: 'password123' });

        project = (await ownerAgent.post('/api/project').send({ name: 'P' }))
            .body;
        tasks = [];
        for (const name of ['A', 'B', 'C', 'D']) {
            const res = await ownerAgent
                .post('/api/task')
                .send({ name, project_uid: project.uid });
            tasks.push(res.body);
        }
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('sorts All Tasks by the saved order, unplaced tasks first', async () => {
        const [a, b, c, d] = tasks.map((t) => t.uid);
        const put = await ownerAgent
            .put('/api/tasks/order')
            .send({ scope: 'all', task_uids: [c, a] });
        expect(put.status).toBe(200);

        const uids = await listUids(ownerAgent);
        // b and d have no position yet, so they come first (newest first).
        expect(uids).toEqual([d, b, c, a]);

        const get = await ownerAgent.get('/api/tasks/order?scope=all');
        expect(get.body.task_uids).toEqual([c, a]);
    });

    it('moves only the visible tasks within their slots', async () => {
        const [a, b, c, d] = tasks.map((t) => t.uid);
        await ownerAgent
            .put('/api/tasks/order')
            .send({ scope: 'all', task_uids: [a, b, c, d] });
        // A filtered list showing b and d, with d dragged above b.
        await ownerAgent
            .put('/api/tasks/order')
            .send({ scope: 'all', task_uids: [d, b] });

        expect(await listUids(ownerAgent)).toEqual([a, d, c, b]);
    });

    it('starts from the base sort on a first drag under another sort', async () => {
        const [a, b, c, d] = tasks.map((t) => t.uid);
        // The page shows name order (a, b, c, d); only c and d are loaded
        // and d is dragged above c.
        const res = await ownerAgent.put('/api/tasks/order').send({
            scope: 'all',
            task_uids: [d, c],
            base_order_by: 'name:asc',
        });
        expect(res.status).toBe(200);
        expect(await listUids(ownerAgent)).toEqual([a, b, d, c]);

        const bad = await ownerAgent.put('/api/tasks/order').send({
            scope: 'all',
            task_uids: [d],
            base_order_by: 'custom:asc',
        });
        expect(bad.status).toBe(400);
    });

    it('keeps project order separate from All Tasks', async () => {
        const [a, b, c, d] = tasks.map((t) => t.uid);
        await ownerAgent.put('/api/tasks/order').send({
            scope: 'project',
            project_uid: project.uid,
            task_uids: [d, c, b, a],
        });

        const projectOrder = await ownerAgent.get(
            `/api/tasks/order?scope=project&project_uid=${project.uid}`
        );
        expect(projectOrder.body.task_uids).toEqual([d, c, b, a]);
        const allOrder = await ownerAgent.get('/api/tasks/order?scope=all');
        expect(allOrder.body.task_uids).toEqual([]);
    });

    it('shares the project order with editors; read-only members cannot change it', async () => {
        await ownerAgent.post('/api/shares').send({
            resource_type: 'project',
            resource_uid: project.uid,
            target_user_email: member.email,
            access_level: 'ro',
        });
        await acceptAllInvitations(memberAgent);
        const [a, b, c, d] = tasks.map((t) => t.uid);

        await ownerAgent.put('/api/tasks/order').send({
            scope: 'project',
            project_uid: project.uid,
            task_uids: [a, b, c, d],
        });
        const res = await memberAgent.put('/api/tasks/order').send({
            scope: 'project',
            project_uid: project.uid,
            task_uids: [d, c, b, a],
        });
        expect(res.status).toBe(403);

        const memberOrder = await memberAgent.get(
            `/api/tasks/order?scope=project&project_uid=${project.uid}`
        );
        expect(memberOrder.body.task_uids).toEqual([a, b, c, d]);
    });

    describe('project order is the synced task order', () => {
        const hlc = (ms) => `${String(ms).padStart(13, '0')}-0000-devA`;
        const pushOrder = (agent, orders) =>
            agent.post('/api/v1/sync/push').send({
                ops: Object.entries(orders).map(([uid, order], i) => ({
                    op_id: `op-order-${i}-${uid}`,
                    entity: 'task',
                    uid,
                    action: 'upsert',
                    fields: {
                        order: { value: order, hlc: hlc(Date.now() + 60000) },
                    },
                })),
            });
        const pulledOrders = async (agent) => {
            const pulled = await agent.get('/api/v1/sync/pull?cursor=0');
            expect(pulled.status).toBe(200);
            const orders = {};
            pulled.body.changes
                .filter((c) => c.entity === 'task' && c.op === 'upsert')
                .forEach((c) => {
                    orders[c.uid] = c.data.order;
                });
            return orders;
        };

        it('a web drag is the order a device pulls', async () => {
            const [a, b, c, d] = tasks.map((t) => t.uid);
            const put = await ownerAgent.put('/api/tasks/order').send({
                scope: 'project',
                project_uid: project.uid,
                task_uids: [d, b, a, c],
            });
            expect(put.status).toBe(200);

            const orders = await pulledOrders(ownerAgent);
            expect([a, b, c, d].map((uid) => orders[uid])).toEqual([
                2, 1, 3, 0,
            ]);
            expect(await UserTaskOrder.count()).toBe(0);
        });

        it('an order pushed by a device is the order the web reads', async () => {
            const [a, b, c, d] = tasks.map((t) => t.uid);
            const real = await pushOrder(ownerAgent, {
                [c]: 0,
                [a]: 1,
                [d]: 2,
                [b]: 3,
            });
            expect(real.body.results.every((r) => r.status === 'applied')).toBe(
                true
            );

            const get = await ownerAgent.get(
                `/api/tasks/order?scope=project&project_uid=${project.uid}`
            );
            expect(get.body.task_uids).toEqual([c, a, d, b]);
        });

        it('rejects a subtask in a project order', async () => {
            const sub = (
                await ownerAgent.post('/api/task').send({
                    name: 'Sub',
                    project_uid: project.uid,
                    parent_task_id: tasks[0].id,
                })
            ).body;
            const res = await ownerAgent.put('/api/tasks/order').send({
                scope: 'project',
                project_uid: project.uid,
                task_uids: [sub.uid],
            });
            expect(res.status).toBe(404);
        });

        it('moves a saved per-user project order onto the tasks, once', async () => {
            const [a, b, c, d] = tasks.map((t) => t.uid);
            const ids = Object.fromEntries(tasks.map((t) => [t.uid, t.id]));
            const projectRow = await Project.findOne({
                where: { uid: project.uid },
            });
            await UserTaskOrder.bulkCreate(
                [b, d, a].map((uid, position) => ({
                    user_id: owner.id,
                    task_id: ids[uid],
                    scope: `project:${projectRow.id}`,
                    position,
                }))
            );
            await UserTaskOrder.create({
                user_id: owner.id,
                task_id: ids[a],
                scope: 'all',
                position: 0,
            });

            const moved = await moveProjectOrders();
            expect(moved.projects).toBe(1);

            const get = await ownerAgent.get(
                `/api/tasks/order?scope=project&project_uid=${project.uid}`
            );
            expect(get.body.task_uids).toEqual([b, d, a]);
            const orders = await pulledOrders(ownerAgent);
            expect(orders[b]).toBe(0);
            expect(orders[c]).toBeNull();
            // All Tasks keeps its per-user order.
            expect(await UserTaskOrder.count()).toBe(1);
            expect((await moveProjectOrders()).projects).toBe(0);
        });

        it('keeps an order a device already wrote over an older saved one', async () => {
            const [a, b] = tasks.map((t) => t.uid);
            const projectRow = await Project.findOne({
                where: { uid: project.uid },
            });
            await pushOrder(ownerAgent, { [b]: 0, [a]: 1 });
            await UserTaskOrder.create({
                user_id: owner.id,
                task_id: tasks[0].id,
                scope: `project:${projectRow.id}`,
                position: 0,
            });

            await moveProjectOrders();

            const get = await ownerAgent.get(
                `/api/tasks/order?scope=project&project_uid=${project.uid}`
            );
            expect(get.body.task_uids).toEqual([b, a]);
            expect(await UserTaskOrder.count()).toBe(0);
        });
    });

    it('rejects tasks and projects the user cannot see', async () => {
        const res = await memberAgent
            .put('/api/tasks/order')
            .send({ scope: 'all', task_uids: [tasks[0].uid] });
        expect(res.status).toBe(404);

        const project404 = await memberAgent.get(
            `/api/tasks/order?scope=project&project_uid=${project.uid}`
        );
        expect(project404.status).toBe(404);
        expect(await UserTaskOrder.count()).toBe(0);
    });

    it('rejects a task from another project in a project scope', async () => {
        const other = (
            await ownerAgent.post('/api/project').send({ name: 'Other' })
        ).body;
        const res = await ownerAgent.put('/api/tasks/order').send({
            scope: 'project',
            project_uid: other.uid,
            task_uids: [tasks[0].uid],
        });
        expect(res.status).toBe(404);
    });

    it('rejects invalid payloads', async () => {
        const badScope = await ownerAgent
            .put('/api/tasks/order')
            .send({ scope: 'x', task_uids: [] });
        expect(badScope.status).toBe(400);

        const dupes = await ownerAgent.put('/api/tasks/order').send({
            scope: 'all',
            task_uids: [tasks[0].uid, tasks[0].uid],
        });
        expect(dupes.status).toBe(400);

        const noProject = await ownerAgent
            .put('/api/tasks/order')
            .send({ scope: 'project', task_uids: [] });
        expect(noProject.status).toBe(400);
    });

    describe('tag lists', () => {
        let tag;

        beforeEach(async () => {
            tag = (await ownerAgent.post('/api/tag').send({ name: 'Errands' }))
                .body;
        });

        it('keeps a tag list order apart from All Tasks and projects', async () => {
            const [a, b, c, d] = tasks.map((t) => t.uid);
            const put = await ownerAgent.put('/api/tasks/order').send({
                scope: 'tag',
                tag_uid: tag.uid,
                task_uids: [d, c, b, a],
            });
            expect(put.status).toBe(200);

            const get = await ownerAgent.get(
                `/api/tasks/order?scope=tag&tag_uid=${tag.uid}`
            );
            expect(get.body.task_uids).toEqual([d, c, b, a]);
            const allOrder = await ownerAgent.get('/api/tasks/order?scope=all');
            expect(allOrder.body.task_uids).toEqual([]);
        });

        it('hides another user tag and rejects a missing tag_uid', async () => {
            const get = await memberAgent.get(
                `/api/tasks/order?scope=tag&tag_uid=${tag.uid}`
            );
            expect(get.status).toBe(404);

            const put = await memberAgent.put('/api/tasks/order').send({
                scope: 'tag',
                tag_uid: tag.uid,
                task_uids: [tasks[0].uid],
            });
            expect(put.status).toBe(404);

            const noTag = await ownerAgent
                .put('/api/tasks/order')
                .send({ scope: 'tag', task_uids: [] });
            expect(noTag.status).toBe(400);
            expect(await UserTaskOrder.count()).toBe(0);
        });

        it('rejects a task the user cannot see in a tag order', async () => {
            const memberTask = (
                await memberAgent.post('/api/task').send({ name: 'Private' })
            ).body;
            const res = await ownerAgent.put('/api/tasks/order').send({
                scope: 'tag',
                tag_uid: tag.uid,
                task_uids: [tasks[0].uid, memberTask.uid],
            });
            expect(res.status).toBe(404);
            expect(await UserTaskOrder.count()).toBe(0);
        });
    });

    it('drops order rows when a task is deleted', async () => {
        await ownerAgent.put('/api/tasks/order').send({
            scope: 'all',
            task_uids: tasks.map((t) => t.uid),
        });
        const del = await ownerAgent.delete(`/api/task/${tasks[0].uid}`);
        expect(del.status).toBe(200);
        expect(await UserTaskOrder.count()).toBe(3);
    });
});
