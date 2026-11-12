const request = require('supertest');
const app = require('../../app');
const { InboxItem, Project } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

const signIn = async (email) => {
    const user = await createTestUser({ email });
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email, password: 'password123' });
    return { user, agent };
};

// « Projet… » of an idea: the page goes to a project, the idea is processed.
describe('PATCH /api/inbox/:uid/process with link_uid', () => {
    let agent;
    let user;

    beforeEach(async () => {
        ({ user, agent } = await signIn('inbox-link@example.com'));
    });

    it('marks the idea processed and keeps the page made from it', async () => {
        const project = await Project.create({ name: 'P', user_id: user.id });
        const item = (
            await agent
                .post('/api/inbox')
                .send({ content: 'https://example.com/idee' })
        ).body;
        const link = (
            await agent.post('/api/links').send({
                url: 'https://example.com/idee',
                project_uid: project.uid,
            })
        ).body.link;

        const res = await agent
            .patch(`/api/inbox/${item.uid}/process`)
            .send({ link_uid: link.uid });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('processed');
        const saved = await agent.get(`/api/links/${link.uid}`);
        expect(saved.status).toBe(200);
    });

    it('answers 404 for a link of someone else, and leaves the idea open', async () => {
        const other = await signIn('inbox-link-other@example.com');
        const theirs = await Project.create({
            name: 'Theirs',
            user_id: other.user.id,
        });
        const foreign = (
            await other.agent.post('/api/links').send({
                url: 'https://example.com/autre',
                project_uid: theirs.uid,
            })
        ).body.link;
        const item = await InboxItem.create({
            user_id: user.id,
            content: 'une idée',
            source: 'test',
        });

        const res = await agent
            .patch(`/api/inbox/${item.uid}/process`)
            .send({ link_uid: foreign.uid });

        expect(res.status).toBe(404);
        await item.reload();
        expect(item.status).toBe('added');
    });

    it('answers 404 for a link that does not exist', async () => {
        const item = await InboxItem.create({
            user_id: user.id,
            content: 'une autre idée',
            source: 'test',
        });

        const res = await agent
            .patch(`/api/inbox/${item.uid}/process`)
            .send({ link_uid: 'a'.repeat(15) });

        expect(res.status).toBe(404);
    });
});
