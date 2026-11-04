const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const { Task, DailyPlan } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('Daily plan brief routes', () => {
    let user, agent, today;

    beforeEach(async () => {
        user = await createTestUser({
            email: 'briefed@example.com',
            timezone: 'Europe/Athens',
        });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'briefed@example.com',
            password: 'password123',
        });
        today = moment.tz('Europe/Athens').format('YYYY-MM-DD');
    });

    describe('settings', () => {
        it('returns the defaults for a fresh user', async () => {
            const res = await agent.get('/api/daily-plan/brief/settings');

            expect(res.status).toBe(200);
            expect(res.body.enabled).toBe(false);
            expect(res.body.time).toBe('07:00');
            expect(res.body.sections).toHaveLength(8);
            expect(res.body.thresholds.maxMoves).toBe(3);
        });

        it('merges a valid update and persists it', async () => {
            const put = await agent.put('/api/daily-plan/brief/settings').send({
                enabled: true,
                time: '06:30',
                thresholds: { maxMoves: 1 },
            });

            expect(put.status).toBe(200);
            expect(put.body).toMatchObject({
                enabled: true,
                time: '06:30',
                thresholds: { maxMoves: 1, maxTonight: 3 },
            });

            const later = await agent
                .put('/api/daily-plan/brief/settings')
                .send({
                    writing: { signature: 'Camille' },
                });
            expect(later.body.enabled).toBe(true);
            expect(later.body.writing.signature).toBe('Camille');

            const get = await agent.get('/api/daily-plan/brief/settings');
            expect(get.body).toMatchObject({
                enabled: true,
                time: '06:30',
                thresholds: { maxMoves: 1 },
                writing: { signature: 'Camille' },
            });
        });

        it('keeps the other ui_settings keys when saving', async () => {
            await agent.put('/api/daily-plan/hours').send({
                start: 480,
                end: 1080,
            });

            await agent
                .put('/api/daily-plan/brief/settings')
                .send({ enabled: true });

            const hours = await agent.get('/api/daily-plan/hours');
            expect(hours.body).toEqual({ start: 480, end: 1080 });
        });

        it('answers 400 for a wrong type instead of storing a fallback', async () => {
            const res = await agent
                .put('/api/daily-plan/brief/settings')
                .send({ enabled: 'yes' });

            expect(res.status).toBe(400);
            const get = await agent.get('/api/daily-plan/brief/settings');
            expect(get.body.enabled).toBe(false);
        });

        it('answers 401 without a session', async () => {
            const res = await request(app).get(
                '/api/daily-plan/brief/settings'
            );

            expect(res.status).toBe(401);
        });
    });

    describe('GET /daily-plan/:date/brief', () => {
        it('returns a null brief when the day has none', async () => {
            const res = await agent.get(`/api/daily-plan/${today}/brief`);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                date: today,
                brief: null,
                version: null,
                status: null,
                generated_at: null,
                tasks: {},
            });
        });

        it('rejects a malformed date', async () => {
            const res = await agent.get('/api/daily-plan/24-09-2026/brief');

            expect(res.status).toBe(400);
        });

        it('returns the current state of the tasks the brief references', async () => {
            const task = await Task.create({
                name: 'Renew passport',
                user_id: user.id,
                estimated_minutes: 45,
            });
            await task.update({
                status: Task.STATUS.DONE,
                completed_at: new Date(),
            });
            const generatedAt = new Date('2026-11-04T05:00:00Z');
            await DailyPlan.create({
                user_id: user.id,
                plan_date: today,
                brief: {
                    schema: 1,
                    date: today,
                    tonight: [
                        { task_uid: task.uid, reason: 'due', minutes: 45 },
                    ],
                    resolved: [],
                },
                brief_version: 2,
                brief_status: 'ready',
                brief_generated_at: generatedAt,
            });

            const res = await agent.get(`/api/daily-plan/${today}/brief`);

            expect(res.status).toBe(200);
            expect(res.body.brief.tonight[0].task_uid).toBe(task.uid);
            expect(res.body.version).toBe(2);
            expect(res.body.status).toBe('ready');
            expect(new Date(res.body.generated_at)).toEqual(generatedAt);
            expect(res.body.tasks[task.uid]).toMatchObject({
                uid: task.uid,
                name: 'Renew passport',
                status: Task.STATUS.DONE,
                estimated_minutes: 45,
                project_name: null,
            });
            expect(res.body.tasks[task.uid].completed_at).toBeTruthy();
        });

        it("does not expose another user's task referenced by a brief", async () => {
            const other = await createTestUser({
                email: 'someone-else@example.com',
            });
            const foreign = await Task.create({
                name: 'Private task',
                user_id: other.id,
            });
            await DailyPlan.create({
                user_id: user.id,
                plan_date: today,
                brief: {
                    schema: 1,
                    timeline: [{ date: today, task_uids: [foreign.uid] }],
                },
                brief_version: 1,
                brief_status: 'ready',
            });

            const res = await agent.get(`/api/daily-plan/${today}/brief`);

            expect(res.status).toBe(200);
            expect(res.body.tasks).toEqual({});
            expect(JSON.stringify(res.body)).not.toContain('Private task');
        });

        it('answers 401 without a session', async () => {
            const res = await request(app).get(
                `/api/daily-plan/${today}/brief`
            );

            expect(res.status).toBe(401);
        });
    });
});
