const request = require('supertest');
const app = require('../../app');
const { Project, Area, Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('Sub-projects (projects.parent_project_id)', () => {
    let user, otherUser, area, otherArea, agent;

    const createProject = (overrides = {}) =>
        Project.create({
            name: 'Project',
            user_id: user.id,
            area_id: area.id,
            status: 'not_started',
            ...overrides,
        });

    beforeEach(async () => {
        user = await createTestUser({ email: 'hierarchy@example.com' });
        otherUser = await createTestUser({
            email: 'hierarchy-other@example.com',
        });
        area = await Area.create({ name: 'Work', user_id: user.id });
        otherArea = await Area.create({ name: 'Home', user_id: user.id });

        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'hierarchy@example.com',
            password: 'password123',
        });
    });

    describe('create', () => {
        it('creates a sub-project under a parent and forces the parent area', async () => {
            const parent = await createProject({
                name: 'Parent',
                area_id: area.id,
            });

            const response = await agent.post('/api/project').send({
                name: 'Child',
                parent_project_uid: parent.uid,
                area_id: otherArea.id,
            });

            expect(response.status).toBe(201);
            expect(response.body.parent_project_uid).toBe(parent.uid);
            expect(response.body.area_id).toBe(area.id);
        });

        it('rejects a parent owned by another user with 400', async () => {
            const foreign = await Project.create({
                name: 'Foreign',
                user_id: otherUser.id,
            });

            const response = await agent.post('/api/project').send({
                name: 'Child',
                parent_project_uid: foreign.uid,
            });

            expect(response.status).toBe(400);
        });

        it('rejects an unknown parent uid with 400', async () => {
            const response = await agent.post('/api/project').send({
                name: 'Child',
                parent_project_uid: 'does-not-exist',
            });

            expect(response.status).toBe(400);
        });
    });

    describe('update', () => {
        it('detaches a sub-project when parent_project_uid is null', async () => {
            const parent = await createProject({ name: 'Parent' });
            const child = await createProject({
                name: 'Child',
                parent_project_id: parent.id,
            });

            const response = await agent
                .patch(`/api/project/${child.uid}`)
                .send({ parent_project_uid: null });

            expect(response.status).toBe(200);
            expect(response.body.parent_project_uid).toBeNull();
            const reloaded = await Project.findByPk(child.id);
            expect(reloaded.parent_project_id).toBeNull();
        });

        it('rejects making a project its own descendant with 400', async () => {
            const parent = await createProject({ name: 'Parent' });
            const child = await createProject({
                name: 'Child',
                parent_project_id: parent.id,
            });
            const grandchild = await createProject({
                name: 'Grandchild',
                parent_project_id: child.id,
            });

            const response = await agent
                .patch(`/api/project/${parent.uid}`)
                .send({ parent_project_uid: grandchild.uid });

            expect(response.status).toBe(400);
            const reloaded = await Project.findByPk(parent.id);
            expect(reloaded.parent_project_id).toBeNull();
        });

        it('rejects making a project its own parent with 400', async () => {
            const project = await createProject({ name: 'Solo' });

            const response = await agent
                .patch(`/api/project/${project.uid}`)
                .send({ parent_project_uid: project.uid });

            expect(response.status).toBe(400);
        });

        it('keeps the parent area when a sub-project is sent another area', async () => {
            const parent = await createProject({
                name: 'Parent',
                area_id: area.id,
            });
            const child = await createProject({
                name: 'Child',
                parent_project_id: parent.id,
                area_id: area.id,
            });

            const response = await agent
                .patch(`/api/project/${child.uid}`)
                .send({ area_id: otherArea.id });

            expect(response.status).toBe(200);
            expect(response.body.area_id).toBe(area.id);
        });

        it('cascades a parent area change to all descendants', async () => {
            const parent = await createProject({
                name: 'Parent',
                area_id: area.id,
            });
            const child = await createProject({
                name: 'Child',
                parent_project_id: parent.id,
                area_id: area.id,
            });
            const grandchild = await createProject({
                name: 'Grandchild',
                parent_project_id: child.id,
                area_id: area.id,
            });

            const response = await agent
                .patch(`/api/project/${parent.uid}`)
                .send({ area_id: otherArea.id });

            expect(response.status).toBe(200);
            expect((await Project.findByPk(child.id)).area_id).toBe(
                otherArea.id
            );
            expect((await Project.findByPk(grandchild.id)).area_id).toBe(
                otherArea.id
            );
        });
    });

    describe('delete and read', () => {
        it('keeps children when the parent is deleted and clears their parent', async () => {
            const parent = await createProject({ name: 'Parent' });
            const child = await createProject({
                name: 'Child',
                parent_project_id: parent.id,
            });

            const deleted = await agent.delete(`/api/project/${parent.uid}`);
            expect(deleted.status).toBe(200);

            const response = await agent.get(`/api/project/${child.uid}`);
            expect(response.status).toBe(200);
            expect(response.body.parent_project_uid).toBeNull();
        });

        it('lists direct sub-projects on get and parent_project_uid in the list', async () => {
            const parent = await createProject({ name: 'Parent' });
            const child = await createProject({
                name: 'Child',
                parent_project_id: parent.id,
                status: 'in_progress',
            });
            await createProject({
                name: 'Grandchild',
                parent_project_id: child.id,
            });

            await Task.bulkCreate([
                { name: 'Open', user_id: user.id, project_id: child.id },
                {
                    name: 'Done',
                    user_id: user.id,
                    project_id: child.id,
                    status: Task.STATUS.DONE,
                },
            ]);
            await child.update({ icon: 'home' });

            const page = await agent.get(`/api/project/${parent.uid}`);
            expect(page.status).toBe(200);
            expect(page.body.SubProjects).toEqual([
                {
                    uid: child.uid,
                    name: 'Child',
                    status: 'in_progress',
                    icon: 'home',
                    open_tasks_count: 1,
                },
            ]);

            const list = await agent.get('/api/projects');
            const listed = list.body.projects.find((p) => p.uid === child.uid);
            expect(listed.parent_project_uid).toBe(parent.uid);
        });
    });
});
