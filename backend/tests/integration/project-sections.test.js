const request = require('supertest');
const app = require('../../app');
const { Task, ProjectSection } = require('../../models');
const {
    createTestUser,
    acceptAllInvitations,
} = require('../helpers/testUtils');
const peopleService = require('../../modules/people/service');

async function login(user) {
    const agent = request.agent(app);
    await agent
        .post('/api/login')
        .send({ email: user.email, password: 'password123' });
    return agent;
}

describe('Project sections (board columns)', () => {
    let owner, reader, writer, outsider;
    let ownerAgent, readerAgent, writerAgent, outsiderAgent;
    let project;

    beforeEach(async () => {
        const stamp = Date.now();
        owner = await createTestUser({ email: `owner_${stamp}@test.com` });
        reader = await createTestUser({ email: `reader_${stamp}@test.com` });
        writer = await createTestUser({ email: `writer_${stamp}@test.com` });
        outsider = await createTestUser({
            email: `outsider_${stamp}@test.com`,
        });
        for (const u of [owner, reader, writer, outsider]) {
            await peopleService.createSelfPerson(u);
        }
        ownerAgent = await login(owner);
        readerAgent = await login(reader);
        writerAgent = await login(writer);
        outsiderAgent = await login(outsider);

        const res = await ownerAgent
            .post('/api/project')
            .send({ name: 'Board project' });
        project = res.body;

        await ownerAgent.post('/api/shares').send({
            resource_type: 'project',
            resource_uid: project.uid,
            target_user_email: reader.email,
            access_level: 'ro',
        });
        await ownerAgent.post('/api/shares').send({
            resource_type: 'project',
            resource_uid: project.uid,
            target_user_email: writer.email,
            access_level: 'rw',
        });
        await acceptAllInvitations(readerAgent);
        await acceptAllInvitations(writerAgent);
    });

    const base = () => `/api/project/${project.uid}/sections`;

    it('creates, lists in order, inserts at a position, renames and reorders', async () => {
        const a = await ownerAgent.post(base()).send({ name: 'To do' });
        expect(a.status).toBe(201);
        expect(a.body).toMatchObject({ name: 'To do', position: 0 });
        expect(a.body.uid).toBeTruthy();

        const b = await ownerAgent.post(base()).send({ name: 'Done' });
        expect(b.body.position).toBe(1);

        // Insert to the left of "Done"
        const c = await ownerAgent
            .post(base())
            .send({ name: 'Doing', position: 1 });
        expect(c.body.position).toBe(1);

        let list = await ownerAgent.get(base());
        expect(list.status).toBe(200);
        expect(list.body.map((s) => s.name)).toEqual([
            'To do',
            'Doing',
            'Done',
        ]);

        const renamed = await ownerAgent
            .patch(`${base()}/${c.body.uid}`)
            .send({ name: '  In progress ' });
        expect(renamed.status).toBe(200);
        expect(renamed.body.name).toBe('In progress');

        const reordered = await ownerAgent
            .put(`${base()}/order`)
            .send({ section_uids: [b.body.uid, a.body.uid, c.body.uid] });
        expect(reordered.status).toBe(200);
        expect(reordered.body.map((s) => s.name)).toEqual([
            'Done',
            'To do',
            'In progress',
        ]);

        const bad = await ownerAgent
            .put(`${base()}/order`)
            .send({ section_uids: [a.body.uid] });
        expect(bad.status).toBe(400);
    });

    it('rejects an empty name', async () => {
        const res = await ownerAgent.post(base()).send({ name: '   ' });
        expect(res.status).toBe(400);
    });

    it('lets read-only collaborators list but not change sections', async () => {
        const created = await ownerAgent.post(base()).send({ name: 'Col' });

        const list = await readerAgent.get(base());
        expect(list.status).toBe(200);
        expect(list.body).toHaveLength(1);

        expect(
            (await readerAgent.post(base()).send({ name: 'X' })).status
        ).toBe(403);
        expect(
            (
                await readerAgent
                    .patch(`${base()}/${created.body.uid}`)
                    .send({ name: 'Y' })
            ).status
        ).toBe(403);
        expect(
            (await readerAgent.delete(`${base()}/${created.body.uid}`)).status
        ).toBe(403);
        expect(
            (
                await readerAgent
                    .put(`${base()}/order`)
                    .send({ section_uids: [created.body.uid] })
            ).status
        ).toBe(403);
    });

    it('lets read-write collaborators change sections', async () => {
        const res = await writerAgent.post(base()).send({ name: 'Mine' });
        expect(res.status).toBe(201);
        const renamed = await writerAgent
            .patch(`${base()}/${res.body.uid}`)
            .send({ name: 'Ours' });
        expect(renamed.status).toBe(200);
    });

    it('hides sections from users without access', async () => {
        await ownerAgent.post(base()).send({ name: 'Secret' });
        const list = await outsiderAgent.get(base());
        expect([403, 404]).toContain(list.status);
        const create = await outsiderAgent.post(base()).send({ name: 'X' });
        expect([403, 404]).toContain(create.status);
    });

    it('returns 404 for a section of another project', async () => {
        const other = await ownerAgent
            .post('/api/project')
            .send({ name: 'Other' });
        const section = await ownerAgent
            .post(`/api/project/${other.body.uid}/sections`)
            .send({ name: 'Elsewhere' });
        const res = await ownerAgent
            .patch(`${base()}/${section.body.uid}`)
            .send({ name: 'Hijack' });
        expect(res.status).toBe(404);
    });

    it('moves tasks via section_uid and clears it on delete and project change', async () => {
        const section = (await ownerAgent.post(base()).send({ name: 'Column' }))
            .body;
        const task = (
            await ownerAgent
                .post('/api/task')
                .send({ name: 'Card', project_uid: project.uid })
        ).body;
        expect(task.section_uid).toBeNull();

        const moved = await ownerAgent
            .patch(`/api/task/${task.uid}`)
            .send({ section_uid: section.uid });
        expect(moved.status).toBe(200);
        expect(moved.body.section_uid).toBe(section.uid);

        // Project page carries section_uid for each task
        const page = await ownerAgent.get(`/api/project/${project.uid}`);
        const pageTask = (page.body.Tasks || page.body.tasks).find(
            (t) => t.uid === task.uid
        );
        expect(pageTask.section_uid).toBe(section.uid);

        // Read-only collaborators cannot move cards
        const roMove = await readerAgent
            .patch(`/api/task/${task.uid}`)
            .send({ section_uid: null });
        expect([403, 404]).toContain(roMove.status);

        // Back to unsectioned
        const cleared = await writerAgent
            .patch(`/api/task/${task.uid}`)
            .send({ section_uid: null });
        expect(cleared.status).toBe(200);
        expect(cleared.body.section_uid).toBeNull();

        // A section of another project is refused
        const other = (
            await ownerAgent.post('/api/project').send({ name: 'Other' })
        ).body;
        const foreign = (
            await ownerAgent
                .post(`/api/project/${other.uid}/sections`)
                .send({ name: 'Foreign' })
        ).body;
        const refused = await ownerAgent
            .patch(`/api/task/${task.uid}`)
            .send({ section_uid: foreign.uid });
        expect(refused.status).toBe(400);

        // Changing project leaves the old column
        await ownerAgent
            .patch(`/api/task/${task.uid}`)
            .send({ section_uid: section.uid });
        const switched = await ownerAgent
            .patch(`/api/task/${task.uid}`)
            .send({ project_uid: other.uid });
        expect(switched.status).toBe(200);
        expect(switched.body.section_uid).toBeNull();

        // Changing project and picking a column of the new one at once
        const both = await ownerAgent
            .patch(`/api/task/${task.uid}`)
            .send({ project_uid: project.uid, section_uid: section.uid });
        expect(both.status).toBe(200);
        expect(both.body.section_uid).toBe(section.uid);

        // Deleting the section leaves the task unsectioned
        const del = await ownerAgent.delete(`${base()}/${section.uid}`);
        expect(del.status).toBe(204);
        const row = await Task.findOne({ where: { uid: task.uid } });
        expect(row.section_id).toBeNull();
        expect(await ProjectSection.count()).toBe(1);
    });

    describe('card order', () => {
        const makeTask = async (name, projectUid = project.uid) =>
            (
                await ownerAgent
                    .post('/api/task')
                    .send({ name, project_uid: projectUid })
            ).body;

        it('orders a column, moves listed cards into it and returns section_position', async () => {
            const section = (
                await ownerAgent.post(base()).send({ name: 'Column' })
            ).body;
            const a = await makeTask('A');
            const b = await makeTask('B');
            const c = await makeTask('C');

            const res = await writerAgent
                .put(`${base()}/${section.uid}/order`)
                .send({ task_uids: [c.uid, a.uid] });
            expect(res.status).toBe(200);

            const page = await ownerAgent.get(`/api/project/${project.uid}`);
            const tasks = page.body.Tasks || page.body.tasks;
            const byUid = Object.fromEntries(tasks.map((t) => [t.uid, t]));
            expect(byUid[c.uid]).toMatchObject({
                section_uid: section.uid,
                section_position: 0,
            });
            expect(byUid[a.uid]).toMatchObject({
                section_uid: section.uid,
                section_position: 1,
            });
            expect(byUid[b.uid].section_uid).toBeNull();
            expect(byUid[b.uid].section_position ?? null).toBeNull();

            const back = await ownerAgent
                .put(`/api/project/${project.uid}/unsectioned/order`)
                .send({ task_uids: [a.uid, b.uid] });
            expect(back.status).toBe(200);
            const rowA = await Task.findOne({ where: { uid: a.uid } });
            expect(rowA.section_id).toBeNull();
            expect(rowA.section_position).toBe(0);

            // PATCH to another column sends the card to the end
            const patched = await ownerAgent
                .patch(`/api/task/${a.uid}`)
                .send({ section_uid: section.uid });
            expect(patched.status).toBe(200);
            expect(
                (await Task.findOne({ where: { uid: a.uid } })).section_position
            ).toBeNull();
        });

        it('refuses bad lists and tasks of another project', async () => {
            const section = (
                await ownerAgent.post(base()).send({ name: 'Column' })
            ).body;
            const a = await makeTask('A');
            const other = (
                await ownerAgent.post('/api/project').send({ name: 'Other' })
            ).body;
            const foreign = await makeTask('F', other.uid);
            const url = `${base()}/${section.uid}/order`;

            expect(
                (await ownerAgent.put(url).send({ task_uids: 'x' })).status
            ).toBe(400);
            expect(
                (await ownerAgent.put(url).send({ task_uids: [a.uid, a.uid] }))
                    .status
            ).toBe(400);
            expect(
                (
                    await ownerAgent
                        .put(url)
                        .send({ task_uids: [a.uid, foreign.uid] })
                ).status
            ).toBe(400);
            expect(
                (
                    await ownerAgent
                        .put(`${base()}/nope/order`)
                        .send({ task_uids: [a.uid] })
                ).status
            ).toBe(404);
        });

        it('forbids read-only collaborators and outsiders', async () => {
            const section = (
                await ownerAgent.post(base()).send({ name: 'Column' })
            ).body;
            const a = await makeTask('A');
            const ro = await readerAgent
                .put(`${base()}/${section.uid}/order`)
                .send({ task_uids: [a.uid] });
            expect(ro.status).toBe(403);
            const roNone = await readerAgent
                .put(`/api/project/${project.uid}/unsectioned/order`)
                .send({ task_uids: [a.uid] });
            expect(roNone.status).toBe(403);
            const out = await outsiderAgent
                .put(`/api/project/${project.uid}/unsectioned/order`)
                .send({ task_uids: [a.uid] });
            expect([403, 404]).toContain(out.status);
        });
    });

    it('returns the viewer access level on the project page', async () => {
        const levels = await Promise.all(
            [ownerAgent, writerAgent, readerAgent].map(async (agent) => {
                const res = await agent.get(`/api/project/${project.uid}`);
                return res.body.access_level;
            })
        );
        expect(levels[0]).toMatch(/^(rw|admin)$/);
        expect(levels[1]).toBe('rw');
        expect(levels[2]).toBe('ro');
    });
});
