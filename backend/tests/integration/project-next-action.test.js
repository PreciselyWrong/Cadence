const request = require('supertest');
const app = require('../../app');
const { Project, Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('Project next action', () => {
    let agent;

    beforeEach(async () => {
        await createTestUser({ email: 'nextaction@example.com' });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'nextaction@example.com',
            password: 'password123',
        });
    });

    const makeProject = async (name = 'Launch') =>
        (await agent.post('/api/project').send({ name })).body;
    const makeTask = async (name, project_uid) =>
        (await agent.post('/api/task').send({ name, project_uid })).body;
    const stored = (uid) => Project.findOne({ where: { uid } });
    const designate = (projectUid, taskUid) =>
        agent
            .patch(`/api/project/${projectUid}`)
            .send({ next_task_uid: taskUid });

    it('designates a task of the project as next action', async () => {
        const project = await makeProject();
        const task = await makeTask('Call the printer', project.uid);

        const res = await designate(project.uid, task.uid);

        expect(res.status).toBe(200);
        expect(res.body.next_task_uid).toBe(task.uid);
        expect((await stored(project.uid)).next_task_uid).toBe(task.uid);
    });

    it('refuses a task from another project', async () => {
        const project = await makeProject();
        const other = await makeProject('Other');
        const task = await makeTask('Elsewhere', other.uid);

        const res = await designate(project.uid, task.uid);

        expect(res.status).toBe(400);
        expect((await stored(project.uid)).next_task_uid).toBeNull();
    });

    it('refuses a done task', async () => {
        const project = await makeProject();
        const task = await makeTask('Already done', project.uid);
        await Task.update({ status: 2 }, { where: { uid: task.uid } });

        const res = await designate(project.uid, task.uid);

        expect(res.status).toBe(400);
    });

    it('clears it with null', async () => {
        const project = await makeProject();
        const task = await makeTask('Temp', project.uid);
        await designate(project.uid, task.uid);

        const res = await designate(project.uid, null);

        expect(res.status).toBe(200);
        expect((await stored(project.uid)).next_task_uid).toBeNull();
    });

    it('is cleared when the task is completed', async () => {
        const project = await makeProject();
        const task = await makeTask('Finish me', project.uid);
        await designate(project.uid, task.uid);

        await agent.patch(`/api/task/${task.uid}`).send({ status: 'done' });

        expect((await stored(project.uid)).next_task_uid).toBeNull();
    });

    it('is cleared when the task is deleted', async () => {
        const project = await makeProject();
        const task = await makeTask('Delete me', project.uid);
        await designate(project.uid, task.uid);

        await agent.delete(`/api/task/${task.uid}`);

        expect((await stored(project.uid)).next_task_uid).toBeNull();
    });

    it('is cleared when the task moves to another project', async () => {
        const project = await makeProject();
        const other = await makeProject('Other');
        const task = await makeTask('Mover', project.uid);
        await designate(project.uid, task.uid);

        await agent
            .patch(`/api/task/${task.uid}`)
            .send({ project_uid: other.uid });

        expect((await stored(project.uid)).next_task_uid).toBeNull();
    });

    it('stays when another task of the project changes', async () => {
        const project = await makeProject();
        const task = await makeTask('Keep', project.uid);
        const sibling = await makeTask('Sibling', project.uid);
        await designate(project.uid, task.uid);

        await agent.patch(`/api/task/${sibling.uid}`).send({ status: 'done' });

        expect((await stored(project.uid)).next_task_uid).toBe(task.uid);
    });

    it('is returned with its title on the project page', async () => {
        const project = await makeProject();
        const task = await makeTask('Book the venue', project.uid);
        await designate(project.uid, task.uid);

        const res = await agent.get(`/api/project/${project.uid}`);

        expect(res.body.next_task_uid).toBe(task.uid);
        expect(res.body.next_task).toEqual({
            uid: task.uid,
            name: 'Book the venue',
        });
    });

    it('is returned with its title in the project list', async () => {
        const project = await makeProject();
        const task = await makeTask('Book the venue', project.uid);
        await designate(project.uid, task.uid);

        const res = await agent.get('/api/projects');
        const listed = res.body.projects.find((p) => p.uid === project.uid);

        expect(listed.next_task).toEqual({
            uid: task.uid,
            name: 'Book the venue',
        });
    });

    it('is exposed to sync clients as a project field', async () => {
        const { ENTITIES } = require('../../modules/sync/registry');
        expect(ENTITIES.project.fields).toContain('next_task_uid');
    });
});
