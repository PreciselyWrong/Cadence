'use strict';

const dates = require('./dates');

// Rule objects use the camelCase shape of fixtures/habits/README.md. The
// builders repeat the `require` checks of android/domain/HabitModels.kt so a
// goal, schedule or pause refused there is refused here.

// Long.MAX_VALUE as a double (the nearest, 2^63): the ceiling of a
// progression without cap.
const LONG_MAX = 9223372036854775807;

const PERIODS = ['DAY', 'WEEK', 'MONTH'];
const GOAL_TYPES = ['BINARY', 'COUNT', 'QUANTITY', 'DURATION'];
const DIRECTIONS = ['AT_LEAST', 'AT_MOST', 'TRACK_ONLY'];
const SCHEDULE_MODES = [
    'EVERY_DAY',
    'SELECTED_DAYS',
    'FLEXIBLE_PERIOD',
    'INTERVAL_DAYS',
];
const CADENCES = ['WEEKLY', 'MONTHLY'];
const PAUSE_REASONS = ['REST', 'ILLNESS', 'TRAVEL', 'CUSTOM', 'MANUAL'];

function check(condition, message) {
    if (!condition) throw new Error(message);
}

const isInt = (v) => Number.isSafeInteger(v);

function buildProgression(raw) {
    if (!raw) return null;
    check(CADENCES.includes(raw.cadence), 'Unknown progression cadence');
    // A step beyond the safe range is legal in the domain (Long) and simply
    // reaches the ceiling at once.
    check(
        typeof raw.step === 'number' && raw.step > 0,
        'Progression step must be positive'
    );
    const capMinor = raw.capMinor ?? null;
    check(
        capMinor === null || (isInt(capMinor) && capMinor > 0),
        'Progression cap must be positive'
    );
    check(dates.isDate(raw.startsOn), 'Progression needs a start date');
    return {
        step: raw.step,
        cadence: raw.cadence,
        capMinor,
        startsOn: raw.startsOn,
    };
}

// Number of steps crossed between the start and `date`.
function stepsUntil(progression, date) {
    if (date < progression.startsOn) return 0;
    const steps =
        progression.cadence === 'WEEKLY'
            ? dates.weeksBetween(progression.startsOn, date)
            : (Number(date.slice(0, 4)) -
                  Number(progression.startsOn.slice(0, 4))) *
                  12 +
              (Number(date.slice(5, 7)) -
                  Number(progression.startsOn.slice(5, 7)));
    return Math.max(steps, 0);
}

function progressionTargetAt(progression, startingTargetMinor, date) {
    const ceiling = Math.max(
        progression.capMinor ?? LONG_MAX,
        startingTargetMinor
    );
    const steps = stepsUntil(progression, date);
    // Compare before multiplying so a huge step cannot overflow.
    if (
        steps > Math.floor((ceiling - startingTargetMinor) / progression.step)
    ) {
        return ceiling;
    }
    return startingTargetMinor + progression.step * steps;
}

function buildUnit(raw) {
    if (!raw) return null;
    check(raw.id && String(raw.id).trim() !== '', 'Unit id cannot be blank');
    const scale = raw.scaleToCanonical ?? 1;
    check(isInt(scale) && scale > 0, 'Scale to canonical must be positive');
    return {
        id: raw.id,
        dimension: raw.dimension ?? 'CUSTOM',
        nameFr: raw.nameFr ?? '',
        symbol: raw.symbol ?? '',
        scaleToCanonical: scale,
    };
}

function buildGoal(raw) {
    const goal = {
        targetMinor: raw.targetMinor,
        period: raw.period,
        goalType: raw.goalType ?? 'QUANTITY',
        unit: buildUnit(raw.unit),
        frequencyTarget: raw.frequencyTarget ?? null,
        minimumMinor: raw.minimumMinor ?? null,
        direction: raw.direction ?? 'AT_LEAST',
        progression: buildProgression(raw.progression),
    };
    check(PERIODS.includes(goal.period), 'Unknown period');
    check(GOAL_TYPES.includes(goal.goalType), 'Unknown goal type');
    check(DIRECTIONS.includes(goal.direction), 'Unknown direction');
    check(isInt(goal.targetMinor), 'Target must be an integer');
    check(
        goal.targetMinor > 0 ||
            (goal.targetMinor === 0 && goal.direction !== 'AT_LEAST'),
        'Only a limit or tracker permits a zero target'
    );
    check(
        goal.targetMinor !== 0 ||
            (goal.progression === null && goal.frequencyTarget === null),
        'A zero target carries no progression or frequency'
    );
    check(
        goal.frequencyTarget === null ||
            (isInt(goal.frequencyTarget) && goal.frequencyTarget > 0),
        'Frequency target must be positive'
    );
    if (goal.minimumMinor !== null) {
        check(
            isInt(goal.minimumMinor) && goal.minimumMinor > 0,
            'Minimum must be positive'
        );
        check(
            goal.minimumMinor <= goal.targetMinor,
            'Minimum cannot exceed the ideal'
        );
    }
    if (goal.direction === 'AT_MOST') {
        check(goal.minimumMinor === null, 'A limit carries no minimum');
        check(goal.goalType !== 'BINARY', 'A limit needs a countable goal');
    }
    if (goal.direction === 'TRACK_ONLY') {
        check(
            goal.targetMinor === 0 && goal.period === 'DAY',
            'A tracker has no target and records daily activity'
        );
        check(
            goal.goalType !== 'BINARY' && goal.minimumMinor === null,
            'A tracker needs a measurable entry, not a goal'
        );
    }
    return goal;
}

