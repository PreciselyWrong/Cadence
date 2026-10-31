const request = require('supertest');
const app = require('../../app');
const {
    Habit,
    HabitGroup,
    HabitGoal,
    HabitEntry,
    SyncChange,
} = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const { eraseUserAccount } = require('../../services/accountErasureService');

const hlc = (ms, counter = 0, node = 'devA') =>
    `${String(ms).padStart(13, '0')}-${String(counter).padStart(4, '0')}-${node}`;

const signIn = async (email) => {
    const user = await createTestUser({ email });
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email, password: 'password123' });
    return { user, agent };
};

let opCounter = 0;
const upsert = (entity, uid, fields, clock = hlc(1000)) => ({
    op_id: `op-${(opCounter += 1)}`,
    entity,
    uid,
    action: 'upsert',
    fields: Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, { value: v, hlc: clock }])
    ),
});
const remove = (entity, uid, clock = hlc(2000)) => ({
    op_id: `op-${(opCounter += 1)}`,
    entity,
    uid,
    action: 'delete',
    hlc: clock,
});

const push = (agent, ops) => agent.post('/api/v1/sync/push').send({ ops });
const statuses = (res) => res.body.results.map((r) => r.status);

const HABIT = 'habit-uuid-0001';

const goal = (overrides = {}) =>
    upsert('habit_goal', 'goal-uuid-0001', {
        habit_uid: HABIT,
        target_minor: 1800,
        period: 'DAY',
        goal_type: 'DURATION',
        unit_id: 'minutes',
        unit_dimension: 'TIME',
        unit_name_fr: 'Minutes',
        unit_symbol: 'min',
        unit_scale_to_canonical: 60,
        minimum_minor: 600,
        direction: 'AT_LEAST',
        effective_from: '2026-10-01',
        ...overrides,
    });

