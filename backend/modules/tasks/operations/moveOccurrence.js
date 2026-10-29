'use strict';

const moment = require('moment-timezone');
const { Task, sequelize } = require('../../../models');
const { ValidationError } = require('../../../shared/errors');
const {
    calculateVirtualOccurrences,
    localDateOf,
} = require('../recurringTaskService');
const { planOccurrenceAdvance } = require('./recurring');
const {
    dateStringToUTC,
    getSafeTimezone,
} = require('../../../utils/timezone-utils');

const SCOPES = ['this', 'following', 'all'];
const DATE_FORMAT = 'YYYY-MM-DD';
const MAX_OCCURRENCE_SEARCH = 400;

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

async function shiftWholeSeries(task, deltaDays, timezone) {
    const newDue = shiftInstant(task.due_date, deltaDays, timezone);
    const changes = {
        due_date: newDue,
        ...shiftPattern(task, deltaDays, localDateOf(newDue, timezone)),
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

// Moves one occurrence of a recurring series (scope "this"), the occurrence
// and every later one (scope "following"), or the whole series (scope "all").
// Dates are local calendar dates in the user's timezone.
async function moveOccurrence(
    task,
    { scope, occurrenceDate, dueDate, timezone } = {}
) {
    const tz = getSafeTimezone(timezone);

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
    requireLocalDate(dueDate, 'Due date');
    if (!task.due_date) {
        throw new ValidationError('This recurring task has no due date.');
    }

    const isOccurrence = calculateVirtualOccurrences(
        task,
        MAX_OCCURRENCE_SEARCH,
        null,
        tz
    ).some(
        (occurrence) => occurrenceLocalDate(occurrence, tz) === occurrenceDate
    );
    if (!isOccurrence) {
        throw new ValidationError(
            'That date is not an occurrence of this task.'
        );
    }

    const deltaDays = moment
        .utc(dueDate, DATE_FORMAT)
        .diff(moment.utc(occurrenceDate, DATE_FORMAT), 'days');
    const isCurrent = occurrenceDate === localDateOf(task.due_date, tz);

    if (scope === 'all' || (scope === 'following' && isCurrent)) {
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

module.exports = {
    moveOccurrence,
    shiftPattern,
};