const isLimit = (goal) => goal.direction === 'AT_MOST';
const isAbstinence = (goal) => isLimit(goal) && goal.targetMinor === 0;
const isTracker = (goal) => goal.direction === 'TRACK_ONLY';

function targetAt(goal, date) {
    return goal.progression
        ? progressionTargetAt(goal.progression, goal.targetMinor, date)
        : goal.targetMinor;
}

function buildSchedule(raw = {}) {
    const schedule = {
        mode: raw.mode ?? 'SELECTED_DAYS',
        activeDays: [...(raw.activeDays ?? dates.DAYS)],
        firstDayOfWeek: raw.firstDayOfWeek ?? 'MONDAY',
        intervalDays: raw.intervalDays ?? 2,
    };
    check(SCHEDULE_MODES.includes(schedule.mode), 'Unknown schedule mode');
    check(
        schedule.activeDays.every((d) => dates.DAYS.includes(d)) &&
            dates.DAYS.includes(schedule.firstDayOfWeek),
        'Unknown day of week'
    );
    if (schedule.mode === 'SELECTED_DAYS') {
        check(
            schedule.activeDays.length > 0,
            'At least one active day is required for SELECTED_DAYS'
        );
    }
    check(
        isInt(schedule.intervalDays) && schedule.intervalDays >= 2,
        'Interval must be at least two days'
    );
    return schedule;
}

function buildHabit(raw) {
    return {
        id: raw.id ?? 'h',
        startsOn: raw.startsOn ?? '1970-01-01',
        active: raw.active ?? true,
        archived: raw.archived ?? false,
        goal: buildGoal(raw.goal),
        schedule: buildSchedule(raw.schedule),
    };
}

function buildEntry(raw, habitId) {
    return {
        habitId: raw.habitId ?? habitId,
        localDate: raw.localDate,
        valueMinor: raw.valueMinor,
        sessionId: raw.sessionId ?? null,
    };
}

function buildPause(raw) {
    const pause = {
        start: raw.start,
        endExclusive: raw.endExclusive ?? null,
        reason: raw.reason ?? null,
        reasonLabel: raw.reasonLabel ?? null,
    };
    check(
        pause.endExclusive === null || pause.endExclusive > pause.start,
        'Pause end must be after start'
    );
    check(
        pause.reason === null || PAUSE_REASONS.includes(pause.reason),
        'Unknown pause reason'
    );
    if (pause.reason === 'CUSTOM') {
        check(
            pause.reasonLabel && pause.reasonLabel.trim() !== '',
            'A custom reason needs its wording'
        );
    }
    return pause;
}

const pauseIncludes = (pause, date) =>
    date >= pause.start &&
    (pause.endExclusive === null || date < pause.endExclusive);

const isSingleDay = (pause) =>
    pause.endExclusive === dates.plusDays(pause.start, 1);

const isCancellableOn = (pause, date) =>
    isSingleDay(pause) && date === pause.start;

// Early resume: the pause stops on the morning of `date`; null when the
// resume precedes its first day.
function resumedOn(pause, date) {
    if (date <= pause.start) return null;
    if (pause.endExclusive !== null && date >= pause.endExclusive) return pause;
    return { ...pause, endExclusive: date };
}

module.exports = {
    LONG_MAX,
    buildGoal,
    buildSchedule,
    buildHabit,
    buildEntry,
    buildPause,
    isLimit,
    isAbstinence,
    isTracker,
    targetAt,
    pauseIncludes,
    isSingleDay,
    isCancellableOn,
    resumedOn,
};
