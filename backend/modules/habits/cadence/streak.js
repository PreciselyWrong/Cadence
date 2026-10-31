'use strict';

const dates = require('./dates');
const { isLimit, isTracker, pauseIncludes } = require('./models');
const {
    periodWindow,
    windowIncludes,
    isPlannedOn,
    evaluate,
} = require('./evaluator');

// Mirrors android/domain StreakCalculator.kt: counts validated planned
// periods, never calendar days. A period wholly paused or without a planned
// day is neutral; the running period never fails.

const MAX_PERIODS = 400;

function outcomeOf(habit, cursor, window, entries, pauses, today) {
    const plannedDays = [];
    for (
        let d = window.start;
        d < window.endExclusive;
        d = dates.plusDays(d, 1)
    ) {
        if (isPlannedOn(habit, d) && d <= today) plannedDays.push(d);
    }
    if (isTracker(habit.goal)) return 'NEUTRAL';
    if (plannedDays.length === 0) return 'NEUTRAL';
    if (plannedDays.every((day) => pauses.some((p) => pauseIncludes(p, day)))) {
        return 'NEUTRAL';
    }

    const validated = evaluate(habit, cursor, entries, pauses).validatesPeriod;
    const running = windowIncludes(window, today);
    // Under a limit nothing is won while the period can still exceed it.
    if (running && isLimit(habit.goal)) return 'NEUTRAL';
    if (validated) return 'VALIDATED';
    if (running) return 'NEUTRAL';
    return 'FAILED';
}

// `habitAt(date)` returns the habit version in force on that date (or null).
function computeStreak(
    habitAt,
    today,
    entries,
    pauses,
    maxPeriods = MAX_PERIODS
) {
    const first = habitAt(today);
    if (first && isTracker(first.goal)) return { current: 0, best: 0 };
    let current = 0;
    let best = 0;
    let running = 0;
    let broken = false;
    let cursor = today;

    for (let i = 0; i < maxPeriods; i += 1) {
        const habit = habitAt(cursor);
        if (!habit) break;
        const window = periodWindow(
            cursor,
            habit.goal.period,
            habit.schedule.firstDayOfWeek
        );
        const outcome = outcomeOf(
            habit,
            cursor,
            window,
            entries,
            pauses,
            today
        );

        if (outcome === 'VALIDATED') {
            running += 1;
            best = Math.max(best, running);
            if (!broken) current = running;
        } else if (outcome === 'FAILED') {
            running = 0;
            broken = true;
        }

        cursor = dates.minusDays(window.start, 1);
        if (cursor < habit.startsOn) return { current, best };
    }
    return { current, best };
}

module.exports = { computeStreak };
