'use strict';

const { ValidationError } = require('../../../../shared/errors');
const engine = require('../index');
const { dayStatus } = require('../statistics');
const repository = require('../repository');
const mappers = require('../core/mappers');
const { userContext, loadBundles } = require('./read');

// A year view plus its padding.
const MAX_SPAN_DAYS = 400;
const DONE = new Set(['IDEAL', 'MINIMUM', 'ACTIVITY']);

const names = (value) =>
    String(value ?? '')
        .split(',')
        .filter((part) => part !== '');

// The earliest enabled reminder that rings on the date's weekday, as HH:mm.
function reminderTime(reminders, date) {
    const weekday = engine.dates.dayOfWeekName(date);
    const times = reminders
        .filter((r) => r.enabled)
        .filter((r) => {
            const days = names(r.days_of_week);
            return days.length === 0 || days.includes(weekday);
        })
        .map((r) => r.time)
        .sort();
    return times[0] ?? null;
}

// What the habit shows on one day of the calendar, or null when it does not
// appear: paused or unplanned days are left out, and a tracker or a flexible
// period habit appears only on the days it was done, since it is not due on
// a given day.
function calendarDay(habitAt, date, entries, pauses, reminders) {
    const habit = habitAt(date);
    if (!habit) return null;
    const status = dayStatus(habit, date, entries, pauses);
    if (status === 'UNPLANNED' || status === 'PAUSED') return null;
    const done = DONE.has(status);
    const dueAnyDay =
        habit.goal.direction === 'TRACK_ONLY' ||
        habit.schedule.mode === 'FLEXIBLE_PERIOD';
    if (dueAnyDay && !done) return null;
    return { date, status, done, time: reminderTime(reminders, date) };
}

// The habits' days over a range of dates (inclusive), for the calendar.
async function habitsCalendar(userId, { from, to }) {
    if (!engine.dates.isDate(from) || !engine.dates.isDate(to)) {
        throw new ValidationError('from and to must be YYYY-MM-DD');
    }
    if (to < from) throw new ValidationError('to must not be before from');
    if (engine.dates.daysBetween(from, to) >= MAX_SPAN_DAYS) {
        throw new ValidationError(
            `The range is limited to ${MAX_SPAN_DAYS} days`
        );
    }

    const ctx = await userContext(userId);
    const habits = await repository.listHabits(userId, { archived: false });
    const { bundles, uids } = await loadBundles(userId, habits);
    const reminderRows = await repository.childrenOf(
        'habit_reminder',
        userId,
        habits.map((h) => h.id)
    );

    const result = [];
    for (const habit of habits) {
        const bundle = bundles.get(habit.id);
        const habitAt = mappers.habitAtFromRows(
            habit,
            bundle.goals,
            bundle.schedules
        );
        const entries = bundle.entries.map((e) =>
            mappers.entryFromRow(e, habit.uid)
        );
        const pauses = bundle.pauses.map(mappers.pauseFromRow);
        const reminders = reminderRows.filter((r) => r.habit_id === habit.id);

        const days = [];
        for (
            let date = from;
            date <= to;
            date = engine.dates.plusDays(date, 1)
        ) {
            const day = calendarDay(habitAt, date, entries, pauses, reminders);
            if (day) days.push(day);
        }
        if (days.length === 0) continue;
        result.push({
            uid: habit.uid,
            name: habit.name,
            icon_id: habit.icon_id ?? null,
            color_argb: habit.color_argb ?? null,
            group_uid: uids.habit_group.get(habit.group_id) ?? null,
            days,
        });
    }
    return { from, to, timezone: ctx.timezone, habits: result };
}

module.exports = { habitsCalendar };