describe('Cadence habits over /sync', () => {
    let agent;
    let user;

    beforeEach(async () => {
        opCounter = 0;
        ({ agent, user } = await signIn('cadence@example.com'));
    });

    const seedHabit = () =>
        push(agent, [
            upsert('habit_group', 'group-day', {
                name: 'Journee',
                start_minute: null,
                end_minute: null,
                sort_order: 0,
            }),
            upsert('habit', HABIT, {
                name: 'Lecture',
                active: true,
                starts_on: '2026-10-01',
                group_uid: 'group-day',
            }),
        ]);

    it('lists the habit entities with their fields and references', async () => {
        const res = await agent.get('/api/v1/sync/meta');
        const names = res.body.entities.map((e) => e.name);

        expect(names).toEqual(
            expect.arrayContaining([
                'habit_group',
                'habit',
                'habit_goal',
                'habit_schedule',
                'habit_entry',
                'habit_pause',
                'habit_quick_value',
                'habit_reminder',
                'habit_timer',
                'health_connect_rule',
                'health_connect_import',
                'abstinence_log',
                'alcohol_consumption',
                'learned_question_settings',
                'learned_question_record',
            ])
        );
        expect(
            res.body.entities.find((e) => e.name === 'habit_group').uid_scope
        ).toBe('user');
        expect(
            res.body.entities.find((e) => e.name === 'habit').uid_scope
        ).toBe('global');
        const entry = res.body.entities.find((e) => e.name === 'habit_entry');
        expect(entry.refs).toEqual({ habit_uid: 'habit' });
        expect(entry.fields).toEqual(
            expect.arrayContaining([
                'local_date',
                'observed_zone_id',
                'source',
                'note',
                'value_minor',
            ])
        );
    });

    it('stores a habit with its group, goal, schedule and entry, and serves them back by uid', async () => {
        const res = await push(agent, [
            upsert('habit_group', 'group-day', { name: 'Journee' }),
            upsert('habit', HABIT, {
                name: 'Lecture',
                starts_on: '2026-10-01',
                group_uid: 'group-day',
            }),
            goal(),
            upsert('habit_schedule', 'sched-uuid-0001', {
                habit_uid: HABIT,
                schedule_mode: 'SELECTED_DAYS',
                active_days: 'MONDAY,WEDNESDAY',
                first_day_of_week: 'MONDAY',
                effective_from: '2026-10-01',
            }),
            upsert('habit_entry', 'entry-uuid-0001', {
                habit_uid: HABIT,
                occurred_at: '2026-10-05T21:30:00.000Z',
                local_date: '2026-10-05',
                observed_zone_id: 'Europe/Zurich',
                value_minor: 1500,
                source: 'MANUAL',
                note: 'chapter 3',
            }),
        ]);

        expect(statuses(res)).toEqual(Array(5).fill('applied'));

        const pull = await agent.get('/api/v1/sync/pull?cursor=0');
        const byEntity = Object.fromEntries(
            pull.body.changes.map((c) => [c.entity, c.data])
        );
        expect(byEntity.habit.group_uid).toBe('group-day');
        expect(byEntity.habit_goal).toMatchObject({
            habit_uid: HABIT,
            target_minor: 1800,
            minimum_minor: 600,
            unit_scale_to_canonical: 60,
        });
        expect(byEntity.habit_entry).toMatchObject({
            habit_uid: HABIT,
            occurred_at: '2026-10-05T21:30:00.000Z',
            local_date: '2026-10-05',
            observed_zone_id: 'Europe/Zurich',
            value_minor: 1500,
            note: 'chapter 3',
        });

        const snap = await agent.get(
            '/api/v1/sync/snapshot?entity=habit_entry'
        );
        expect(snap.body.rows).toHaveLength(1);
        expect(snap.body.rows[0].value_minor).toBe(1500);
    });

    it('applies a replayed push once', async () => {
        const ops = [
            upsert('habit', HABIT, {
                name: 'Lecture',
                starts_on: '2026-10-01',
            }),
        ];

        const first = await push(agent, ops);
        const second = await push(agent, ops);

        expect(second.body.results).toEqual(first.body.results);
        expect(await Habit.count({ where: { uid: HABIT } })).toBe(1);
    });

    it('keeps the fixed group ids per user, so two users can both have group-day', async () => {
        const { agent: other } = await signIn('other-cadence@example.com');
        const op = upsert('habit_group', 'group-day', { name: 'Journee' });

        const mine = await push(agent, [op]);
        const theirs = await push(other, [{ ...op, op_id: 'op-other' }]);

        expect(statuses(mine)).toEqual(['applied']);
        expect(statuses(theirs)).toEqual(['applied']);
        expect(await HabitGroup.count({ where: { uid: 'group-day' } })).toBe(2);
    });

    it('refuses a habit uid that belongs to another user', async () => {
        const { agent: other } = await signIn('thief@example.com');
        await seedHabit();

        const res = await push(other, [
            upsert('habit', HABIT, { name: 'Stolen' }, hlc(5000)),
        ]);

        expect(res.body.results[0]).toMatchObject({
            status: 'rejected',
            reason: 'forbidden',
        });
        const row = await Habit.findOne({ where: { uid: HABIT } });
        expect(row.name).toBe('Lecture');
    });

    it('refuses a child that points at another user habit', async () => {
        const { agent: other } = await signIn('curious@example.com');
        await seedHabit();

        const res = await push(other, [
            upsert('habit_entry', 'entry-uuid-0009', {
                habit_uid: HABIT,
                occurred_at: '2026-10-05T10:00:00.000Z',
                local_date: '2026-10-05',
                observed_zone_id: 'UTC',
                value_minor: 1,
            }),
        ]);

        expect(res.body.results[0]).toMatchObject({
            status: 'rejected',
            reason: 'invalid_reference:habit_uid',
        });
    });

    it.each([
        ['a minimum above the ideal', { minimum_minor: 2000 }],
        ['a zero target for an at-least goal', { target_minor: 0 }],
        ['an unknown period', { period: 'YEAR' }],
        [
            'a progression without its cadence',
            { progression_step: 5, progression_starts_on: '2026-10-01' },
        ],
        [
            'a limit with a minimum',
            { direction: 'AT_MOST', goal_type: 'COUNT', minimum_minor: 1 },
        ],
        ['a non-integer target', { target_minor: 1.5 }],
    ])('rejects a goal with %s', async (_label, overrides) => {
        await seedHabit();

        const res = await push(agent, [goal(overrides)]);

        expect(res.body.results[0].status).toBe('rejected');
        expect(res.body.results[0].reason).toMatch(/^invalid_value/);
        expect(await HabitGoal.count()).toBe(0);
    });

    it('accepts limits, free activities and progressions as goal versions', async () => {
        await seedHabit();

        const res = await push(agent, [
            goal({
                direction: 'AT_MOST',
                goal_type: 'COUNT',
                minimum_minor: null,
                target_minor: 2,
                unit_id: null,
                unit_dimension: null,
                unit_name_fr: null,
                unit_symbol: null,
                unit_scale_to_canonical: null,
                progression_step: 1,
                progression_cadence: 'WEEKLY',
                progression_cap_minor: 4,
                progression_starts_on: '2026-10-01',
            }),
        ]);

        expect(statuses(res)).toEqual(['applied']);
    });

    it('rejects an entry with a value that is not positive, and a row missing its required fields', async () => {
        await seedHabit();

        const res = await push(agent, [
            upsert('habit_entry', 'entry-uuid-0002', {
                habit_uid: HABIT,
                occurred_at: '2026-10-05T10:00:00.000Z',
                local_date: '2026-10-05',
                observed_zone_id: 'UTC',
                value_minor: 0,
            }),
            upsert('habit_entry', 'entry-uuid-0003', {
                habit_uid: HABIT,
                local_date: '2026-10-05',
            }),
            upsert('habit_entry', 'entry-uuid-0004', {
                habit_uid: HABIT,
                occurred_at: 'yesterday',
                local_date: '2026-13-45',
                observed_zone_id: 'UTC',
                value_minor: 1,
            }),
        ]);

        expect(res.body.results.map((r) => r.reason)).toEqual([
            'invalid_value',
            'missing_field:occurred_at',
            'invalid_value:occurred_at',
        ]);
        expect(await HabitEntry.count()).toBe(0);
    });

    it('merges entry fields by clock and records the loser', async () => {
        await seedHabit();
        await push(agent, [
            upsert(
                'habit_entry',
                'entry-uuid-0005',
                {
                    habit_uid: HABIT,
                    occurred_at: '2026-10-05T10:00:00.000Z',
                    local_date: '2026-10-05',
                    observed_zone_id: 'UTC',
                    value_minor: 5,
                    note: 'new',
                },
                hlc(3000)
            ),
        ]);

        const res = await push(agent, [
            upsert(
                'habit_entry',
                'entry-uuid-0005',
                { note: 'old' },
                hlc(2000)
            ),
        ]);

        expect(res.body.results[0]).toMatchObject({
            status: 'conflict',
            rejected_fields: ['note'],
        });
        const row = await HabitEntry.findOne({
            where: { uid: 'entry-uuid-0005' },
        });
        expect(row.note).toBe('new');
    });

    it('refuses a second alcohol day or learned answer with the same natural key', async () => {
        await seedHabit();
        const alcohol = (uid) =>
            upsert('alcohol_consumption', uid, {
                habit_uid: HABIT,
                local_date: '2026-10-05',
                observed_zone_id: 'UTC',
                standard_drinks: 2,
            });

        const res = await push(agent, [
            alcohol('alcohol-uuid-0001'),
            alcohol('alcohol-uuid-0002'),
        ]);

        expect(statuses(res)).toEqual(['applied', 'rejected']);
        expect(res.body.results[1].reason).toBe('duplicate_key');
    });

    it('stores a timer, quick values, reminders, pauses and Health Connect state', async () => {
        await seedHabit();

        const res = await push(agent, [
            upsert('habit_timer', HABIT, {
                habit_uid: HABIT,
                accumulated_seconds: 90,
                running_since: '2026-10-05T10:00:00.000Z',
            }),
            upsert('habit_quick_value', 'quick-uuid-0001', {
                habit_uid: HABIT,
                label: '+10',
                amount_minor: 10,
                sort_order: 0,
            }),
            upsert('habit_reminder', 'remind-uuid-0001', {
                habit_uid: HABIT,
                time: '08:30',
                days_of_week: 'MONDAY,FRIDAY',
                enabled: true,
                conditional: true,
            }),
            upsert('habit_pause', 'pause-uuid-0001', {
                habit_uid: HABIT,
                start: '2026-10-10',
                end_exclusive: null,
                reason: 'MANUAL',
            }),
            upsert('health_connect_rule', 'hcrule-uuid-0001', {
                habit_uid: HABIT,
                exercise_types: '8,56',
                enabled: true,
            }),
            upsert('health_connect_import', 'hc-0f7d1a2b-uuid', {
                habit_uid: HABIT,
                record_id: 'record-1',
                entry_uid: 'hc-0f7d1a2b-uuid',
                data_origin_package: 'com.example.fit',
                state: 'IGNORED',
            }),
            upsert('abstinence_log', 'abslog-uuid-0001', {
                habit_uid: HABIT,
                occurred_at: '2026-10-05T10:00:00.000Z',
                local_date: '2026-10-05',
                observed_zone_id: 'UTC',
                kind: 'URGE',
                intensity: 4,
                note: null,
            }),
            upsert('learned_question_settings', 'lqset-uuid-0001', {
                habit_uid: HABIT,
                enabled: true,
                ask_at: '09:00',
                threshold_percent: 50,
                muted_weekdays: '',
                silent_during_pauses: true,
            }),
            upsert('learned_question_record', `${HABIT}_2026-10-05`, {
                habit_uid: HABIT,
                local_date: '2026-10-05',
                outcome: 'AMOUNT',
                value_minor: 3,
                recorded_at: '2026-10-05T18:00:00.000Z',
            }),
        ]);

        expect(statuses(res)).toEqual(Array(9).fill('applied'));
    });

    it.each([
        ['an urge without intensity', 'abstinence_log', { kind: 'URGE' }],
        [
            'a check-in with an intensity',
            'abstinence_log',
            { kind: 'CHECK_IN', intensity: 2 },
        ],
        ['a reminder at a wrong time', 'habit_reminder', { time: '25:61' }],
        [
            'an amount answer without a value',
            'learned_question_record',
            { outcome: 'AMOUNT', value_minor: null },
        ],
    ])('rejects %s', async (_label, entity, overrides) => {
        await seedHabit();
        const base = {
            abstinence_log: {
                occurred_at: '2026-10-05T10:00:00.000Z',
                local_date: '2026-10-05',
                observed_zone_id: 'UTC',
                kind: 'CHECK_IN',
                intensity: null,
            },
            habit_reminder: {
                time: '08:00',
                days_of_week: '',
                enabled: true,
            },
            learned_question_record: {
                local_date: '2026-10-05',
                outcome: 'YES',
                value_minor: null,
                recorded_at: '2026-10-05T10:00:00.000Z',
            },
        }[entity];

        const res = await push(agent, [
            upsert(entity, 'child-uuid-0001', {
                habit_uid: HABIT,
                ...base,
                ...overrides,
            }),
        ]);

        expect(res.body.results[0].status).toBe('rejected');
    });

    it('journals a tombstone for every child when a habit is deleted', async () => {
        await seedHabit();
        await push(agent, [
            goal(),
            upsert('habit_entry', 'entry-uuid-0006', {
                habit_uid: HABIT,
                occurred_at: '2026-10-05T10:00:00.000Z',
                local_date: '2026-10-05',
                observed_zone_id: 'UTC',
                value_minor: 2,
            }),
        ]);
        const before = await SyncChange.max('id');

        const res = await push(agent, [remove('habit', HABIT)]);

        expect(statuses(res)).toEqual(['applied']);
        const deletes = await SyncChange.findAll({
            where: { op: 'delete', user_id: user.id },
        });
        expect(
            deletes
                .filter((c) => c.id > before)
                .map((c) => `${c.entity}:${c.uid}`)
                .sort()
        ).toEqual(
            [
                'habit:habit-uuid-0001',
                'habit_entry:entry-uuid-0006',
                'habit_goal:goal-uuid-0001',
            ].sort()
        );
        expect(await HabitEntry.count()).toBe(0);
    });

    it('sends habits of a deleted group back to the always-available group', async () => {
        await seedHabit();

        await push(agent, [remove('habit_group', 'group-day')]);

        const habit = await Habit.findOne({ where: { uid: HABIT } });
        expect(habit.group_id).toBeNull();
        const pull = await agent.get('/api/v1/sync/pull?cursor=0&limit=1000');
        const last = pull.body.changes
            .filter((c) => c.entity === 'habit' && c.op === 'upsert')
            .pop();
        expect(last.data.group_uid).toBeNull();
    });

    it('does not let a delete resurrect: a late edit to a deleted entry is refused', async () => {
        await seedHabit();
        await push(agent, [
            upsert('habit_entry', 'entry-uuid-0007', {
                habit_uid: HABIT,
                occurred_at: '2026-10-05T10:00:00.000Z',
                local_date: '2026-10-05',
                observed_zone_id: 'UTC',
                value_minor: 2,
            }),
            remove('habit_entry', 'entry-uuid-0007'),
        ]);

        const res = await push(agent, [
            upsert(
                'habit_entry',
                'entry-uuid-0007',
                { note: 'late' },
                hlc(9000)
            ),
        ]);

        expect(res.body.results[0]).toMatchObject({
            status: 'rejected',
            reason: 'deleted',
        });
    });

    it('removes habit data, and its journal, when the account is erased', async () => {
        const { user: leaving, agent: leavingAgent } = await signIn(
            'leaving@example.com'
        );
        await push(leavingAgent, [
            upsert('habit', 'habit-uuid-0099', { name: 'Gone' }),
            upsert('habit_entry', 'entry-uuid-0099', {
                habit_uid: 'habit-uuid-0099',
                occurred_at: '2026-10-05T10:00:00.000Z',
                local_date: '2026-10-05',
                observed_zone_id: 'UTC',
                value_minor: 1,
            }),
        ]);

        await eraseUserAccount(leaving.id);

        expect(await Habit.count({ where: { user_id: leaving.id } })).toBe(0);
        expect(await HabitEntry.count({ where: { user_id: leaving.id } })).toBe(
            0
        );
        expect(await SyncChange.count({ where: { user_id: leaving.id } })).toBe(
            0
        );
    });
});
