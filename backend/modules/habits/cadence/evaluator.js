'use strict';

const dates = require('./dates');
const {
    isLimit,
    isAbstinence,
    isTracker,
    targetAt,
    pauseIncludes,
} = require('./models');

// Mirrors android/domain PeriodCalculator.kt, HabitEvaluator.kt.

function periodWindow(date, period, firstDayOfWeek = 'MONDAY') {
    if (period === 'DAY') {
        return { start: date, endExclusive: dates.plusDays(date, 1) };
    }
    if (period === 'WEEK') {
        const first = dates.DAYS.indexOf(firstDayOfWeek) + 1;
        const back = (((dates.dayOfWeekValue(date) - first) % 7) + 7) % 7;
        const start = dates.minusDays(date, back);
        return { start, endExclusive: dates.plusDays(start, 7) };
    }
    const start = dates.withDayOfMonth1(date);
    return { start, endExclusive: dates.plusMonths(start, 1) };
}

const windowIncludes = (window, date) =>
    date >= window.start && date < window.endExclusive;

// A day on which the habit is expected: not archived, not before its start,
// on its schedule.
function isPlannedOn(habit, date) {
    if (!habit.active || habit.archived || date < habit.startsOn) return false;
    if (isTracker(habit.goal)) return true;
    const { schedule } = habit;
    switch (schedule.mode) {
        case 'EVERY_DAY':
        case 'FLEXIBLE_PERIOD':
            return true;
        case 'SELECTED_DAYS':
            return schedule.activeDays.includes(dates.dayOfWeekName(date));
        case 'INTERVAL_DAYS':
            return (
                dates.daysBetween(habit.startsOn, date) %
                    schedule.intervalDays ===
                0
            );
        default:
            return false;
    }
}

function evaluate(habit, date, entries, pauses = []) {
    const { goal } = habit;
    const period = periodWindow(
        date,
        goal.period,
        habit.schedule.firstDayOfWeek
    );
    const periodEntries = entries.filter(
        (e) => e.habitId === habit.id && windowIncludes(period, e.localDate)
    );
    const progress = periodEntries.reduce((sum, e) => sum + e.valueMinor, 0);

    const withSession = new Set(
        periodEntries
            .filter((e) => e.sessionId !== null)
            .map((e) => e.sessionId)
    ).size;
    const withoutSession = periodEntries.filter(
        (e) => e.sessionId === null
    ).length;
    const sessionCount = withSession + withoutSession;

    const limit = isLimit(goal);
    // The progression is recomputed from its start, never accumulated.
    const target = targetAt(goal, period.start);
    let limitStatus = null;
    if (limit) {
        if (progress < target) limitStatus = 'UNDER';
        else if (progress === target) limitStatus = 'AT_LIMIT';
        else limitStatus = 'EXCEEDED';
    }

    const tracker = isTracker(goal);
    const completedQuantity = !tracker && progress >= target;
    const reachedMinimum =
        !tracker && progress >= (goal.minimumMinor ?? target);
    const completedFrequency =
        goal.frequencyTarget === null || sessionCount >= goal.frequencyTarget;

    let validatesPeriod;
    if (tracker) validatesPeriod = false;
    else if (limit) validatesPeriod = limitStatus !== 'EXCEEDED';
    else validatesPeriod = reachedMinimum && completedFrequency;

    let isCompleted;
    if (tracker) isCompleted = false;
    else if (limit) isCompleted = validatesPeriod;
    else isCompleted = completedQuantity && completedFrequency;

    let attainment;
    if (limit) attainment = validatesPeriod ? 'IDEAL' : 'TODO';
    else if (isCompleted) attainment = 'IDEAL';
    else if (validatesPeriod) attainment = 'MINIMUM';
    else attainment = 'TODO';

    const isPaused = pauses.some((p) => pauseIncludes(p, date));
    const isPlannedForDate = isPlannedOn(habit, date);

    // A limit stays offered while there is room, so a coffee can be logged.
    const needsAttentionNow =
        !tracker &&
        isPlannedForDate &&
        !isPaused &&
        (limit ? isAbstinence(goal) || limitStatus === 'UNDER' : !isCompleted);

    return {
        period,
        progressMinor: progress,
        completedQuantity,
        reachedMinimum,
        validatesPeriod,
        attainment,
        targetMinor: target,
        limitStatus,
        sessionCount,
        completedFrequency,
        isCompleted,
        isPaused,
        isPlannedForDate,
        needsAttentionNow,
        requiresAction: needsAttentionNow,
        // A period whose minimum is reached is not a failure.
        countsAsFailure:
            !tracker && isPlannedForDate && !isPaused && !validatesPeriod,
    };
}

module.exports = { periodWindow, windowIncludes, isPlannedOn, evaluate };
