'use strict';

// Reads postponements from the history the app already keeps: due date
// changes in task_events and the day plans in daily_plans. Nothing is
// counted at write time, so the numbers can always be rebuilt from those
// rows. See docs/34-review.md for the rules in plain words.
const moment = require('moment-timezone');

// Writes that come from the person using the app. Anything else (sync,
// import, recurrence, scripts) is never a postponement.
const USER_SOURCES = new Set(['web', 'api']);

const WINDOW_DAYS = 30;
const FREQUENT_THRESHOLD = 3;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// The user's local day of a stored value. A bare YYYY-MM-DD is already a
// local day (older events stored the request body as sent).
function localDay(value, timezone) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string' && DAY_RE.test(value)) return value;
    const m = moment.utc(value);
    return m.isValid() ? m.tz(timezone).format('YYYY-MM-DD') : null;
}

const addDays = (day, days) =>
    moment.utc(day, 'YYYY-MM-DD').add(days, 'days').format('YYYY-MM-DD');

const dueOf = (value) =>
    value && typeof value === 'object' ? (value.due_date ?? null) : null;

// What a due_date_changed event was, in the user's timezone:
// - automatic: not written by the user (sync, import, recurrence...)
// - time_shift: same day, another time
// - scheduled / unscheduled: a date added or removed
// - advanced: moved earlier
// - postponed: moved later while the old day had come or was the next day,
//   the clearest sign of putting something off
// - rescheduled: moved later well ahead of time, a plan change
function classifyDueChange(event, timezone) {
    const source = event.metadata?.source || 'web';
    const from = localDay(dueOf(event.old_value), timezone);
    const to = localDay(dueOf(event.new_value), timezone);
    const at = localDay(event.created_at, timezone);
    const base = { from, to, at, source };
    if (!USER_SOURCES.has(source)) return { ...base, kind: 'automatic' };
    if (!from && !to) return { ...base, kind: 'automatic' };
    if (!from) return { ...base, kind: 'scheduled' };
    if (!to) return { ...base, kind: 'unscheduled' };
    if (from === to) return { ...base, kind: 'time_shift' };
    if (to < from) return { ...base, kind: 'advanced' };
    if (from <= addDays(at, 1)) return { ...base, kind: 'postponed' };
    return { ...base, kind: 'rescheduled' };
}

// Recurring tasks and habits reopen on their own, so a plan day they were
// on says nothing about whether that day's occurrence was done.
const tracksMissedDays = (task) =>
    !task.habit_mode &&
    (!task.recurrence_type || task.recurrence_type === 'none') &&
    !task.recurring_parent_id;

// Past plan days the task was on and not finished by: the task is still
// open, or it was completed on a later day.
function missedPlanDays(task, planDays, today, timezone) {
    if (!tracksMissedDays(task)) return [];
    const completedOn = localDay(task.completed_at, timezone);
    return planDays.filter(
        (day) => day < today && (!completedOn || completedOn > day)
    );
}

// One push per day given up: a postponement off day D and an unfinished
// plan on day D are the same push. `at` is when it was decided.
function collectPushes(classified, missedDays) {
    const byDay = new Map();
    for (const change of classified) {
        if (change.kind !== 'postponed') continue;
        const prev = byDay.get(change.from);
        if (!prev || prev.at < change.at) {
            byDay.set(change.from, { day: change.from, at: change.at });
        }
    }
    for (const day of missedDays) {
        if (!byDay.has(day)) byDay.set(day, { day, at: day });
    }
    return [...byDay.values()].sort((a, b) => a.at.localeCompare(b.at));
}

// The window counts pushes decided in the last 30 days, and none from
// before the user last kept the task as it was in the review.
function windowStart(today, reviewedAt, timezone) {
    const start = addDays(today, -WINDOW_DAYS);
    const reviewed = localDay(reviewedAt, timezone);
    return reviewed && reviewed > start ? reviewed : start;
}

function summarize(pushes, today, reviewedAt, timezone) {
    const since = windowStart(today, reviewedAt, timezone);
    const reviewed = localDay(reviewedAt, timezone);
    const recent = pushes.filter(
        (push) => push.at >= since && (!reviewed || push.at > reviewed)
    );
    const last = pushes[pushes.length - 1] || null;
    return {
        recent_count: recent.length,
        total_count: pushes.length,
        last_postponed_on: last ? last.at : null,
        last_planned_for: pushes.length
            ? pushes.map((p) => p.day).sort()[pushes.length - 1]
            : null,
        frequent: recent.length >= FREQUENT_THRESHOLD,
    };
}

module.exports = {
    USER_SOURCES,
    WINDOW_DAYS,
    FREQUENT_THRESHOLD,
    localDay,
    addDays,
    classifyDueChange,
    tracksMissedDays,
    missedPlanDays,
    collectPushes,
    windowStart,
    summarize,
};
