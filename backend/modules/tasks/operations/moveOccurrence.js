'use strict';

const moment = require('moment-timezone');
const { Task, sequelize } = require('../../../models');
const { ValidationError } = require('../../../shared/errors');
const {
    calculateVirtualOccurrences,
    localDateOf,
} = require('../recurringTaskService');
const {
    planOccurrenceAdvance,
    skipRecurringOccurrence,
} = require('./recurring');
const {
    dateStringToUTC,
    getSafeTimezone,
} = require('../../../utils/timezone-utils');

const SCOPES = ['this', 'following', 'all'];
const DATE_FORMAT = 'YYYY-MM-DD';
const OCCURRENCE_PAGE = 100;
// Far enough for any real plan; it only keeps a typo like year 9999 from
// walking a daily series for millions of steps.
const MAX_YEARS_AHEAD = 50;

const ONE_OFF_FIELDS = [
    'name',
    'note',
    'priority',
    'project_id',
    'area_id',
    'goal_id',
    'estimated_minutes',
    'due_has_time',
    'user_id',
];
const SERIES_FIELDS = [
    ...ONE_OFF_FIELDS,
    'completion_based',
    'recurrence_type',
    'recurrence_interval',
    'recurrence_weekday',
    'recurrence_weekdays',
    'recurrence_month_day',
    'recurrence_week_of_month',
];

const pick = (task, fields) =>
    Object.fromEntries(fields.map((field) => [field, task[field]]));

const requireLocalDate = (value, label) => {
    if (
        typeof value !== 'string' ||
        !moment.utc(value, DATE_FORMAT, true).isValid()
    ) {
        throw new ValidationError(`${label} must be a YYYY-MM-DD date.`);
    }
};

const shiftDateString = (dateString, days) =>
    moment.utc(dateString, DATE_FORMAT).add(days, 'days').format(DATE_FORMAT);

const shiftInstant = (instant, days, timezone) =>
    moment.tz(instant, timezone).add(days, 'days').toDate();

// Places a local date on the calendar; a timed task keeps the time of day of
// its own due date.
const instantOnLocalDate = (dateString, parentDue, timezone, hasTime) => {
    if (!hasTime) return dateStringToUTC(dateString, timezone, 'start');

    const time = moment.utc(parentDue).tz(timezone).format('HH:mm:ss.SSS');
    return moment
        .tz(`${dateString} ${time}`, 'YYYY-MM-DD HH:mm:ss.SSS', timezone)
        .toDate();
};

const daysBetween = (fromDate, toDate) =>
    moment
        .utc(toDate, DATE_FORMAT)
        .diff(moment.utc(fromDate, DATE_FORMAT), 'days');

// A reminder moved with its occurrence keeps its local time of day and its
// distance in days from the due date, across a daylight-saving switch too.
const shiftedReminder = (task, days, timezone) =>
    task.reminder_at
        ? {
              reminder_at: shiftInstant(task.reminder_at, days, timezone),
              reminder_sent_at: null,
          }
        : {};

const shiftWeekday = (weekday, days) => (((weekday + days) % 7) + 7) % 7;

// Returns the recurrence fields that must move with the series so that its
// occurrences land on the new weekday or day of month.
const shiftPattern = (task, deltaDays, anchorDate) => {
    const changes = {};

    switch (task.recurrence_type) {
        case 'weekly':
            if (
                task.recurrence_weekday !== null &&
                task.recurrence_weekday !== undefined
            ) {
                changes.recurrence_weekday = shiftWeekday(
                    task.recurrence_weekday,
                    deltaDays
                );
            }
            if (
                task.recurrence_weekdays &&
                task.recurrence_weekdays.length > 0
            ) {
                changes.recurrence_weekdays = task.recurrence_weekdays.map(
                    (weekday) => shiftWeekday(weekday, deltaDays)
                );
            }
            break;
        case 'monthly':
            changes.recurrence_month_day = Number(anchorDate.slice(8, 10));
            break;
        case 'monthly_weekday':
            if (
                task.recurrence_weekday !== null &&
                task.recurrence_weekday !== undefined
            ) {
                changes.recurrence_weekday = shiftWeekday(
                    task.recurrence_weekday,
                    deltaDays
                );
            }
            break;
        default:
            break;
    }

    return changes;
};

