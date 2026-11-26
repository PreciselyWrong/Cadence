'use strict';

// A task's history says who changed what: the app, a device (offline sync),
// the AI over MCP, or an AI suggestion the user accepted.
const request = require('supertest');
const app = require('../../app');
const { Task, Project, TaskEvent } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const { registerAllTools } = require('../../modules/mcp/toolRegistry');
const { toolsFor } = require('../../modules/triage/actions');

const hlc = (ms, counter = 0, node = 'devA') =>
    `${String(ms).padStart(13, '0')}-${String(counter).padStart(4, '0')}-${node}`;

const upsert = (opId, uid, fields, clock) => ({
    op_id: opId,
    entity: 'task',
    uid,
    action: 'upsert',
    fields: Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, { value: v, hlc: clock }])
    ),
});

function mcpTool(user, name) {
    const tools = [];
    registerAllTools(null, { userId: user.id, user }, tools);
    return (params) => tools.find((tool) => tool.name === name).handler(params);
}

const eventsOf = async (taskId) =>
    (
        await TaskEvent.findAll({
            where: { task_id: taskId },
            order: [['id', 'ASC']],
        })
    ).map((event) => ({
        type: event.event_type,
        source: event.metadata?.source,
    }));

describe('Task history', () => {
    let user;
    let agent;

    beforeEach(async () => {
        user = await createTestUser({ email: 'history@example.com' });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: 'history@example.com', password: 'password123' });
    });

    it('logs a task created in the app', async () => {
        const res = await agent.post('/api/task').send({ name: 'From web' });

        expect(res.status).toBe(201);
        const task = await Task.findOne({ where: { uid: res.body.uid } });
        expect(await eventsOf(task.id)).toEqual([
            { type: 'created', source: 'web' },
        ]);
    });

    it('logs what the AI creates and changes over MCP', async () => {
        const project = await Project.create({
            name: 'Maison',
            user_id: user.id,
        });
        const created = await mcpTool(user, 'create_task')({ name: 'Car' });
        const uid = JSON.parse(created.content[0].text).task.uid;
        await mcpTool(
            user,
            'update_task'
        )({
            id: uid,
            due_date: '2026-11-26',
            project_id: project.id,
        });

        const task = await Task.findOne({ where: { uid } });
        expect(await eventsOf(task.id)).toEqual([
            { type: 'created', source: 'ai' },
            { type: 'project_id_changed', source: 'ai' },
            { type: 'due_date_changed', source: 'ai' },
        ]);
    });

    it('marks a change from an accepted AI suggestion', async () => {
        const task = await Task.create({ name: 'Plan me', user_id: user.id });

        await toolsFor(user)('update_task', {
            id: task.uid,
            due_date: '2026-11-26',
        });

        expect(await eventsOf(task.id)).toEqual([
            { type: 'due_date_changed', source: 'suggestion' },
        ]);
    });

    it('logs a task created and renamed on a device', async () => {
        await agent.post('/api/v1/sync/push').send({
            ops: [upsert('op-1', 'devicetask00001', { name: 'A' }, hlc(1))],
        });
        await agent.post('/api/v1/sync/push').send({
            ops: [upsert('op-2', 'devicetask00001', { name: 'B' }, hlc(2))],
        });

        const task = await Task.findOne({ where: { uid: 'devicetask00001' } });
        expect(await eventsOf(task.id)).toEqual([
            { type: 'created', source: 'device' },
            { type: 'name_changed', source: 'device' },
        ]);
    });

    it('opens an older task history with its creation', async () => {
        const res = await agent.post('/api/task').send({ name: 'Old' });
        const task = await Task.findOne({ where: { uid: res.body.uid } });
        await TaskEvent.destroy({ where: { task_id: task.id } });

        const timeline = await agent.get(`/api/task/${task.uid}/timeline`);

        expect(timeline.body).toEqual([
            expect.objectContaining({ id: 0, event_type: 'created' }),
        ]);
        expect(new Date(timeline.body[0].created_at).getTime()).toBe(
            task.created_at.getTime()
        );
    });

    it('serves the history with its sources', async () => {
        const res = await agent.post('/api/task').send({ name: 'Timeline' });

        const timeline = await agent.get(`/api/task/${res.body.uid}/timeline`);

        expect(timeline.status).toBe(200);
        expect(timeline.body[0]).toMatchObject({
            event_type: 'created',
            metadata: { source: 'web' },
        });
    });
});
