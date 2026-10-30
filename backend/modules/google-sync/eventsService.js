'use strict';

const moment = require('moment-timezone');
const { Op } = require('sequelize');
const { GoogleAccount, GoogleCalendar, GoogleEvent } = require('../../models');
const { ValidationError, NotFoundError } = require('../../shared/errors');
const { getSafeTimezone } = require('../../utils/timezone-utils');
const { GoogleClient } = require('./client');
const { storeEvent } = require('./calendarsSync');

const WRITABLE_ROLES = ['owner', 'writer'];
const FEED_PREFIX = 'google-';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isWritable = (calendar) => WRITABLE_ROLES.includes(calendar.access_role);

// Minutes on the user's clock (same rule as calendar-feeds/icsEvents.js).
function wallMinute(at, dayStart, dayEnd) {
    if (!at.isAfter(dayStart)) return 0;
    if (!at.isBefore(dayEnd)) return 24 * 60;
    const local = at.clone().tz(dayStart.tz());
    return local.hours() * 60 + local.minutes();
}

function eachDay(startDate, endDate) {
    const days = [];
    for (
        const day = moment.utc(startDate, 'YYYY-MM-DD');
        day.format('YYYY-MM-DD') <= endDate;
        day.add(1, 'day')
    ) {
        days.push(day.format('YYYY-MM-DD'));
    }
    return days;
}

function base(row, calendar) {
    return {
        uid: row.event_id,
        title: row.summary || '',
        busy: row.busy,
        feed_uid: `${FEED_PREFIX}${calendar.uid}`,
        feed_name: calendar.summary,
        color: calendar.color,
        source: 'google',
        calendar_uid: calendar.uid,
        event_id: row.event_id,
        editable: isWritable(calendar),
        location: row.location,
        description: row.description,
        html_link: row.html_link,
        recurring: Boolean(row.recurring_event_id),
    };
}

// One entry per day the event touches, shaped like the iCal feed events.
function occurrences(row, calendar, days, timezone) {
    const out = [];
    for (const date of days) {
        if (row.all_day) {
            if (row.start_date <= date && date < row.end_date) {
                out.push({
                    ...base(row, calendar),
                    date,
                    all_day: true,
                    start: row.start_date,
                    end: row.end_date,
                    start_minute: null,
                    end_minute: null,
                });
            }
            continue;
        }
        const startAt = moment(row.start_at).tz(timezone);
        const endAt = moment(row.end_at || row.start_at).tz(timezone);
        const dayStart = moment.tz(date, 'YYYY-MM-DD', timezone);
        const dayEnd = dayStart.clone().add(1, 'day');
        const touches =
            startAt.isBefore(dayEnd) &&
            (endAt.isAfter(dayStart) ||
                (endAt.isSame(startAt) && !startAt.isBefore(dayStart)));
        if (!touches) continue;
        out.push({
            ...base(row, calendar),
            date,
            all_day: false,
            start: startAt.toISOString(),
            end: endAt.toISOString(),
            start_minute: wallMinute(
                moment.max(startAt, dayStart),
                dayStart,
                dayEnd
            ),
            end_minute: wallMinute(moment.min(endAt, dayEnd), dayStart, dayEnd),
        });
    }
    return out;
}

// Events of the user's Google calendars (not the Tududi one: those are the
// user's own tasks, already drawn as tasks) between two local days.
async function eventsBetween(
    user,
    startDate,
    endDate,
    { shownOnly = false } = {}
) {
    const timezone = getSafeTimezone(user.timezone);
    const account = await GoogleAccount.findOne({
        where: { user_id: user.id },
        attributes: ['sync_events'],
    });
    // Calendar sync switched off: its copies are stale, show none.
    if (!account?.sync_events) return [];
    const where = { user_id: user.id, is_tududi: false };
    if (shownOnly) where.show_on_calendar = true;
    const calendars = await GoogleCalendar.findAll({ where });
    if (!calendars.length) return [];
    const byId = new Map(calendars.map((calendar) => [calendar.id, calendar]));

    const rangeStart = moment.tz(startDate, 'YYYY-MM-DD', timezone).toDate();
    const rangeEnd = moment
        .tz(endDate, 'YYYY-MM-DD', timezone)
        .add(1, 'day')
        .toDate();
    const afterEnd = moment
        .utc(endDate, 'YYYY-MM-DD')
        .add(1, 'day')
        .format('YYYY-MM-DD');
    const rows = await GoogleEvent.findAll({
        where: {
            user_id: user.id,
            google_calendar_id: { [Op.in]: [...byId.keys()] },
            [Op.or]: [
                {
                    all_day: true,
                    start_date: { [Op.lt]: afterEnd },
                    end_date: { [Op.gt]: startDate },
                },
                {
                    all_day: false,
                    start_at: { [Op.lt]: rangeEnd },
                    end_at: { [Op.gte]: rangeStart },
                },
            ],
        },
    });
    const days = eachDay(startDate, endDate);
    return rows.flatMap((row) =>
        occurrences(row, byId.get(row.google_calendar_id), days, timezone)
    );
}

