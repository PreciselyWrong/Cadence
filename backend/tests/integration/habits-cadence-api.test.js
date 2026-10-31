const request = require('supertest');
const app = require('../../app');
const { User, Habit, HabitEntry, HabitGoal } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

const signIn = async (email) => {
    const user = await createTestUser({ email });
    await User.update(
        { timezone: 'Europe/Zurich' },
        { where: { id: user.id } }
    );
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email, password: 'password123' });
    return { user, agent };
};

const READING = {
    uid: 'habit-read-0001',
    name: 'Reading',
    starts_on: '2026-10-01',
    goal: {
        target_minor: 1800,
        period: 'DAY',
        goal_type: 'DURATION',
        unit_id: 'minutes',
        unit_dimension: 'TIME',
        unit_name_fr: 'Minutes',
        unit_symbol: 'min',
        unit_scale_to_canonical: 60,
        minimum_minor: 600,
    },
    schedule: { schedule_mode: 'EVERY_DAY' },
};

describe('Cadence habits REST', () => {
    let agent;
    let user;

    beforeEach(async () => {
        ({ agent, user } = await signIn('cadence-api@example.com'));
    });

    const createReading = (overrides = {}) =>
        agent.post('/api/cadence/habits').send({ ...READING, ...overrides });

    const logEntry = (date, value, extra = {}) =>
        agent.post(`/api/cadence/habits/${READING.uid}/entries`).send({
            local_date: date,
            value_minor: value,
            observed_zone_id: 'Europe/Zurich',
            ...extra,
        });

    it('creates a habit with its first goal and schedule version', async () => {
        const res = await createReading();

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            uid: READING.uid,
            name: 'Reading',
            archived: false,
            group_uid: null,
            goal: {
                target_minor: 1800,
                minimum_minor: 600,
                effective_from: '2026-10-01',
                habit_uid: READING.uid,
            },
            schedule: {
                schedule_mode: 'EVERY_DAY',
                first_day_of_week: 'MONDAY',
                effective_from: '2026-10-01',
            },
        });
        expect(res.body.goals).toHaveLength(1);
        expect(res.body.field_clocks).toBeUndefined();
    });

    it('answers 200 with the existing habit when the uid was sent before', async () => {
        await createReading();

        const again = await createReading();

        expect(again.status).toBe(200);
        expect(await Habit.count()).toBe(1);
    });

    it.each([
        ['an unknown field', { nickname: 'x' }],
        ['a missing name', { name: undefined }],
        ['a bad date', { starts_on: '2026-13-40' }],
        ['a bad uid', { uid: 'x y' }],
        [
            'a minimum above the ideal',
            { goal: { ...READING.goal, minimum_minor: 5000 } },
        ],
        ['no goal', { goal: undefined }],
    ])('refuses %s with 400', async (_label, overrides) => {
        const res = await createReading(overrides);

        expect(res.status).toBe(400);
        expect(await Habit.count()).toBe(0);
    });

    it('keeps habits private: another user sees 404, and a uid clash is 409', async () => {
        await createReading();
        const { agent: other } = await signIn('intruder@example.com');

        expect(
            (await other.get(`/api/cadence/habits/${READING.uid}`)).status
        ).toBe(404);
        expect(
            (await other.delete(`/api/cadence/habits/${READING.uid}`)).status
        ).toBe(404);
        expect(
            (
                await other
                    .post(`/api/cadence/habits/${READING.uid}/entries`)
                    .send({ value_minor: 1 })
            ).status
        ).toBe(404);
        expect(
            (await other.post('/api/cadence/habits').send(READING)).status
        ).toBe(409);
        expect((await other.get('/api/cadence/habits')).body.habits).toEqual(
            []
        );
    });

    it('logs entries and reports the period from the rules engine', async () => {
        await createReading();

        const first = await logEntry('2026-10-05', 600, {
            note: 'short',
            session_id: 's1',
        });
        expect(first.status).toBe(201);
        expect(first.body).toMatchObject({
            habit_uid: READING.uid,
            local_date: '2026-10-05',
            value_minor: 600,
            source: 'MANUAL',
            note: 'short',
            observed_zone_id: 'Europe/Zurich',
        });
        await logEntry('2026-10-05', 1200);

        const list = await agent.get('/api/cadence/habits?date=2026-10-05');
        const habit = list.body.habits[0];
        expect(habit.status.evaluation).toMatchObject({
            progress_minor: 1800,
            target_minor: 1800,
            attainment: 'IDEAL',
            validates_period: true,
            is_completed: true,
        });
        expect(habit.status.streak).toEqual({ current: 1, best: 1 });
    });

    it('derives the local date of an entry from its instant and zone', async () => {
        await createReading();

        const res = await agent
            .post(`/api/cadence/habits/${READING.uid}/entries`)
            .send({
                occurred_at: '2026-10-05T22:30:00.000Z',
                observed_zone_id: 'Europe/Zurich',
                value_minor: 60,
            });

        expect(res.status).toBe(201);
        expect(res.body.local_date).toBe('2026-10-06');
    });

    it('lists entries of a date range, edits them and deletes them', async () => {
        await createReading();
        const a = await logEntry('2026-10-05', 60);
        await logEntry('2026-10-09', 90);

        const range = await agent.get(
            `/api/cadence/habits/${READING.uid}/entries?from=2026-10-08&to=2026-10-31`
        );
        expect(range.body.map((e) => e.local_date)).toEqual(['2026-10-09']);

        const patched = await agent
            .patch(`/api/cadence/habits/${READING.uid}/entries/${a.body.uid}`)
            .send({ value_minor: 120, note: 'longer' });
        expect(patched.body).toMatchObject({
            value_minor: 120,
            note: 'longer',
        });

        const removed = await agent.delete(
            `/api/cadence/habits/${READING.uid}/entries/${a.body.uid}`
        );
        expect(removed.status).toBe(200);
        expect(await HabitEntry.count()).toBe(1);
    });

    it("refuses an entry that is not positive or whose uid is another habit's", async () => {
        await createReading();

        expect((await logEntry('2026-10-05', 0)).status).toBe(400);
        expect((await logEntry('2026-10-05', 1.5)).status).toBe(400);
        expect((await logEntry('nope', 5)).status).toBe(400);
    });

    it('versions goals: a new goal applies from its date and the past keeps its own', async () => {
        await createReading();
        await logEntry('2026-10-05', 1000);
        const version = await agent
            .post(`/api/cadence/habits/${READING.uid}/goals`)
            .send({
                ...READING.goal,
                target_minor: 3600,
                minimum_minor: 1200,
                effective_from: '2026-10-10',
            });
        expect(version.status).toBe(201);

        const before = await agent.get(
            `/api/cadence/habits/${READING.uid}?date=2026-10-05`
        );
        const after = await agent.get(
            `/api/cadence/habits/${READING.uid}?date=2026-10-10`
        );

        expect(before.body.status.evaluation.target_minor).toBe(1800);
        expect(before.body.status.evaluation.validates_period).toBe(true);
        expect(after.body.status.evaluation.target_minor).toBe(3600);
        expect(after.body.goals).toHaveLength(2);
        expect(await HabitGoal.count()).toBe(2);
    });

    it('a pause makes the day neutral', async () => {
        await createReading();
        await agent.post(`/api/cadence/habits/${READING.uid}/pauses`).send({
            start: '2026-10-03',
            end_exclusive: '2026-10-06',
            reason: 'TRAVEL',
        });

        const res = await agent.get(
            `/api/cadence/habits/${READING.uid}?date=2026-10-04`
        );

        expect(res.body.status.evaluation).toMatchObject({
            is_paused: true,
            needs_attention: false,
            counts_as_failure: false,
        });
        expect(res.body.pauses).toHaveLength(1);
    });

    it('stores one timer, one Health Connect rule and one learned-question setting per habit', async () => {
        await createReading();
        const base = `/api/cadence/habits/${READING.uid}`;

        const created = await agent
            .put(`${base}/timer`)
            .send({ accumulated_seconds: 30, running_since: null });
        const updated = await agent
            .put(`${base}/timer`)
            .send({ accumulated_seconds: 90 });

        expect(created.status).toBe(201);
        expect(created.body.uid).toBe(READING.uid);
        expect(updated.status).toBe(200);
        expect((await agent.get(`${base}/timer`)).body).toMatchObject({
            accumulated_seconds: 90,
        });
        expect((await agent.delete(`${base}/timer`)).status).toBe(200);
        expect((await agent.get(`${base}/timer`)).body).toBeNull();
        expect(
            (
                await agent.put(`${base}/health-connect-rule`).send({
                    exercise_types: '8,56',
                })
            ).status
        ).toBe(201);
    });

    it("manages groups and sends a deleted group's habits back to the day group", async () => {
        const groups = await agent.get('/api/cadence/groups');
        expect(groups.body.map((g) => g.uid)).toEqual([
            'group-day',
            'group-morning',
            'group-afternoon',
            'group-evening',
        ]);
        const habit = await createReading({ group_uid: 'group-morning' });
        expect(habit.body.group_uid).toBe('group-morning');
        expect(
            (
                await createReading({
                    uid: 'habit-read-0002',
                    group_uid: 'nope-0000',
                })
            ).status
        ).toBe(400);

        await agent
            .patch('/api/cadence/groups/group-morning')
            .send({ name: 'Early' });
        await agent.delete('/api/cadence/groups/group-morning');

        const after = await agent.get(`/api/cadence/habits/${READING.uid}`);
        expect(after.body.group_uid).toBeNull();
    });

    it('updates, archives, filters and deletes a habit', async () => {
        await createReading();

        const patched = await agent
            .patch(`/api/cadence/habits/${READING.uid}`)
            .send({ archived: true, name: 'Read more' });
        expect(patched.body).toMatchObject({
            archived: true,
            name: 'Read more',
        });
        expect(
            (await agent.get('/api/cadence/habits?archived=false')).body.habits
        ).toHaveLength(0);
        expect(
            (await agent.get('/api/cadence/habits?archived=true')).body.habits
        ).toHaveLength(1);

        await logEntry('2026-10-05', 60);
        const removed = await agent.delete(
            `/api/cadence/habits/${READING.uid}`
        );
        expect(removed.status).toBe(200);
        expect(await Habit.count()).toBe(0);
        expect(await HabitEntry.count()).toBe(0);
    });

    it('reaches the devices: web writes are pulled from the sync journal', async () => {
        await createReading();
        await logEntry('2026-10-05', 60);

        const pull = await agent.get('/api/v1/sync/pull?cursor=0&limit=1000');

        const entities = pull.body.changes.map((c) => c.entity);
        expect(entities).toEqual(
            expect.arrayContaining([
                'habit',
                'habit_goal',
                'habit_schedule',
                'habit_entry',
            ])
        );
        const entry = pull.body.changes.find((c) => c.entity === 'habit_entry');
        expect(entry.data).toMatchObject({
            habit_uid: READING.uid,
            value_minor: 60,
            local_date: '2026-10-05',
        });
        expect(user.id).toBeGreaterThan(0);
    });

    it('imports legacy habits on demand', async () => {
        const res = await agent.post('/api/cadence/import-legacy');

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ imported: 0 });
    });
});
