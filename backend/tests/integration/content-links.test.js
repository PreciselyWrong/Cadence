const request = require('supertest');
const app = require('../../app');
const { Note, Task, Project, Person, Permission } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const { uid } = require('../../utils/uid');

describe('Backlinks', () => {
    let user, other, agent;

    beforeEach(async () => {
        user = await createTestUser({ email: `bl_${Date.now()}@example.com` });
        other = await createTestUser({
            email: `bl_other_${Date.now()}@example.com`,
        });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });
    });

    it('lists the notes and tasks that link to a note, with a snippet', async () => {
        const target = await Note.create({
            title: 'Packing list',
            user_id: user.id,
        });
        const byTitle = await Note.create({
            title: 'Trip',
            content: 'Before leaving, check [[packing list]] twice.',
            user_id: user.id,
        });
        const byPath = await Task.create({
            name: 'Pack',
            note: `Use [the list](/note/${target.uid}-packing-list)`,
            user_id: user.id,
        });
        await Note.create({
            title: 'Code only',
            content: 'Not a link: `[[Packing list]]`',
            user_id: user.id,
        });
        await Note.create({
            title: 'Self',
            content: 'unrelated',
            user_id: user.id,
        });
        await target.update({ content: 'I link to [[Packing list]] myself' });

        const res = await agent.get(`/api/note/${target.uid}/backlinks`);
        expect(res.status).toBe(200);
        expect(res.body.map((b) => `${b.type}:${b.uid}`).sort()).toEqual(
            [`note:${byTitle.uid}`, `task:${byPath.uid}`].sort()
        );
        const trip = res.body.find((b) => b.uid === byTitle.uid);
        expect(trip.title).toBe('Trip');
        expect(trip.snippet).toContain('check packing list twice');
    });

    it('follows edits and deletions of the linking items', async () => {
        const target = await Task.create({
            name: 'Call the bank',
            user_id: user.id,
        });
        const source = await Note.create({
            title: 'Money',
            content: 'Todo: [[task:Call the bank]]',
            user_id: user.id,
        });
        const url = `/api/task/${target.uid}/backlinks`;
        expect((await agent.get(url)).body.map((b) => b.uid)).toEqual([
            source.uid,
        ]);

        await source.update({ content: 'Nothing left' });
        expect((await agent.get(url)).body).toEqual([]);

        const again = await Note.create({
            title: 'Again',
            content: `see /task/${target.uid}`,
            user_id: user.id,
        });
        expect((await agent.get(url)).body.map((b) => b.uid)).toEqual([
            again.uid,
        ]);
        await again.destroy();
        expect((await agent.get(url)).body).toEqual([]);
    });

    it('lists the notes and tasks that mention a person', async () => {
        const person = await Person.create({ name: 'Anna', user_id: user.id });
        const task = await Task.create({
            name: 'Gift',
            note: `Ask @[Anna](person:${person.uid}) about it`,
            user_id: user.id,
        });
        const res = await agent.get(`/api/people/${person.uid}/backlinks`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([
            expect.objectContaining({
                type: 'task',
                uid: task.uid,
                title: 'Gift',
                snippet: 'Ask @Anna about it',
            }),
        ]);
    });

    it('only shows linking items the reader may open', async () => {
        const target = await Note.create({ title: 'Shared', user_id: user.id });
        await Note.create({
            title: 'Private to other',
            content: `[[Shared]] /note/${target.uid}`,
            user_id: other.id,
        });
        const project = await Project.create({
            name: 'Joint',
            user_id: other.id,
        });
        const visible = await Task.create({
            name: 'In shared project',
            note: `/note/${target.uid}`,
            user_id: other.id,
            project_id: project.id,
        });
        await Permission.create({
            user_id: user.id,
            resource_type: 'project',
            resource_uid: project.uid,
            access_level: 'ro',
            propagation: 'direct',
            granted_by_user_id: other.id,
        });

        const res = await agent.get(`/api/note/${target.uid}/backlinks`);
        expect(res.body.map((b) => b.uid)).toEqual([visible.uid]);
    });

    it('refuses targets the reader may not open', async () => {
        const theirs = await Note.create({
            title: 'Theirs',
            user_id: other.id,
        });
        const theirTask = await Task.create({
            name: 'Theirs',
            user_id: other.id,
        });
        const theirPerson = await Person.create({
            name: 'Bob',
            user_id: other.id,
        });
        expect(
            (await agent.get(`/api/note/${theirs.uid}/backlinks`)).status
        ).toBe(403);
        expect(
            (await agent.get(`/api/task/${theirTask.uid}/backlinks`)).status
        ).toBe(403);
        expect(
            (await agent.get(`/api/people/${theirPerson.uid}/backlinks`)).status
        ).toBe(404);
        expect((await agent.get(`/api/task/${uid()}/backlinks`)).status).toBe(
            404
        );
    });

    it('resolves [[task:Name]] links to readable tasks, open ones first', async () => {
        await Task.create({
            name: 'Renew passport',
            status: 2,
            user_id: user.id,
        });
        const open = await Task.create({
            name: 'Renew passport',
            user_id: user.id,
        });
        await Task.create({ name: 'Secret', user_id: other.id });
        const res = await agent
            .post('/api/content-links/resolve')
            .send({ tasks: ['renew PASSPORT', 'Secret', 'Missing'] });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ tasks: { 'renew passport': open.uid } });

        const bad = await agent
            .post('/api/content-links/resolve')
            .send({ tasks: [42] });
        expect(bad.status).toBe(400);
    });
});
