const request = require('supertest');
const app = require('../../app');
const { Link, Project, Tag, Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const jobs = require('../../modules/links/jobs');

// « Transformer en projet » and the projects nobody touched for 30 days
// (docs/37-links.md).
describe('Task to project', () => {
    let agent;
    let user;

    beforeEach(async () => {
        jobs.configure({ enabled: false });
        user = await createTestUser({ email: 'to-project@example.com' });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: 'to-project@example.com', password: 'password123' });
    });

    it('makes the task a project: subtasks become its tasks, addresses its pages, tags follow', async () => {
        const tag = await Tag.create({ name: 'outils', user_id: user.id });
        const task = await Task.create({
            name: 'Essayer : X',
            note: 'https://github.com/acme/x\n\nVoir aussi https://example.com/doc.',
            user_id: user.id,
            status: Task.STATUS.NOT_STARTED,
        });
        await task.setTags([tag]);
        await Task.create({
            name: 'Installer',
            user_id: user.id,
            parent_task_id: task.id,
            status: Task.STATUS.NOT_STARTED,
        });
        await Task.create({
            name: 'Essayer sur un vrai fichier',
            user_id: user.id,
            parent_task_id: task.id,
            status: Task.STATUS.NOT_STARTED,
        });

        const res = await agent.post(`/api/task/${task.uid}/to-project`);
        expect(res.status).toBe(201);
        const project = await Project.findOne({
            where: { uid: res.body.project.uid },
            include: [{ model: Tag }],
        });
        expect(project.name).toBe('Essayer : X');
        expect(project.description).toBe(task.note);
        expect(project.Tags.map((t) => t.name)).toEqual(['outils']);

        const tasks = await Task.findAll({ where: { project_id: project.id } });
        expect(tasks.map((t) => t.name).sort()).toEqual([
            'Essayer sur un vrai fichier',
            'Installer',
        ]);
        expect(tasks.every((t) => t.parent_task_id === null)).toBe(true);

        const pages = await Link.findAll({ where: { project_id: project.id } });
        expect(pages.map((p) => p.url).sort()).toEqual([
            'https://example.com/doc',
            'https://github.com/acme/x',
        ]);
        expect(await Task.findOne({ where: { uid: task.uid } })).toBeNull();
    });

    it('refuses a recurring task, a subtask and the task of someone else', async () => {
        const recurring = await Task.create({
            name: 'Chaque lundi',
            user_id: user.id,
            recurrence_type: 'weekly',
            status: Task.STATUS.NOT_STARTED,
        });
        expect(
            (await agent.post(`/api/task/${recurring.uid}/to-project`)).status
        ).toBe(400);

        const parent = await Task.create({ name: 'P', user_id: user.id });
        const child = await Task.create({
            name: 'C',
            user_id: user.id,
            parent_task_id: parent.id,
        });
        expect(
            (await agent.post(`/api/task/${child.uid}/to-project`)).status
        ).toBe(400);

        const other = await createTestUser({ email: 'tp-other@example.com' });
        const theirs = await Task.create({ name: 'T', user_id: other.id });
        expect(
            [403, 404].includes(
                (await agent.post(`/api/task/${theirs.uid}/to-project`)).status
            )
        ).toBe(true);
        expect(await Project.count()).toBe(0);
    });

    describe('projects untouched for 30 days', () => {
        const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

        it('lists open projects with no activity for 30 days, until kept', async () => {
            const quiet = await Project.create({
                name: 'Quiet',
                user_id: user.id,
                status: 'in_progress',
            });
            const busy = await Project.create({
                name: 'Busy',
                user_id: user.id,
                status: 'planned',
            });
            const done = await Project.create({
                name: 'Done',
                user_id: user.id,
                status: 'done',
            });
            const sequelize = Project.sequelize;
            for (const p of [quiet, busy, done]) {
                await sequelize.query(
                    'UPDATE projects SET updated_at = :at, created_at = :at WHERE id = :id',
                    { replacements: { at: daysAgo(45), id: p.id } }
                );
            }
            await Task.create({
                name: 'Moving',
                user_id: user.id,
                project_id: busy.id,
            });

            const res = await agent.get('/api/projects/dormant');
            expect(res.status).toBe(200);
            expect(res.body.projects.map((p) => p.uid)).toEqual([quiet.uid]);
            expect(res.body.projects[0].last_activity_at).toBeTruthy();

            await agent.post(`/api/project/${quiet.uid}/reviewed`);
            const after = await agent.get('/api/projects/dormant');
            expect(after.body.projects).toEqual([]);
            expect((await Project.findByPk(quiet.id)).status).toBe(
                'in_progress'
            );
        });
    });
});
