'use strict';

const dates = require('./dates');
const { isAbstinence, isTracker, pauseIncludes } = require('./models');
const { periodWindow, isPlannedOn, evaluate } = require('./evaluator');

// Mirrors android/domain HabitStatisticsSummary.kt and HabitActivityStats.kt.

const MIN_FOR_COMPARISON = { DAY: 7, WEEK: 2, MONTH: 1 };

function confidenceFor(periodType, evaluatedPeriods) {
    switch (periodType) {
        case 'DAY':
            if (evaluatedPeriods >= 21) return 'ESTABLISHED';
            if (evaluatedPeriods >= 7) return 'LIMITED';
            return 'INSUFFICIENT';
        case 'WEEK':
            if (evaluatedPeriods >= 4) return 'ESTABLISHED';
            if (evaluatedPeriods >= 2) return 'LIMITED';
            return 'INSUFFICIENT';
        case 'MONTH':
            return evaluatedPeriods >= 1 ? 'LIMITED' : 'INSUFFICIENT';
        default:
            return 'INSUFFICIENT';
    }
}

// Kotlin's roundToInt rounds half up, like Math.round.
const rate = (validated, evaluated) =>
    evaluated === 0 ? null : Math.round((validated * 100) / evaluated);

function dayStatus(habit, date, entries, pauses) {
    if (!habit || isAbstinence(habit.goal) || !isPlannedOn(habit, date)) {
        return 'UNPLANNED';
    }
    const hasEntry = () =>
        entries.some((e) => e.habitId === habit.id && e.localDate === date);
    if (isTracker(habit.goal)) return hasEntry() ? 'ACTIVITY' : 'NO_ACTIVITY';
    if (pauses.some((p) => pauseIncludes(p, date))) return 'PAUSED';
    if (habit.goal.period !== 'DAY') {
        return hasEntry() ? 'ACTIVITY' : 'NO_ACTIVITY';
    }
    const evaluation = evaluate(habit, date, entries, pauses);
    if (evaluation.isCompleted) return 'IDEAL';
    if (evaluation.validatesPeriod) return 'MINIMUM';
    return 'MISSED';
}

// A period belongs to the window in which it closes, read with the version of
// the habit in force on its last day.
function computeSummary(habitAt, today, entries, pauses) {
    const from = dates.minusDays(today, 30);
    const previousFrom = dates.minusDays(from, 30);
    const current = { evaluated: 0, validated: 0, ideal: 0, observable: 0 };
    const previous = { evaluated: 0, validated: 0, ideal: 0, observable: 0 };
    const currentTypes = new Set();
    const previousTypes = new Set();
    const days = [];
    const periods = [];

    for (let offset = 0; offset < 60; offset += 1) {
        const date = dates.plusDays(previousFrom, offset);
        const habit = habitAt(date);
        const isCurrent = date >= from;
        if (isCurrent) {
            days.push({
                date,
                status: dayStatus(habit, date, entries, pauses),
            });
        }
        if (!habit || isAbstinence(habit.goal) || isTracker(habit.goal))
            continue;
        const window = periodWindow(
            date,
            habit.goal.period,
            habit.schedule.firstDayOfWeek
        );
        if (window.endExclusive !== dates.plusDays(date, 1)) continue;
        if (date < habit.startsOn) continue;
        const totals = isCurrent ? current : previous;
        const types = isCurrent ? currentTypes : previousTypes;
        totals.observable += 1;
        types.add(habit.goal.period);

        let observed = false;
        for (
            let day = window.start;
            day < window.endExclusive && !observed;
            day = dates.plusDays(day, 1)
        ) {
            const version = habitAt(day);
            observed =
                Boolean(version) &&
                !isAbstinence(version.goal) &&
                !isTracker(version.goal) &&
                isPlannedOn(version, day) &&
                !pauses.some((p) => pauseIncludes(p, day));
        }
        const evaluation = evaluate(
            habit,
            date,
            entries.filter((e) => e.localDate >= habit.startsOn),
            pauses
        );
        if (isCurrent) {
            let status;
            if (!observed) status = 'PAUSED';
            else if (evaluation.isCompleted) status = 'IDEAL';
            else if (evaluation.validatesPeriod) status = 'MINIMUM';
            else status = 'MISSED';
            periods.push({
                start: window.start,
                endExclusive: window.endExclusive,
                periodType: habit.goal.period,
                status,
            });
        }
        if (!observed) continue;
        totals.evaluated += 1;
        if (evaluation.validatesPeriod) totals.validated += 1;
        if (evaluation.isCompleted) totals.ideal += 1;
    }

    const allTypes = new Set([...currentTypes, ...previousTypes]);
    let periodType = null;
    if (currentTypes.size === 1) [periodType] = currentTypes;
    else if (previousTypes.size === 1) [periodType] = previousTypes;
    else if (allTypes.size === 1) [periodType] = allTypes;

    let isHomogeneous;
    if (currentTypes.size === 0 && previousTypes.size === 0) {
        isHomogeneous = true;
    } else if (currentTypes.size === 0)
        isHomogeneous = previousTypes.size === 1;
    else if (previousTypes.size === 0) isHomogeneous = currentTypes.size === 1;
    else {
        isHomogeneous =
            currentTypes.size === 1 &&
            previousTypes.size === 1 &&
            [...currentTypes][0] === [...previousTypes][0];
    }

    let comparison = null;
    if (isHomogeneous && periodType !== null) {
        const min = MIN_FOR_COMPARISON[periodType];
        if (current.evaluated >= min && previous.evaluated >= min) {
            const currentRate = rate(current.validated, current.evaluated);
            const previousRate = rate(previous.validated, previous.evaluated);
            if (currentRate !== null && previousRate !== null) {
                const delta = currentRate - previousRate;
                let trend = 'STABLE';
                if (delta > 0) trend = 'IMPROVING';
                else if (delta < 0) trend = 'DECLINING';
                comparison = {
                    currentRatePercent: currentRate,
                    previousRatePercent: previousRate,
                    deltaPercentagePoints: delta,
                    trend,
                };
            }
        }
    }

    const calendarDays = [];
    for (
        let date = dates.minusDays(today, 364);
        date <= today;
        date = dates.plusDays(date, 1)
    ) {
        calendarDays.push({
            date,
            status: dayStatus(habitAt(date), date, entries, pauses),
        });
    }

    const confidence = confidenceFor(periodType, current.evaluated);
    return {
        evaluatedPeriods: current.evaluated,
        validatedPeriods: current.validated,
        idealPeriods: current.ideal,
        previousEvaluatedPeriods: previous.evaluated,
        previousValidatedPeriods: previous.validated,
        previousIdealPeriods: previous.ideal,
        periodType,
        from,
        untilExclusive: today,
        previousFrom,
        days,
        calendarDays,
        periods,
        observablePeriods: current.observable,
        previousObservablePeriods: previous.observable,
        comparison,
        isHomogeneous,
        confidence,
        completeness: {
            evaluatedPeriods: current.evaluated,
            observablePeriods: current.observable,
            confidence,
        },
        successRatePercent: rate(current.validated, current.evaluated),
        trendPercentagePoints: comparison
            ? comparison.deltaPercentagePoints
            : null,
    };
}

