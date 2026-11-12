const request = require('supertest');
const app = require('../../app');
const { Link, Project, Task, User } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

// A shared or captured address becomes a task (docs/37-links.md, Capture).
describe('Link capture', () => {
    let agent;
    let user;

    const signIn = async (email) => {
        const created = await createTestUser({ email });
        const session = request.agent(app);
        await session
            .post('/api/login')
            .send({ email, password: 'password123' });
        return { user: created, agent: session };
    };

    beforeEach(async () => {
        ({ user, agent } = await signIn('capture@example.com'));
        await User.update({ language: 'fr' }, { where: { id: user.id } });
    });

    describe('POST /api/links/task', () => {
        it('makes a repository a task « Essayer : … » with its address in the note, waiting for « Quand ? »', async () => {
            const res = await agent.post('/api/links/task').send({
                url: 'https://github.com/Acme/Rocket/?utm_source=x',
                title: 'Acme/Rocket',
            });
            expect(res.status).toBe(201);
            expect(res.body.task).toMatchObject({
                name: 'Essayer : Acme/Rocket',
                note: 'https://github.com/Acme/Rocket',
            });
            const task = await Task.findOne({
                where: { uid: res.body.task.uid },
            });
            expect(task.needs_when).toBe(true);
            expect(task.source).toBe('link');
            expect(task.source_url).toBe('https://github.com/Acme/Rocket');
            expect(task.project_id).toBeNull();
            expect(await Link.count()).toBe(0);

            const unsorted = await agent.get('/api/tasks?type=unsorted');
            expect(unsorted.body.tasks.map((t) => t.uid)).toContain(
                res.body.task.uid
            );
        });

        it('keeps a name the user typed, and adds their words under the address', async () => {
            const res = await agent.post('/api/links/task').send({
                url: 'https://example.com/a',
                name: 'Ma tâche',
                note: 'pour le projet',
            });
            expect(res.body.task).toMatchObject({
                name: 'Ma tâche',
                note: 'https://example.com/a\n\npour le projet',
            });
        });

        it('files the task in a project of the user, with no « Quand ? »', async () => {
            const project = await Project.create({
                name: 'Fusée',
                user_id: user.id,
            });
            const res = await agent.post('/api/links/task').send({
                url: 'https://youtu.be/abcdefghijk',
                title: 'Une vidéo',
                project_uid: project.uid,
            });
            expect(res.body.task.name).toBe('Regarder : Une vidéo');
            const task = await Task.findOne({
                where: { uid: res.body.task.uid },
            });
            expect(task.project_id).toBe(project.id);
            expect(task.needs_when).toBe(false);
        });

        it('names the task in the language of the user', async () => {
            await User.update({ language: 'en' }, { where: { id: user.id } });
            const res = await agent.post('/api/links/task').send({
                url: 'https://github.com/acme/rocket',
                title: 'Rocket',
            });
            expect(res.body.task.name).toBe('Try: acme/rocket');
        });

        it('refuses an address that is not a web page', async () => {
            const res = await agent
                .post('/api/links/task')
                .send({ url: 'javascript:alert(1)' });
            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/links/lookup', () => {
        it('gives the task name and says where the address already is', async () => {
            const open = await Task.create({
                name: 'Essayer : Rocket',
                note: 'Voir https://www.github.com/acme/rocket/#readme, vite',
                user_id: user.id,
                status: Task.STATUS.NOT_STARTED,
            });
            await Task.create({
                name: 'Done one',
                note: 'https://github.com/acme/rocket',
                user_id: user.id,
                status: Task.STATUS.DONE,
            });
            await Task.create({
                name: 'Other repo',
                note: 'https://github.com/acme/rocket-launcher',
                user_id: user.id,
                status: Task.STATUS.NOT_STARTED,
            });
            const project = await Project.create({
                name: 'Fusée',
                user_id: user.id,
            });
            await Link.create({
                user_id: user.id,
                url: 'https://github.com/acme/rocket',
                project_id: project.id,
            });

            const res = await agent.get('/api/links/lookup').query({
                url: 'https://github.com/acme/rocket?utm_source=share',
                title: 'acme/rocket',
            });
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                url: 'https://github.com/acme/rocket',
                kind: 'repo',
                task_name: 'Essayer : acme/rocket',
                tasks: [{ uid: open.uid, name: 'Essayer : Rocket' }],
                projects: [{ uid: project.uid, name: 'Fusée' }],
            });
        });

        it("never shows another user's tasks", async () => {
            const other = await createTestUser({ email: 'other@example.com' });
            await Task.create({
                name: 'Theirs',
                note: 'https://example.com/x',
                user_id: other.id,
                status: Task.STATUS.NOT_STARTED,
            });
            const res = await agent
                .get('/api/links/lookup')
                .query({ url: 'https://example.com/x' });
            expect(res.body.tasks).toEqual([]);
            expect(res.body.task_name).toBe('example.com');
        });

        it('refuses a missing or invalid address', async () => {
            expect((await agent.get('/api/links/lookup')).status).toBe(400);
        });
    });

    it('lets a client create a task waiting for « Quand ? »', async () => {
        const res = await agent
            .post('/api/task')
            .send({ name: 'Lire : X', needs_when: true });
        expect(res.status).toBe(201);
        const task = await Task.findOne({ where: { uid: res.body.uid } });
        expect(task.needs_when).toBe(true);
    });

    it('lists the tasks with a link (« Avec un lien »)', async () => {
        const withLink = await Task.create({
            name: 'Lire : X',
            note: 'https://example.com/x',
            user_id: user.id,
        });
        await Task.create({
            name: 'Voir https://example.com/y',
            user_id: user.id,
        });
        await Task.create({
            name: 'Sans lien',
            note: 'rien',
            user_id: user.id,
        });
        const res = await agent.get('/api/tasks?has_link=true');
        const names = res.body.tasks.map((t) => t.name).sort();
        expect(names).toEqual(['Lire : X', 'Voir https://example.com/y']);
        expect(res.body.tasks.map((t) => t.uid)).toContain(withLink.uid);
    });
});
