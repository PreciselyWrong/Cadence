const request = require('supertest');
const app = require('../../app');
const { createTestUser } = require('../helpers/testUtils');

const signIn = async (email) => {
    await createTestUser({ email });
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email, password: 'password123' });
    return agent;
};

const goal = (extra = {}) => ({
    target_minor: 1,
    period: 'DAY',
    goal_type: 'BINARY',
    ...extra,
});

describe('GET /api/cadence/calendar', () => {
    let agent;

    beforeEach(async () => {
        agent = await signIn('cadence-calendar@example.com');
    });

    const createHabit = (uid, body) =>
        agent
            .post('/api/cadence/habits')
            .send({ uid, starts_on: '2026-10-01', ...body });

    const range = (from, to) =>
        agent.get('/api/cadence/calendar').query({ from, to });

    it('lists the due days of a habit with their state and reminder time', async () => {
        await createHabit('cal-daily', {
            name: 'Stretch',
            goal: goal(),
            schedule: { schedule_mode: 'EVERY_DAY' },
        });
        await agent.post('/api/cadence/habits/cal-daily/reminders').send({
            time: '08:30',
            days_of_week: '',
            enabled: true,
            conditional: false,
        });
        await agent.post('/api/cadence/habits/cal-daily/entries').send({
            local_date: '2026-10-05',
            value_minor: 1,
            observed_zone_id: 'UTC',
        });

        const res = await range('2026-10-04', '2026-10-06');

        expect(res.status).toBe(200);
        expect(res.body.habits).toHaveLength(1);
        const habit = res.body.habits[0];
        expect(habit).toMatchObject({ uid: 'cal-daily', name: 'Stretch' });
        expect(habit.days).toEqual([
            {
                date: '2026-10-04',
                status: 'MISSED',
                done: false,
                time: '08:30',
            },
            { date: '2026-10-05', status: 'IDEAL', done: true, time: '08:30' },
            {
                date: '2026-10-06',
                status: 'MISSED',
                done: false,
                time: '08:30',
            },
        ]);
    });

    it('shows a selected-days habit only on its days, without a time when it has no reminder', async () => {
        await createHabit('cal-mondays', {
            name: 'Laundry',
            goal: goal(),
            schedule: {
                schedule_mode: 'SELECTED_DAYS',
                active_days: 'MONDAY',
            },
        });

        const res = await range('2026-10-04', '2026-10-12');

        expect(res.body.habits[0].days.map((d) => d.date)).toEqual([
            '2026-10-05',
            '2026-10-12',
        ]);
        expect(res.body.habits[0].days[0].time).toBeNull();
    });

    it('shows flexible-period habits, trackers and nothing else only on the days they were done', async () => {
        await createHabit('cal-flex', {
            name: 'Run',
            goal: goal({
                period: 'WEEK',
                goal_type: 'COUNT',
                frequency_target: 3,
                target_minor: 3,
            }),
            schedule: { schedule_mode: 'FLEXIBLE_PERIOD' },
        });
        await agent.post('/api/cadence/habits/cal-flex/entries').send({
            local_date: '2026-10-06',
            value_minor: 1,
            observed_zone_id: 'UTC',
        });

        const res = await range('2026-10-05', '2026-10-08');

        expect(res.body.habits).toHaveLength(1);
        expect(res.body.habits[0].days).toEqual([
            expect.objectContaining({ date: '2026-10-06', done: true }),
        ]);
    });

    it('leaves archived habits and dates before the start out', async () => {
        await createHabit('cal-older-1', {
            name: 'Old',
            goal: goal(),
            schedule: { schedule_mode: 'EVERY_DAY' },
        });
        await agent
            .patch('/api/cadence/habits/cal-older-1')
            .send({ archived: true });
        await createHabit('cal-newer-1', {
            name: 'New',
            starts_on: '2026-10-10',
            goal: goal(),
            schedule: { schedule_mode: 'EVERY_DAY' },
        });

        const res = await range('2026-10-08', '2026-10-11');

        expect(res.body.habits).toHaveLength(1);
        expect(res.body.habits[0].days.map((d) => d.date)).toEqual([
            '2026-10-10',
            '2026-10-11',
        ]);
    });

    it('does not show the habits of another user', async () => {
        await createHabit('cal-mine', {
            name: 'Mine',
            goal: goal(),
            schedule: { schedule_mode: 'EVERY_DAY' },
        });
        const other = await signIn('cadence-calendar-other@example.com');

        const res = await other
            .get('/api/cadence/calendar')
            .query({ from: '2026-10-05', to: '2026-10-06' });

        expect(res.status).toBe(200);
        expect(res.body.habits).toEqual([]);
    });

    it('rejects a missing, reversed or oversized range and anonymous calls', async () => {
        expect((await range(undefined, undefined)).status).toBe(400);
        expect((await range('2026-10-06', '2026-10-05')).status).toBe(400);
        expect((await range('2026-01-01', '2027-12-31')).status).toBe(400);
        const anonymous = await request(app)
            .get('/api/cadence/calendar')
            .query({ from: '2026-10-05', to: '2026-10-06' });
        expect(anonymous.status).toBe(401);
    });
});
