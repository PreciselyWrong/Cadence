const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const { Task, DailyPlan, DailyPlanItem } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

const TIMEZONE = 'Europe/Athens';

describe('GET /daily-plan/:date/evening', () => {
    let user, agent, today;

    const dueToday = (name, owner = user) =>
        Task.create({
            name,
            user_id: owner.id,
            due_date: new Date(`${today}T12:00:00Z`),
            estimated_minutes: 30,
        });

    beforeEach(async () => {
        user = await createTestUser({
            email: 'evening@example.com',
            timezone: TIMEZONE,
        });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'evening@example.com',
            password: 'password123',
        });
        today = moment.tz(TIMEZONE).format('YYYY-MM-DD');
    });

    it('answers 401 without a session', async () => {
        const res = await request(app).get(`/api/daily-plan/${today}/evening`);

        expect(res.status).toBe(401);
    });

    it('rejects a malformed date', async () => {
        const res = await agent.get('/api/daily-plan/24-09-2026/evening');

        expect(res.status).toBe(400);
    });

    it('lists a task completed today as done, with its current state', async () => {
        const task = await Task.create({
            name: 'Envoyer le devis',
            user_id: user.id,
        });
        await task.update({
            status: Task.STATUS.DONE,
            completed_at: new Date(),
        });

        const res = await agent.get(`/api/daily-plan/${today}/evening`);

        expect(res.status).toBe(200);
        expect(res.body.date).toBe(today);
        expect(res.body.evening.schema).toBe(1);
        expect(res.body.evening.done).toEqual([task.uid]);
        expect(res.body.evening.counters.done).toBe(1);
        expect(res.body.tasks[task.uid]).toMatchObject({
            name: 'Envoyer le devis',
            status: Task.STATUS.DONE,
        });
    });

    it('lists an open task due today as slipped when the morning did not pick it', async () => {
        const task = await dueToday('Relire le contrat');

        const res = await agent.get(`/api/daily-plan/${today}/evening`);

        expect(res.body.evening.tonight).toEqual([]);
        expect(res.body.evening.slipped).toEqual([
            expect.objectContaining({ task_uid: task.uid }),
        ]);
        expect(res.body.evening.carry_over).toEqual([task.uid]);
    });

    it('keeps the morning tonight items that are still open in tonight', async () => {
        const picked = await dueToday('Préparer la réunion');
        const finished = await dueToday('Déjà faite');
        await finished.update({
            status: Task.STATUS.DONE,
            completed_at: new Date(),
        });
        await DailyPlan.create({
            user_id: user.id,
            plan_date: today,
            brief: {
                schema: 1,
                date: today,
                tonight: [
                    {
                        task_uid: picked.uid,
                        reason: 'Due aujourd’hui',
                        minutes: 30,
                    },
                    {
                        task_uid: finished.uid,
                        reason: 'Due aujourd’hui',
                        minutes: 15,
                    },
                ],
            },
            brief_version: 1,
            brief_status: 'ready',
        });

        const res = await agent.get(`/api/daily-plan/${today}/evening`);

        expect(res.body.evening.tonight).toEqual([
            { task_uid: picked.uid, minutes: 30 },
        ]);
        expect(res.body.evening.slipped).toEqual([]);
        expect(res.body.evening.done).toEqual([finished.uid]);
        expect(res.body.evening.carry_over).toEqual([picked.uid]);
    });

    it('never shows the tasks of another user', async () => {
        const other = await createTestUser({
            email: 'other-evening@example.com',
            timezone: TIMEZONE,
        });
        const foreign = await dueToday('Tâche d’une autre personne', other);
        await foreign.update({
            status: Task.STATUS.DONE,
            completed_at: new Date(),
        });
        const mine = await dueToday('Ma tâche');

        const res = await agent.get(`/api/daily-plan/${today}/evening`);

        expect(res.body.evening.done).not.toContain(foreign.uid);
        expect(res.body.evening.slipped.map((item) => item.task_uid)).toEqual([
            mine.uid,
        ]);
        expect(res.body.tasks[foreign.uid]).toBeUndefined();
    });

    it('proposes only: building the review changes no task and stores nothing', async () => {
        const task = await dueToday('Tâche à glisser');
        const before = await Task.findByPk(task.id);
        const planCount = await DailyPlan.count();
        const itemCount = await DailyPlanItem.count();

        const res = await agent.get(`/api/daily-plan/${today}/evening`);
        expect(res.status).toBe(200);

        const after = await Task.findByPk(task.id);
        expect(after.updated_at).toEqual(before.updated_at);
        expect(after.due_date).toEqual(before.due_date);
        expect(after.status).toBe(before.status);
        expect(await DailyPlan.count()).toBe(planCount);
        expect(await DailyPlanItem.count()).toBe(itemCount);
    });
});
