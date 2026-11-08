'use strict';

// « Quand ? » : a task filed for the user (project or domain) without any
// moment stays in « Tâches à classer » until the user decides when.
const request = require('supertest');
const app = require('../../app');
const { Task, Area, Project } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('needs_when', () => {
    let user;
    let agent;
    let area;
    let project;

    const unsortedNames = async () => {
        const res = await agent.get('/api/tasks?type=unsorted');
        expect(res.status).toBe(200);
        return res.body.tasks.map((task) => task.name).sort();
    };
    const pending = (name, extra = {}) =>
        Task.create({
            user_id: user.id,
            name,
            status: 0,
            area_id: area.id,
            needs_when: true,
            ...extra,
        });

    beforeEach(async () => {
        user = await createTestUser({ email: `when_${Date.now()}@test.com` });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });
        area = await Area.create({ user_id: user.id, name: 'Famille' });
        project = await Project.create({ user_id: user.id, name: 'Maison' });
    });

    it('lists loose tasks and filed ones still waiting for a moment', async () => {
        await Task.create({ user_id: user.id, name: 'Libre', status: 0 });
        await pending('Classée sans moment');
        await Task.create({
            user_id: user.id,
            name: 'Rangée par moi',
            status: 0,
            project_id: project.id,
        });
        await Task.create({
            user_id: user.id,
            name: 'Datée',
            status: 0,
            due_date: new Date('2026-12-01T00:00:00Z'),
        });
        await Task.create({ user_id: user.id, name: 'Faite', status: 2 });
        const parent = await Task.create({
            user_id: user.id,
            name: 'Parent',
            status: 0,
            project_id: project.id,
        });
        await Task.create({
            user_id: user.id,
            name: 'Sous-tâche',
            status: 0,
            parent_task_id: parent.id,
        });
        const parked = await Task.create({
            user_id: user.id,
            name: 'Plus tard',
            status: 0,
        });
        await agent.patch(`/api/task/${parked.uid}`).send({ later: true });

        expect(await unsortedNames()).toEqual(['Classée sans moment', 'Libre']);
        const res = await agent.get('/api/tasks?type=unsorted');
        const filed = res.body.tasks.find(
            (t) => t.name === 'Classée sans moment'
        );
        expect(filed.needs_when).toBe(true);
    });

    it('is settled by any moment chosen, or by keeping it without one', async () => {
        const week = await pending('Semaine');
        const view = await pending('En vue');
        const parked = await pending('Plus tard');
        const dated = await pending('Datée');
        const kept = await pending('Sans date');

        const patch = (task, body) =>
            agent.patch(`/api/task/${task.uid}`).send(body);
        expect((await patch(week, { week_of: 'this_week' })).status).toBe(200);
        await patch(view, { in_view: true });
        await patch(parked, { later: true });
        await patch(dated, { due_date: '2026-12-01' });
        const keptRes = await patch(kept, { needs_when: false });
        expect(keptRes.body.needs_when).toBe(false);

        for (const task of [week, view, parked, dated, kept]) {
            await task.reload();
            expect([task.name, task.needs_when]).toEqual([task.name, false]);
        }
        expect(await unsortedNames()).toEqual([]);
    });

    it('travels through sync both ways', async () => {
        const task = await pending('Synchro');
        const meta = await agent.get('/api/v1/sync/meta');
        expect(meta.status).toBe(200);
        const snap = await agent.get('/api/v1/sync/snapshot?entity=task');
        const row = (snap.body.rows || []).find((r) => r.uid === task.uid);
        expect(row.needs_when).toBe(true);
    });
});