const occurrenceLocalDate = (occurrence, timezone) =>
    typeof occurrence.due_date === 'string'
        ? occurrence.due_date
        : localDateOf(occurrence.due_date, timezone);

// Walks the series page by page from its current due date until it reaches
// or passes the date, so an occurrence months or years ahead is found too.
function isOccurrenceOf(task, occurrenceDate, timezone) {
    const horizon = moment
        .tz(timezone)
        .add(MAX_YEARS_AHEAD, 'years')
        .format(DATE_FORMAT);
    if (occurrenceDate > horizon) return false;

    let startFrom = null;
    let lastSeen = null;
    for (;;) {
        const page = calculateVirtualOccurrences(
            task,
            OCCURRENCE_PAGE,
            startFrom,
            timezone
        );
        for (const occurrence of page) {
            const date = occurrenceLocalDate(occurrence, timezone);
            if (date === occurrenceDate) return true;
            if (date > occurrenceDate) return false;
        }
        const last = page[page.length - 1];
        const lastDate = last && occurrenceLocalDate(last, timezone);
        // The series ended, or stopped moving forward.
        if (!last || (lastSeen && lastDate <= lastSeen)) return false;
        lastSeen = lastDate;
        startFrom = last.due_date;
    }
}

async function shiftWholeSeries(task, deltaDays, timezone) {
    const newDue = shiftInstant(task.due_date, deltaDays, timezone);
    const changes = {
        due_date: newDue,
        ...shiftPattern(task, deltaDays, localDateOf(newDue, timezone)),
        ...shiftedReminder(task, deltaDays, timezone),
        recurrence_exdates: (task.recurrence_exdates || []).map((date) =>
            shiftDateString(date, deltaDays)
        ),
    };
    if (task.recurrence_end_date) {
        changes.recurrence_end_date = shiftInstant(
            task.recurrence_end_date,
            deltaDays,
            timezone
        );
    }

    await sequelize.transaction(async (transaction) => {
        await task.update(changes, { transaction });
    });

    return { task, moved: null };
}

async function splitSeries(
    task,
    { occurrenceDate, dueDate, deltaDays, timezone }
) {
    const exdates = task.recurrence_exdates || [];
    const dayBefore = moment
        .tz(occurrenceDate, DATE_FORMAT, timezone)
        .subtract(1, 'ms')
        .toDate();
    const newDue = instantOnLocalDate(
        dueDate,
        task.due_date,
        timezone,
        task.due_has_time
    );

    return sequelize.transaction(async (transaction) => {
        const moved = await Task.create(
            {
                ...pick(task, SERIES_FIELDS),
                ...shiftPattern(task, deltaDays, dueDate),
                ...shiftedReminder(
                    task,
                    daysBetween(localDateOf(task.due_date, timezone), dueDate),
                    timezone
                ),
                due_date: newDue,
                recurrence_end_date: task.recurrence_end_date,
                recurrence_exdates: exdates
                    .filter((date) => date > occurrenceDate)
                    .map((date) => shiftDateString(date, deltaDays)),
            },
            { transaction }
        );
        const tags = await task.getTags({ transaction });
        if (tags.length > 0) {
            await moved.setTags(tags, { transaction });
        }

        await task.update(
            {
                recurrence_end_date: dayBefore,
                recurrence_exdates: exdates.filter(
                    (date) => date < occurrenceDate
                ),
            },
            { transaction }
        );

        return { task, moved };
    });
}

