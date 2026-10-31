'use strict';

const models = require('../models');

// Wire rows (snake_case, as in schema.js) to the objects of the rule engine.

const names = (value) =>
    String(value ?? '')
        .split(',')
        .filter((part) => part !== '');

function goalFromRow(row) {
    return models.buildGoal({
        targetMinor: row.target_minor,
        period: row.period,
        goalType: row.goal_type,
        unit: row.unit_id
            ? {
                  id: row.unit_id,
                  dimension: row.unit_dimension ?? 'CUSTOM',
                  nameFr: row.unit_name_fr ?? '',
                  symbol: row.unit_symbol ?? '',
                  scaleToCanonical: row.unit_scale_to_canonical ?? 1,
              }
            : null,
        frequencyTarget: row.frequency_target,
        minimumMinor: row.minimum_minor,
        direction: row.direction,
        progression:
            row.progression_step == null
                ? null
                : {
                      step: row.progression_step,
                      cadence: row.progression_cadence,
                      capMinor: row.progression_cap_minor,
                      startsOn: row.progression_starts_on,
                  },
    });
}

const scheduleFromRow = (row) =>
    models.buildSchedule({
        mode: row.schedule_mode,
        activeDays: names(row.active_days),
        firstDayOfWeek: row.first_day_of_week,
        intervalDays: row.interval_days,
    });

const entryFromRow = (row, habitUid) => ({
    habitId: habitUid,
    localDate: row.local_date,
    valueMinor: row.value_minor,
    sessionId: row.session_id ?? null,
});

const pauseFromRow = (row) =>
    models.buildPause({
        start: row.start,
        endExclusive: row.end_exclusive,
        reason: row.reason,
        reasonLabel: row.reason_label,
    });

// The version in force on a date: the latest `effective_from` not after it;
// among equal dates the last one written wins, like Room's findLast.
function versionAt(versions, date) {
    let found = null;
    for (const version of versions) {
        if (version.effective_from <= date) found = version;
    }
    return found;
}

// habitAt(date) for the engine, from a habit row and its goal and schedule
// versions (ties on effective_from are ordered by created_at).
function habitAtFromRows(habit, goalRows, scheduleRows) {
    const goals = [...goalRows].sort(byEffective);
    const schedules = [...scheduleRows].sort(byEffective);
    const cache = new Map();
    return (date) => {
        const goalRow = versionAt(goals, date);
        const scheduleRow = versionAt(schedules, date);
        if (!goalRow || !scheduleRow) return null;
        const key = `${goalRow.uid}|${scheduleRow.uid}`;
        if (!cache.has(key)) {
            cache.set(key, {
                id: habit.uid,
                startsOn: habit.starts_on,
                active: habit.active,
                archived: habit.archived,
                goal: goalFromRow(goalRow),
                schedule: scheduleFromRow(scheduleRow),
            });
        }
        return cache.get(key);
    };
}

const byEffective = (a, b) => {
    if (a.effective_from !== b.effective_from) {
        return a.effective_from < b.effective_from ? -1 : 1;
    }
    if (a.created_at === b.created_at) return 0;
    return a.created_at < b.created_at ? -1 : 1;
};

module.exports = {
    goalFromRow,
    scheduleFromRow,
    entryFromRow,
    pauseFromRow,
    versionAt,
    habitAtFromRows,
};
