'use strict';

// Finish-to-start rule for "blocks" links, on local days (YYYY-MM-DD).
// A task's period is its exact dates (start to due), else the week of
// week_of, else the month of month_of. Two tasks are compared at the
// coarser grain of the two: a successor must start after the predecessor's
// last day (both dated), or in the same week or month as the one in which
// the predecessor ends, or later. The successor is only ever pushed later,
// by the smallest step that satisfies the rule, and keeps its own grain.

const moment = require('moment-timezone');

const DAY = 'YYYY-MM-DD';
const RANK = { day: 0, week: 1, month: 2 };

const utc = (day) => moment.utc(day, DAY, true);
const addDays = (day, n) => utc(day).add(n, 'days').format(DAY);
const daysBetween = (a, b) => utc(b).diff(utc(a), 'days');

const weekStart = (day, firstDayOfWeek) => {
    const m = utc(day);
    return m.subtract((m.day() - firstDayOfWeek + 7) % 7, 'days').format(DAY);
};
const monthStart = (day) => `${day.slice(0, 7)}-01`;

// `task` holds local days: start, due, week_of, month_of.
function periodOf(task, firstDayOfWeek = 1) {
    const { start, due, week_of: weekOf, month_of: monthOf } = task;
    if (start || due) {
        const a = start || due;
        const b = due || start;
        return { grain: 'day', from: a < b ? a : b, to: a < b ? b : a };
    }
    if (weekOf) {
        const from = weekStart(weekOf, firstDayOfWeek);
        return { grain: 'week', from, to: addDays(from, 6) };
    }
    if (monthOf) {
        const from = monthStart(monthOf);
        return {
            grain: 'month',
            from,
            to: utc(from).endOf('month').format(DAY),
        };
    }
    return null;
}

// What to change on `succ` so it follows `pred`, or null when it already
// does: { shiftDays } for a dated task, { weekOf } or { monthOf } for a
// horizon.
function pushFor(pred, succ, firstDayOfWeek = 1) {
    const grain =
        RANK[pred.grain] >= RANK[succ.grain] ? pred.grain : succ.grain;

    if (grain === 'day') {
        if (succ.from > pred.to) return null;
        return { shiftDays: daysBetween(succ.from, pred.to) + 1 };
    }

    const key =
        grain === 'week' ? (day) => weekStart(day, firstDayOfWeek) : monthStart;
    const target = key(pred.to);
    if (key(succ.from) >= target) return null;

    if (succ.grain === 'day') {
        const moved =
            grain === 'week'
                ? addDays(succ.from, daysBetween(key(succ.from), target))
                : utc(succ.from)
                      .add(
                          utc(target).diff(utc(key(succ.from)), 'months'),
                          'months'
                      )
                      .format(DAY);
        return { shiftDays: daysBetween(succ.from, moved) };
    }
    if (succ.grain === 'month') return { monthOf: target };
    // A week task: the predecessor's week, or the first week that starts
    // in the predecessor's month.
    if (grain === 'week') return { weekOf: target };
    let weekOf = weekStart(target, firstDayOfWeek);
    if (weekOf < target) weekOf = addDays(weekOf, 7);
    return { weekOf };
}

// A dated task that is also set for a week or a month keeps them in step
// with its dates: each moves to the period holding its first day plus
// `days`. Returns only the fields the task has.
function shiftHorizons(
    { week_of: weekOf, month_of: monthOf },
    days,
    firstDayOfWeek = 1
) {
    const moved = {};
    if (weekOf)
        moved.week_of = weekStart(addDays(weekOf, days), firstDayOfWeek);
    if (monthOf) moved.month_of = monthStart(addDays(monthOf, days));
    return moved;
}

module.exports = { periodOf, pushFor, shiftHorizons };
