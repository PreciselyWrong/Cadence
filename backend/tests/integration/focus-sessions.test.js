const request = require('supertest');
const app = require('../../app');
const { Task, FocusSession } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('Focus sessions API', () => {
    let user, agent;

    beforeEach(async () => {
        user = await createTestUser({ email: 'focus@example.com' });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'focus@example.com',
            password: 'password123',
        });
    });

    const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();

    it('records a session, optionally about a task, and lists it by day', async () => {
        const task = await Task.create({ user_id: user.id, name: 'Write' });
        const res = await agent.post('/api/focus-sessions').send({
            ended_at: hoursAgo(1),
            duration_seconds: 25 * 60,
            task_uid: task.uid,
        });
        expect(res.status).toBe(201);
        expect(res.body.session).toMatchObject({
            duration_seconds: 1500,
            task: { uid: task.uid, name: 'Write' },
        });

        const day = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000)
            .toISOString()
            .slice(0, 10);
        const listed = await agent.get(
            `/api/focus-sessions?start=${yesterday}&end=${day}`
        );
        expect(listed.body.sessions).toHaveLength(1);
    });

    it('rejects bad durations, future sessions and other users tasks', async () => {
        for (const body of [
            { duration_seconds: 10 },
            { duration_seconds: 13 * 3600 },
            {
                duration_seconds: 600,
                ended_at: new Date(Date.now() + 3600000).toISOString(),
            },
        ]) {
            expect(
                (await agent.post('/api/focus-sessions').send(body)).status
            ).toBe(400);
        }
        const other = await createTestUser({
            email: 'other-focus@example.com',
        });
        const theirs = await Task.create({ user_id: other.id, name: 'Theirs' });
        const res = await agent
            .post('/api/focus-sessions')
            .send({ duration_seconds: 600, task_uid: theirs.uid });
        expect(res.status).toBe(404);
    });

    it('deletes only your own sessions', async () => {
        const mine = await agent
            .post('/api/focus-sessions')
            .send({ duration_seconds: 600 });
        const other = await createTestUser({ email: 'other2@example.com' });
        const theirs = await FocusSession.create({
            user_id: other.id,
            started_at: new Date(Date.now() - 1200000),
            ended_at: new Date(Date.now() - 600000),
            duration_seconds: 600,
        });
        expect(
            (await agent.delete(`/api/focus-sessions/${theirs.uid}`)).status
        ).toBe(404);
        expect(
            (await agent.delete(`/api/focus-sessions/${mine.body.session.uid}`))
                .status
        ).toBe(204);
    });

    it('sums minutes per day, per hour and per task', async () => {
        const task = await Task.create({ user_id: user.id, name: 'Write' });
        await agent
            .post('/api/focus-sessions')
            .send({ duration_seconds: 1500, task_uid: task.uid });
        await agent.post('/api/focus-sessions').send({ duration_seconds: 900 });

        const res = await agent.get('/api/focus-sessions/stats?days=7');
        expect(res.status).toBe(200);
        expect(res.body.total_minutes).toBe(40);
        expect(res.body.sessions).toBe(2);
        expect(res.body.by_day).toHaveLength(7);
        expect(res.body.by_day[6].minutes).toBe(40);
        expect(res.body.by_hour.reduce((a, b) => a + b, 0)).toBe(40);
        expect(res.body.top_tasks).toEqual([
            { uid: task.uid, name: 'Write', minutes: 25 },
        ]);
    });
});
