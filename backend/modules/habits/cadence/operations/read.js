'use strict';

const moment = require('moment-timezone');
const { User } = require('../../../../models');
const { getSafeTimezone } = require('../../../../utils/timezone-utils');
const { NotFoundError, ValidationError } = require('../../../../shared/errors');
const engine = require('../index');
const repository = require('../repository');
const { serialize, idMap } = require('../core/serializers');
const mappers = require('../core/mappers');
const { ensureDefaultGroups } = require('./defaultGroups');

const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function userContext(userId, requestedDate) {
    const user = await User.findByPk(userId, {
        attributes: ['id', 'timezone'],
    });
    const timezone = getSafeTimezone(user?.timezone);
    if (requestedDate !== undefined && !engine.dates.isDate(requestedDate)) {
        throw new ValidationError('date must be YYYY-MM-DD');
    }
    return {
        timezone,
        today: requestedDate ?? moment().tz(timezone).format('YYYY-MM-DD'),
    };
}

// Everything the rules need for a set of habits, loaded in a few queries.
async function loadBundles(userId, habits) {
    const ids = habits.map((h) => h.id);
    const [goals, schedules, entries, pauses, groups] = await Promise.all([
        repository.childrenOf('habit_goal', userId, ids),
        repository.childrenOf('habit_schedule', userId, ids),
        repository.childrenOf('habit_entry', userId, ids),
        repository.childrenOf('habit_pause', userId, ids),
        repository.listGroups(userId),
    ]);
    const uids = { habit: idMap(habits), habit_group: idMap(groups) };
    const byHabit = new Map(
        habits.map((h) => [
            h.id,
            { habit: h, goals: [], schedules: [], entries: [], pauses: [] },
        ])
    );
    const put = (rows, key, entity) => {
        for (const row of rows) {
            byHabit.get(row.habit_id)[key].push(serialize(entity, row, uids));
        }
    };
    put(goals, 'goals', 'habit_goal');
    put(schedules, 'schedules', 'habit_schedule');
    put(entries, 'entries', 'habit_entry');
    put(pauses, 'pauses', 'habit_pause');
    return { bundles: byHabit, uids };
}

const snake = (evaluation) => ({
    period_start: evaluation.period.start,
    period_end_exclusive: evaluation.period.endExclusive,
    progress_minor: evaluation.progressMinor,
    target_minor: evaluation.targetMinor,
    attainment: evaluation.attainment,
    validates_period: evaluation.validatesPeriod,
    is_completed: evaluation.isCompleted,
    reached_minimum: evaluation.reachedMinimum,
    limit_status: evaluation.limitStatus,
    session_count: evaluation.sessionCount,
    is_paused: evaluation.isPaused,
    is_planned: evaluation.isPlannedForDate,
    needs_attention: evaluation.needsAttentionNow,
    counts_as_failure: evaluation.countsAsFailure,
});

function engineInputs(bundle) {
    const { habit } = bundle;
    return {
        habitAt: mappers.habitAtFromRows(habit, bundle.goals, bundle.schedules),
        entries: bundle.entries.map((e) => mappers.entryFromRow(e, habit.uid)),
        pauses: bundle.pauses.map(mappers.pauseFromRow),
    };
}

// The state of a habit on one date: where its period stands and its streak.
function statusOn(bundle, date) {
    const { habitAt, entries, pauses } = engineInputs(bundle);
    const habit = habitAt(date);
    if (!habit) return { date, evaluation: null, streak: null };
    return {
        date,
        evaluation: snake(engine.evaluate(habit, date, entries, pauses)),
        streak: engine.computeStreak(habitAt, date, entries, pauses),
    };
}

function listView(bundle, uids, date) {
    const goal = mappers.versionAt(sorted(bundle.goals), date);
    const schedule = mappers.versionAt(sorted(bundle.schedules), date);
    return {
        ...serialize('habit', bundle.habit, uids),
        goal,
        schedule,
        status: statusOn(bundle, date),
    };
}

const sorted = (versions) =>
    [...versions].sort((a, b) =>
        a.effective_from === b.effective_from
            ? a.created_at.localeCompare(b.created_at)
            : a.effective_from.localeCompare(b.effective_from)
    );

async function listHabits(userId, { archived, date } = {}) {
    const ctx = await userContext(userId, date);
    const habits = await repository.listHabits(userId, { archived });
    const { bundles, uids } = await loadBundles(userId, habits);
    return {
        date: ctx.today,
        timezone: ctx.timezone,
        habits: habits.map((h) => listView(bundles.get(h.id), uids, ctx.today)),
    };
}

async function getHabitRow(userId, uid) {
    const habit = await repository.findHabit(userId, uid);
    if (!habit) throw new NotFoundError('Habit not found');
    return habit;
}

const COLLECTIONS = [
    ['quick_values', 'habit_quick_value'],
    ['reminders', 'habit_reminder'],
    ['health_connect_imports', 'health_connect_import'],
    ['abstinence_logs', 'abstinence_log'],
    ['alcohol_consumptions', 'alcohol_consumption'],
    ['learned_question_records', 'learned_question_record'],
];
const SINGLES = [
    ['timer', 'habit_timer'],
    ['health_connect_rule', 'health_connect_rule'],
    ['learned_question_settings', 'learned_question_settings'],
];

// One habit with every version and companion row, and its statistics.
async function getHabit(userId, uid, { date } = {}) {
    const ctx = await userContext(userId, date);
    const habit = await getHabitRow(userId, uid);
    const { bundles, uids } = await loadBundles(userId, [habit]);
    const bundle = bundles.get(habit.id);
    const view = listView(bundle, uids, ctx.today);

    const extras = {};
    for (const [key, entity] of COLLECTIONS) {
        extras[key] = (
            await repository.listChildren(entity, userId, habit)
        ).map((row) => serialize(entity, row, uids));
    }
    for (const [key, entity] of SINGLES) {
        const row = (await repository.listChildren(entity, userId, habit))[0];
        extras[key] = row ? serialize(entity, row, uids) : null;
    }

    const { habitAt, entries, pauses } = engineInputs(bundle);
    const summary = engine.computeSummary(habitAt, ctx.today, entries, pauses);
    return {
        ...view,
        goals: sorted(bundle.goals),
        schedules: sorted(bundle.schedules),
        pauses: bundle.pauses,
        ...extras,
        stats: {
            summary,
            activity: engine.computeActivity(
                habit.uid,
                habit.starts_on,
                ctx.today,
                entries
            ),
        },
    };
}

async function listGroups(userId) {
    await ensureDefaultGroups(userId);
    const groups = await repository.listGroups(userId);
    return groups.map((g) => serialize('habit_group', g));
}

module.exports = {
    userContext,
    listHabits,
    getHabit,
    getHabitRow,
    listGroups,
    loadBundles,
};
