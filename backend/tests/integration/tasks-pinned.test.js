const request = require('supertest');
const app = require('../../app');
const { Task, sequelize } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('Pinned tasks', () => {
    let agent, project, tasks;

    const listNames = async (query) => {
        const res = await agent.get(`/api/tasks?${query}`);
        expect(res.status).toBe(200);
        return res.body.tasks.map((t) => t.name);
    };

    beforeEach(async () => {
        const user = await createTestUser({
            email: `pin_${Date.now()}@test.com`,
        });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });

        project = (await agent.post('/api/project').send({ name: 'P' })).body;
        tasks = [];
        for (const name of ['A', 'B', 'C', 'D']) {
            const res = await agent
                .post('/api/task')
                .send({ name, project_uid: project.uid });
            tasks.push(res.body);
        }
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('sets and clears pinned through PATCH', async () => {
        expect(tasks[0].pinned).toBe(false);

        const pin = await agent
            .patch(`/api/task/${tasks[0].uid}`)
            .send({ pinned: true });
        expect(pin.status).toBe(200);
        expect(pin.body.pinned).toBe(true);
        const stored = await Task.findOne({ where: { uid: tasks[0].uid } });
        expect(stored.pinned_at).toBeInstanceOf(Date);

        const unpin = await agent
            .patch(`/api/task/${tasks[0].uid}`)
            .send({ pinned: false });
        expect(unpin.status).toBe(200);
        expect(unpin.body.pinned).toBe(false);
        await stored.reload();
        expect(stored.pinned_at).toBeNull();
    });

    it('keeps the first pin time when pinned again', async () => {
        const pinnedAt = new Date('2026-01-01T00:00:00Z');
        await Task.update(
            { pinned_at: pinnedAt },
            { where: { uid: tasks[0].uid } }
        );
        await agent.patch(`/api/task/${tasks[0].uid}`).send({ pinned: true });
        const stored = await Task.findOne({ where: { uid: tasks[0].uid } });
        expect(stored.pinned_at.toISOString()).toBe(pinnedAt.toISOString());
    });

    it('lists pinned tasks first, most recently pinned first', async () => {
        // Default order is newest first: D, C, B, A.
        expect(await listNames('order_by=created_at:desc')).toEqual([
            'D',
            'C',
            'B',
            'A',
        ]);

        await Task.update(
            { pinned_at: new Date('2026-01-01T00:00:00Z') },
            { where: { uid: tasks[1].uid } }
        );
        await Task.update(
            { pinned_at: new Date('2026-02-01T00:00:00Z') },
            { where: { uid: tasks[0].uid } }
        );

        expect(await listNames('order_by=created_at:desc')).toEqual([
            'A',
            'B',
            'D',
            'C',
        ]);
        expect(await listNames('order_by=name:desc')).toEqual([
            'A',
            'B',
            'D',
            'C',
        ]);
        expect(
            await listNames(`project_uid=${project.uid}&order_by=name:asc`)
        ).toEqual(['A', 'B', 'C', 'D']);
        expect(
            await listNames('order_by=custom:asc&limit=50&offset=0')
        ).toEqual(['A', 'B', 'D', 'C']);
    });
});