async function clientFor(userId) {
    const account = await GoogleAccount.findOne({ where: { user_id: userId } });
    if (!account) throw new ValidationError('Connect Google first');
    return new GoogleClient(account);
}

async function writableCalendar(userId, calendarUid) {
    const calendar = await GoogleCalendar.findOne({
        where: { user_id: userId, uid: calendarUid },
    });
    if (!calendar) throw new NotFoundError('Calendar not found');
    if (calendar.is_tududi) {
        throw new ValidationError(
            'The Cadence calendar holds your tasks: change the task instead'
        );
    }
    if (!isWritable(calendar)) {
        throw new ValidationError('This calendar is read-only');
    }
    return calendar;
}

// Google body from the API input. Timed: start/end instants. All-day:
// start_date and the exclusive end_date.
function eventBody(input, timezone, partial = false) {
    const body = {};
    if (input.title !== undefined)
        body.summary = String(input.title).slice(0, 1000);
    if (input.description !== undefined)
        body.description = input.description || '';
    if (input.location !== undefined) body.location = input.location || '';

    const hasTimes =
        input.start !== undefined ||
        input.end !== undefined ||
        input.start_date !== undefined ||
        input.all_day !== undefined;
    if (!hasTimes) {
        if (!partial) throw new ValidationError('Give the event a start');
        return body;
    }
    if (input.all_day) {
        if (!DAY.test(input.start_date || '')) {
            throw new ValidationError('start_date must be a YYYY-MM-DD date');
        }
        const end = DAY.test(input.end_date || '')
            ? input.end_date
            : moment.utc(input.start_date).add(1, 'day').format('YYYY-MM-DD');
        if (end <= input.start_date) {
            throw new ValidationError('end_date must be after start_date');
        }
        body.start = { date: input.start_date, dateTime: null };
        body.end = { date: end, dateTime: null };
        return body;
    }
    const start = new Date(input.start);
    const end = new Date(input.end || input.start);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new ValidationError('start and end must be date-times');
    }
    if (end < start) throw new ValidationError('end must not be before start');
    body.start = {
        dateTime: start.toISOString(),
        timeZone: timezone,
        date: null,
    };
    body.end = { dateTime: end.toISOString(), timeZone: timezone, date: null };
    return body;
}

function serialize(row, calendar) {
    return {
        calendar_uid: calendar.uid,
        event_id: row.event_id,
        title: row.summary || '',
        description: row.description,
        location: row.location,
        all_day: row.all_day,
        start: row.all_day ? row.start_date : row.start_at,
        end: row.all_day ? row.end_date : row.end_at,
        html_link: row.html_link,
        recurring: Boolean(row.recurring_event_id),
    };
}

async function createEvent(user, input = {}) {
    const calendar = await writableCalendar(user.id, input.calendar_uid);
    const timezone = getSafeTimezone(user.timezone);
    const body = eventBody(input, timezone);
    if (!body.summary) body.summary = '';
    const client = await clientFor(user.id);
    const saved = await client.insertEvent(calendar.google_id, body);
    const row = await storeEvent(user.id, calendar, saved);
    return serialize(row, calendar);
}

// A recurring event's instance is changed alone (Google keeps it as an
// exception to the series).
async function updateEvent(user, calendarUid, eventId, input = {}) {
    const calendar = await writableCalendar(user.id, calendarUid);
    const timezone = getSafeTimezone(user.timezone);
    const body = eventBody(input, timezone, true);
    const client = await clientFor(user.id);
    const saved = await client.patchEvent(calendar.google_id, eventId, body);
    const row = await storeEvent(user.id, calendar, saved);
    return serialize(row, calendar);
}

async function deleteEvent(user, calendarUid, eventId) {
    const calendar = await writableCalendar(user.id, calendarUid);
    const client = await clientFor(user.id);
    await client.deleteEvent(calendar.google_id, eventId);
    await GoogleEvent.destroy({
        where: { google_calendar_id: calendar.id, event_id: eventId },
    });
}

module.exports = {
    eventsBetween,
    createEvent,
    updateEvent,
    deleteEvent,
    isWritable,
    FEED_PREFIX,
};
