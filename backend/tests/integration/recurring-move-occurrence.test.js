const request = require('supertest');
const app = require('../../app');
const { Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const {
    calculateVirtualOccurrences,
} = require('../../modules/tasks/recurringTaskService');
const {
    completeOccurrence,
} = require('../../modules/tasks/operations/recurring');

const day = (value) => new Date(value).toISOString().slice(0, 10);

describe('Moving one occurrence, the following ones, or the whole series', () => {
    let user, agent;

    beforeEach(async () => {
        user = await createTestUser({ email: 'move@example.com' });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: 'move@example.com', password: 'password123' });
    });

    const createSeries = async (fields) => {
        const res = await agent
            .post('/api/task')
            .send({ name: 'Water plants', ...fields });
        expect(res.status).toBe(201);
        return res.body;
    };
    const daily = () =>
        createSeries({
            recurrence_type: 'daily',
            recurrence_interval: 1,
            due_date: '2027-03-01',
        });
    const weeklyMonday = () =>
        createSeries({
            recurrence_type: 'weekly',
            recurrence_interval: 1,
            recurrence_weekday: 1,
            due_date: '2027-03-01',
        });
    const move = (uid, body) =>
        agent.post(`/api/task/${uid}/move-occurrence`).send(body);
    const reload = (uid) => Task.findOne({ where: { uid } });
    const nextDays = (task, count) =>
        calculateVirtualOccurrences(task, count, null, 'UTC').map((o) =>
            day(o.due_date)
        );

    describe('this occurrence only', () => {
        it('moves the current occurrence into its own task and advances the series', async () => {
            const series = await daily();

            const res = await move(series.uid, {
                scope: 'this',
                occurrence_date: '2027-03-01',
                due_date: '2027-03-05',
            });

            expect(res.status).toBe(200);
            const parent = await reload(series.uid);
            expect(day(parent.due_date)).toBe('2027-03-02');
            const moved = await reload(res.body.moved.uid);
            expect(moved.name).toBe('Water plants');
            expect(moved.recurrence_type).toBe('none');
            expect(day(moved.due_date)).toBe('2027-03-05');
        });

        it('moves a future occurrence and leaves a gap in the series', async () => {
            const series = await daily();

            const res = await move(series.uid, {
                scope: 'this',
                occurrence_date: '2027-03-03',
                due_date: '2027-03-04',
            });

            expect(res.status).toBe(200);
            const parent = await reload(series.uid);
            expect(day(parent.due_date)).toBe('2027-03-01');
            expect(parent.recurrence_exdates).toEqual(['2027-03-03']);
            expect(nextDays(parent, 4)).toEqual([
                '2027-03-01',
                '2027-03-02',
                '2027-03-04',
                '2027-03-05',
            ]);

            await completeOccurrence(parent, {
                timezone: 'UTC',
                userId: user.id,
            });
            await completeOccurrence(parent, {
                timezone: 'UTC',
                userId: user.id,
            });
            expect(day((await reload(series.uid)).due_date)).toBe('2027-03-04');
        });
    });

    describe('this and following occurrences', () => {
        it('ends the series before the occurrence and starts a new one from the new date', async () => {
            const series = await weeklyMonday();

            const res = await move(series.uid, {
                scope: 'following',
                occurrence_date: '2027-03-15',
                due_date: '2027-03-17',
            });

            expect(res.status).toBe(200);
            const parent = await reload(series.uid);
            expect(nextDays(parent, 5)).toEqual(['2027-03-01', '2027-03-08']);

            const next = await reload(res.body.moved.uid);
            expect(next.recurrence_type).toBe('weekly');
            expect(next.recurrence_weekday).toBe(3);
            expect(nextDays(next, 2)).toEqual(['2027-03-17', '2027-03-24']);
        });

        it('on the current occurrence, shifts the whole series', async () => {
            const series = await weeklyMonday();

            const res = await move(series.uid, {
                scope: 'following',
                occurrence_date: '2027-03-01',
                due_date: '2027-03-03',
            });

            expect(res.status).toBe(200);
            expect(res.body.moved).toBeNull();
            const parent = await reload(series.uid);
            expect(nextDays(parent, 2)).toEqual(['2027-03-03', '2027-03-10']);
        });
    });

    describe('the whole series', () => {
        it('shifts the due date and the weekday by the same number of days', async () => {
            const series = await weeklyMonday();

            const res = await move(series.uid, {
                scope: 'all',
                occurrence_date: '2027-03-15',
                due_date: '2027-03-16',
            });

            expect(res.status).toBe(200);
            const parent = await reload(series.uid);
            expect(parent.recurrence_weekday).toBe(2);
            expect(nextDays(parent, 2)).toEqual(['2027-03-02', '2027-03-09']);
        });

        it('shifts each of several weekdays', async () => {
            const series = await createSeries({
                recurrence_type: 'weekly',
                recurrence_interval: 1,
                recurrence_weekdays: [1, 4],
                due_date: '2027-03-01',
            });

            await move(series.uid, {
                scope: 'all',
                occurrence_date: '2027-03-01',
                due_date: '2027-03-02',
            });

            const parent = await reload(series.uid);
            expect([...parent.recurrence_weekdays].sort()).toEqual([2, 5]);
        });

        it('moves the day of the month of a monthly series', async () => {
            const series = await createSeries({
                recurrence_type: 'monthly',
                recurrence_interval: 1,
                recurrence_month_day: 1,
                due_date: '2027-03-01',
            });

            await move(series.uid, {
                scope: 'all',
                occurrence_date: '2027-03-01',
                due_date: '2027-03-10',
            });

            const parent = await reload(series.uid);
            expect(parent.recurrence_month_day).toBe(10);
            expect(nextDays(parent, 2)).toEqual(['2027-03-10', '2027-04-10']);
        });
    });

    it('moves an occurrence however far ahead it is', async () => {
        const series = await daily();

        const res = await move(series.uid, {
            scope: 'following',
            occurrence_date: '2027-12-01',
            due_date: '2027-12-02',
        });

        expect(res.status).toBe(200);
        const next = await reload(res.body.moved.uid);
        expect(day(next.due_date)).toBe('2027-12-02');
        const parent = await reload(series.uid);
        expect(day(parent.due_date)).toBe('2027-03-01');
    });

    describe('validation', () => {
        it('refuses a task that does not repeat', async () => {
            const res = await agent
                .post('/api/task')
                .send({ name: 'Once', due_date: '2027-03-01' });

            const moved = await move(res.body.uid, {
                scope: 'this',
                occurrence_date: '2027-03-01',
                due_date: '2027-03-02',
            });

            expect(moved.status).toBe(400);
        });

        it('refuses a date that is not an occurrence of the series', async () => {
            const series = await weeklyMonday();

            const res = await move(series.uid, {
                scope: 'this',
                occurrence_date: '2027-03-02',
                due_date: '2027-03-05',
            });

            expect(res.status).toBe(400);
        });

        it('refuses an unknown scope', async () => {
            const series = await daily();

            const res = await move(series.uid, {
                scope: 'everything',
                occurrence_date: '2027-03-01',
                due_date: '2027-03-02',
            });

            expect(res.status).toBe(400);
        });

        it("does not let another user move someone's series", async () => {
            const series = await daily();
            await createTestUser({ email: 'intruder@example.com' });
            const intruder = request.agent(app);
            await intruder.post('/api/login').send({
                email: 'intruder@example.com',
                password: 'password123',
            });

            const res = await intruder
                .post(`/api/task/${series.uid}/move-occurrence`)
                .send({
                    scope: 'all',
                    occurrence_date: '2027-03-01',
                    due_date: '2027-03-02',
                });

            expect([403, 404]).toContain(res.status);
            expect(day((await reload(series.uid)).due_date)).toBe('2027-03-01');
        });
    });

    it('syncs the gaps of a series to the devices', async () => {
        const series = await daily();
        await move(series.uid, {
            scope: 'this',
            occurrence_date: '2027-03-03',
            due_date: '2027-03-04',
        });

        const pulled = await agent.get('/api/v1/sync/pull?cursor=0');
        const last = pulled.body.changes
            .filter((c) => c.uid === series.uid)
            .pop();

        expect(last.data.recurrence_exdates).toEqual(['2027-03-03']);
    });
});
