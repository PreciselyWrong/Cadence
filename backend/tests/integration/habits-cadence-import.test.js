const {
    Task,
    RecurringCompletion,
    User,
    Habit,
    HabitGoal,
    HabitSchedule,
    HabitEntry,
    HabitPause,
    HabitReminder,
    HabitGroup,
} = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const cadence = require('../../modules/habits/cadence');
const {
    importLegacyHabits,
    importAllLegacyHabits,
} = require('../../modules/habits/cadence/operations/importLegacy');

describe('Importing Tududi habits into Cadence habits', () => {
    let user;

    beforeEach(async () => {
        user = await createTestUser({ email: 'legacy@example.com' });
        await User.update(
            { timezone: 'Europe/Zurich', first_day_of_week: 1 },
            { where: { id: user.id } }
        );
    });

    const legacyHabit = (fields) =>
        Task.create({
            user_id: user.id,
            habit_mode: true,
            created_at: new Date('2026-10-01T08:00:00Z'),
            ...fields,
        });

    const checkIn = (task, at, fields = {}) =>
        RecurringCompletion.create({
            task_id: task.id,
            completed_at: new Date(at),
            original_due_date: new Date(at),
            ...fields,
        });

    const rowsOf = async (task) => {
        const habit = await Habit.findOne({ where: { uid: task.uid } });
        const where = { habit_id: habit.id };
        return {
            habit,
            goal: await HabitGoal.findOne({ where }),
            schedule: await HabitSchedule.findOne({ where }),
            entries: await HabitEntry.findAll({
                where,
                order: [['occurred_at', 'ASC']],
            }),
            pauses: await HabitPause.findAll({ where }),
            reminders: await HabitReminder.findAll({ where }),
        };
    };

    it('turns a daily yes/no habit into a binary goal, version 1, with its history', async () => {
        const task = await legacyHabit({
            name: 'Meditate',
            note: 'ten minutes',
            habit_target_count: 1,
            habit_frequency_period: 'daily',
            habit_color: '#1D4ED8',
            habit_time_of_day: 'morning',
            habit_reminder_time: '07:30',
        });
        await checkIn(task, '2026-10-02T21:30:00Z', { note: 'late' });
        await checkIn(task, '2026-10-03T06:00:00Z');

        const report = await importLegacyHabits(user.id);

        expect(report).toMatchObject({ imported: 1, entries: 2 });
        const rows = await rowsOf(task);
        expect(rows.habit).toMatchObject({
            name: 'Meditate',
            description: 'ten minutes',
            starts_on: '2026-10-01',
            archived: false,
            color_argb: 0xff1d4ed8 | 0,
        });
        expect(rows.goal).toMatchObject({
            target_minor: 1,
            period: 'DAY',
            goal_type: 'BINARY',
            direction: 'AT_LEAST',
            effective_from: '2026-10-01',
        });
        expect(rows.schedule).toMatchObject({
            schedule_mode: 'EVERY_DAY',
            first_day_of_week: 'MONDAY',
            effective_from: '2026-10-01',
        });
        expect(rows.entries.map((e) => e.local_date)).toEqual([
            '2026-10-02',
            '2026-10-03',
        ]);
        // 21:30 UTC is already the next day in Zurich in October.
        expect(rows.entries[0]).toMatchObject({
            observed_zone_id: 'Europe/Zurich',
            value_minor: 1,
            source: 'MANUAL',
            note: 'late',
        });
        expect(rows.reminders[0]).toMatchObject({
            time: '07:30',
            days_of_week: '',
            enabled: true,
        });
        const morning = await HabitGroup.findOne({
            where: { user_id: user.id, uid: 'group-morning' },
        });
        expect(rows.habit.group_id).toBe(morning.id);
    });

    it('leaves the legacy habit, its check-ins and counters untouched', async () => {
        const task = await legacyHabit({ name: 'Walk' });
        await checkIn(task, '2026-10-02T10:00:00Z');

        await importLegacyHabits(user.id);

        const after = await Task.findByPk(task.id);
        expect(after.habit_mode).toBe(true);
        expect(
            await RecurringCompletion.count({ where: { task_id: task.id } })
        ).toBe(1);
    });

    it('keeps amounts as integers with the right precision', async () => {
        const whole = await legacyHabit({
            name: 'Pages',
            habit_target_value: 20,
            habit_unit: 'pages',
            habit_frequency_period: 'weekly',
        });
        await checkIn(whole, '2026-10-02T10:00:00Z', { value: 12 });
        const decimal = await legacyHabit({
            name: 'Run',
            habit_target_value: 2.5,
            habit_unit: 'km',
        });
        await checkIn(decimal, '2026-10-02T10:00:00Z', { value: 1.25 });

        await importLegacyHabits(user.id);

        const a = await rowsOf(whole);
        expect(a.goal).toMatchObject({
            target_minor: 20,
            period: 'WEEK',
            goal_type: 'QUANTITY',
            unit_id: 'custom:pages',
            unit_scale_to_canonical: 1,
        });
        expect(a.schedule.schedule_mode).toBe('FLEXIBLE_PERIOD');
        expect(a.entries[0].value_minor).toBe(12);
        const b = await rowsOf(decimal);
        expect(b.goal).toMatchObject({
            target_minor: 250,
            unit_scale_to_canonical: 100,
        });
        expect(b.entries[0].value_minor).toBe(125);
    });

    it('turns a quit habit into a zero limit where each check-in is a slip', async () => {
        const task = await legacyHabit({
            name: 'No sugar',
            habit_polarity: 'quit',
        });
        await checkIn(task, '2026-10-03T10:00:00Z');

        await importLegacyHabits(user.id);

        const rows = await rowsOf(task);
        expect(rows.goal).toMatchObject({
            target_minor: 0,
            direction: 'AT_MOST',
            goal_type: 'COUNT',
        });
        expect(rows.entries[0].value_minor).toBe(1);
    });

    it('maps scheduled weekdays (Sunday is 0), intervals and counts', async () => {
        const days = await legacyHabit({
            name: 'Gym',
            habit_target_count: 1,
            habit_schedule_days: [1, 3, 0],
        });
        const interval = await legacyHabit({
            name: 'Water plants',
            habit_frequency_period: 'interval',
            habit_interval_days: 3,
        });
        const weekly = await legacyHabit({
            name: 'Call',
            habit_frequency_period: 'weekly',
            habit_target_count: 3,
        });

        await importLegacyHabits(user.id);

        expect((await rowsOf(days)).schedule).toMatchObject({
            schedule_mode: 'SELECTED_DAYS',
            active_days: 'MONDAY,WEDNESDAY,SUNDAY',
        });
        expect((await rowsOf(interval)).schedule).toMatchObject({
            schedule_mode: 'INTERVAL_DAYS',
            interval_days: 3,
        });
        const call = await rowsOf(weekly);
        expect(call.goal).toMatchObject({
            target_minor: 3,
            period: 'WEEK',
            goal_type: 'COUNT',
        });
    });

    it('turns skipped days into one-day rest pauses and archived habits into archived ones', async () => {
        const task = await legacyHabit({ name: 'Read', status: 3 });
        await checkIn(task, '2026-10-04T10:00:00Z', { skipped: true });

        const report = await importLegacyHabits(user.id);

        const rows = await rowsOf(task);
        expect(rows.habit.archived).toBe(true);
        expect(rows.pauses).toHaveLength(1);
        expect(rows.pauses[0]).toMatchObject({
            start: '2026-10-04',
            end_exclusive: '2026-10-05',
            reason: 'REST',
        });
        expect(rows.entries).toHaveLength(0);
        expect(report.pauses).toBe(1);
    });

    it('starts the history on the earliest check-in when it precedes the creation day', async () => {
        const task = await legacyHabit({ name: 'Backfilled' });
        await checkIn(task, '2026-09-20T10:00:00Z');

        await importLegacyHabits(user.id);

        expect((await rowsOf(task)).habit.starts_on).toBe('2026-09-20');
    });

    it('drops amount check-ins without a value and reports them', async () => {
        const task = await legacyHabit({
            name: 'Pages',
            habit_target_value: 10,
        });
        await checkIn(task, '2026-10-02T10:00:00Z');
        await checkIn(task, '2026-10-03T10:00:00Z', { value: 4 });

        const report = await importLegacyHabits(user.id);

        expect(report).toMatchObject({ entries: 1, droppedEntries: 1 });
    });

    it('imports once: a second run finds the habits already there', async () => {
        const task = await legacyHabit({ name: 'Once' });
        await checkIn(task, '2026-10-02T10:00:00Z');

        await importLegacyHabits(user.id);
        const again = await importLegacyHabits(user.id);

        expect(again).toMatchObject({ imported: 0, alreadyImported: 1 });
        expect(await Habit.count({ where: { uid: task.uid } })).toBe(1);
        expect(await HabitEntry.count()).toBe(1);
        expect(await HabitGroup.count({ where: { user_id: user.id } })).toBe(4);
    });

    it('imports for every user and never mixes them up', async () => {
        const other = await createTestUser({ email: 'legacy2@example.com' });
        await legacyHabit({ name: 'Mine' });
        await Task.create({
            user_id: other.id,
            habit_mode: true,
            name: 'Theirs',
        });

        const total = await importAllLegacyHabits();

        expect(total).toMatchObject({ users: 2, imported: 2 });
        expect(await Habit.count({ where: { user_id: user.id } })).toBe(1);
        expect(await Habit.count({ where: { user_id: other.id } })).toBe(1);
    });

    it('produces habits the rule engine accepts and judges like the legacy one', async () => {
        const task = await legacyHabit({
            name: 'Daily',
            created_at: new Date('2026-10-01T08:00:00Z'),
        });
        for (const day of ['02', '03', '04']) {
            await checkIn(task, `2026-10-${day}T10:00:00Z`);
        }
        await importLegacyHabits(user.id);

        const rows = await rowsOf(task);
        const habit = cadence.buildHabit({
            id: task.uid,
            startsOn: rows.habit.starts_on,
            goal: {
                targetMinor: rows.goal.target_minor,
                period: rows.goal.period,
                goalType: rows.goal.goal_type,
            },
            schedule: { mode: 'EVERY_DAY' },
        });
        const entries = rows.entries.map((e) =>
            cadence.buildEntry(
                { localDate: e.local_date, valueMinor: e.value_minor },
                task.uid
            )
        );

        const streak = cadence.computeStreak(
            () => habit,
            '2026-10-04',
            entries,
            []
        );

        expect(streak).toEqual({ current: 3, best: 3 });
    });
});