async function detachOccurrence(task, { occurrenceDate, dueDate, timezone }) {
    const isCurrent = occurrenceDate === localDateOf(task.due_date, timezone);
    const newDue = instantOnLocalDate(
        dueDate,
        task.due_date,
        timezone,
        task.due_has_time
    );

    return sequelize.transaction(async (transaction) => {
        const moved = await Task.create(
            {
                ...pick(task, ONE_OFF_FIELDS),
                ...shiftedReminder(
                    task,
                    daysBetween(localDateOf(task.due_date, timezone), dueDate),
                    timezone
                ),
                recurrence_type: 'none',
                due_date: newDue,
            },
            { transaction }
        );
        const tags = await task.getTags({ transaction });
        if (tags.length > 0) {
            await moved.setTags(tags, { transaction });
        }

        if (isCurrent) {
            const advance = planOccurrenceAdvance(task, { timezone });
            await task.update(
                advance.hasNext
                    ? {
                          status: Task.STATUS.NOT_STARTED,
                          completed_at: null,
                          due_date: advance.nextDueDate,
                          ...advance.reminderFields,
                      }
                    : {
                          status: Task.STATUS.DONE,
                          completed_at: advance.completedAt,
                      },
                { transaction }
            );
        } else {
            const exdates = [
                ...(task.recurrence_exdates || []),
                occurrenceDate,
            ];
            await task.update(
                { recurrence_exdates: [...new Set(exdates)].sort() },
                { transaction }
            );
        }

        return { task, moved };
    });
}

// Checks that occurrenceDate is a day of this series and returns whether it
// is the series' current occurrence.
function requireOccurrence(task, { scope, occurrenceDate, timezone }) {
    if (!task.recurrence_type || task.recurrence_type === 'none') {
        throw new ValidationError(
            'Only recurring tasks have occurrences to move.'
        );
    }
    if (task.recurring_parent_id) {
        throw new ValidationError(
            'Move the occurrence from the series task, not a generated occurrence.'
        );
    }
    if (!SCOPES.includes(scope)) {
        throw new ValidationError('Scope must be this, following or all.');
    }
    requireLocalDate(occurrenceDate, 'Occurrence date');
    if (!task.due_date) {
        throw new ValidationError('This recurring task has no due date.');
    }
    if (!isOccurrenceOf(task, occurrenceDate, timezone)) {
        throw new ValidationError(
            'That date is not an occurrence of this task.'
        );
    }
    return occurrenceDate === localDateOf(task.due_date, timezone);
}

// Moves one occurrence of a recurring series (scope "this"), the occurrence
// and every later one (scope "following"), or the whole series (scope "all").
// Dates are local calendar dates in the user's timezone. With the same day,
// "this" and "following" still split the occurrence off, so an edit can then
// be applied to it alone; "all" writes nothing.
async function moveOccurrence(
    task,
    { scope, occurrenceDate, dueDate, timezone } = {}
) {
    const tz = getSafeTimezone(timezone);
    const isCurrent = requireOccurrence(task, {
        scope,
        occurrenceDate,
        timezone: tz,
    });
    requireLocalDate(dueDate, 'Due date');

    const deltaDays = daysBetween(occurrenceDate, dueDate);

    if (scope === 'all' || (scope === 'following' && isCurrent)) {
        if (deltaDays === 0) return { task, moved: null };
        return shiftWholeSeries(task, deltaDays, tz);
    }
    if (scope === 'following') {
        return splitSeries(task, {
            occurrenceDate,
            dueDate,
            deltaDays,
            timezone: tz,
        });
    }
    return detachOccurrence(task, { occurrenceDate, dueDate, timezone: tz });
}

const RECURRENCE_KEYS = [
    'recurrence_type',
    'recurrence_interval',
    'recurrence_end_date',
    'recurrence_weekday',
    'recurrence_weekdays',
    'recurrence_month_day',
    'recurrence_week_of_month',
    'completion_based',
    'update_parent_recurrence',
];