const calendarDaysBetween = (from, today) =>
    from > today ? 0 : dates.daysBetween(from, today) + 1;

const maxDate = (a, b) => (a > b ? a : b);

function computeActivity(habitId, startsOn, today, entries) {
    const from = maxDate(startsOn, dates.minusDays(today, 29));
    const from90 = maxDate(startsOn, dates.minusDays(today, 89));
    const from365 = maxDate(startsOn, dates.minusDays(today, 364));
    const allTime = entries.filter(
        (e) =>
            e.habitId === habitId &&
            e.localDate >= startsOn &&
            e.localDate <= today
    );
    const recent365 = allTime.filter((e) => e.localDate >= from365);
    const recent90 = recent365.filter((e) => e.localDate >= from90);
    const recent = recent90.filter((e) => e.localDate >= from);
    const sum = (list) => list.reduce((s, e) => s + e.valueMinor, 0);
    const distinctDays = (list) => new Set(list.map((e) => e.localDate)).size;

    const perDay = new Map();
    for (const e of recent) {
        perDay.set(e.localDate, (perDay.get(e.localDate) ?? 0) + e.valueMinor);
    }
    const dailyTotals = [...perDay.values()];
    const total = dailyTotals.reduce((s, v) => s + v, 0);

    return {
        entries30: recent.length,
        activeDays30: dailyTotals.length,
        totalMinor30: total,
        peakDayMinor30: dailyTotals.length ? Math.max(...dailyTotals) : 0,
        averagePerActiveDayMinor30: dailyTotals.length
            ? total / dailyTotals.length
            : null,
        calendarDays30: calendarDaysBetween(from, today),
        entries90: recent90.length,
        activeDays90: distinctDays(recent90),
        totalMinor90: sum(recent90),
        calendarDays90: calendarDaysBetween(from90, today),
        entries365: recent365.length,
        activeDays365: distinctDays(recent365),
        totalMinor365: sum(recent365),
        calendarDays365: calendarDaysBetween(from365, today),
        entriesAllTime: allTime.length,
        activeDaysAllTime: distinctDays(allTime),
        totalMinorAllTime: sum(allTime),
        calendarDaysAllTime: calendarDaysBetween(startsOn, today),
    };
}

module.exports = { computeSummary, computeActivity, confidenceFor, dayStatus };