// What a move of the series may change, so a failed edit can put it back.
const SERIES_STATE = [
    'due_date',
    'status',
    'completed_at',
    'reminder_at',
    'reminder_sent_at',
    'recurrence_end_date',
    'recurrence_exdates',
    'recurrence_weekday',
    'recurrence_weekdays',
    'recurrence_month_day',
];

// Splits an edit of one occurrence into the day the occurrence goes to and
// the PATCH body for the task that ends up holding it: the split-off task
// for "this" and "following", the series itself otherwise.
function planOccurrenceEdit(
    task,
    { scope, occurrenceDate, changes, timezone } = {}
) {
    const tz = getSafeTimezone(timezone);
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
        throw new ValidationError('Changes must be an object.');
    }
    const isCurrent = requireOccurrence(task, {
        scope,
        occurrenceDate,
        timezone: tz,
    });
    if (scope === 'this' && RECURRENCE_KEYS.some((key) => key in changes)) {
        throw new ValidationError(
            'Change the repeat rule on the series, not on one occurrence.'
        );
    }

    const { due_date: dueChange, ...patch } = changes;
    let dueDate = occurrenceDate;
    if (typeof dueChange === 'string' && dueChange !== '') {
        dueDate = dueChange.slice(0, 10);
        requireLocalDate(dueDate, 'Due date');
    } else if (dueChange !== undefined) {
        patch.due_date = dueChange;
    }

    const onSeries = scope === 'all' || (scope === 'following' && isCurrent);
    // The reminder was set for the edited occurrence; the series row holds
    // its current occurrence, which is that many days away.
    if (onSeries && patch.reminder_at) {
        const reminder = new Date(patch.reminder_at);
        if (!Number.isNaN(reminder.getTime())) {
            patch.reminder_at = shiftInstant(
                reminder,
                daysBetween(occurrenceDate, localDateOf(task.due_date, tz)),
                tz
            ).toISOString();
        }
    }

    return {
        dueDate,
        patch,
        onSeries,
        before: pick(task, SERIES_STATE),
    };
}

// Undoes moveOccurrence when the edit that followed it was refused.
async function restoreSeries(task, before, moved) {
    const { destroyTaskRows } = require('./deletion');
    if (moved) await destroyTaskRows(moved);
    await task.update(before);
}

// Removes one occurrence (scope "this": the current one is skipped, a later
// one left out of the series) or the occurrence and every later one (scope
// "following": the series ends the day before). Returns deleteSeries when
// nothing of the series would remain, so the caller deletes the task.
async function deleteOccurrence(
    task,
    { scope, occurrenceDate, timezone, userId } = {}
) {
    const tz = getSafeTimezone(timezone);
    const isCurrent = requireOccurrence(task, {
        scope,
        occurrenceDate,
        timezone: tz,
    });

    if (scope === 'all' || (scope === 'following' && isCurrent)) {
        return { task, deleteSeries: true };
    }

    if (scope === 'following') {
        const exdates = task.recurrence_exdates || [];
        await task.update({
            recurrence_end_date: moment
                .tz(occurrenceDate, DATE_FORMAT, tz)
                .subtract(1, 'ms')
                .toDate(),
            recurrence_exdates: exdates.filter((date) => date < occurrenceDate),
        });
        return { task, deleteSeries: false };
    }

    if (isCurrent) {
        const result = await skipRecurringOccurrence(task, userId, tz);
        // The last occurrence: skipping it leaves no series behind.
        return { task, deleteSeries: Boolean(result.error) };
    }

    const exdates = [...(task.recurrence_exdates || []), occurrenceDate];
    await task.update({ recurrence_exdates: [...new Set(exdates)].sort() });
    return { task, deleteSeries: false };
}

module.exports = {
    moveOccurrence,
    planOccurrenceEdit,
    restoreSeries,
    deleteOccurrence,
    shiftPattern,
};
