'use strict';

const crypto = require('crypto');
const ICAL = require('ical.js');
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const { Task, User } = require('../../models');
const { getSafeTimezone } = require('../../utils/timezone-utils');

const TOKEN_PREFIX = 'tf_';
// Done, archived and cancelled tasks stay out of the feed.
const HIDDEN_STATUSES = [2, 3, 5];
const PAST_DAYS = 60;
const FUTURE_DAYS = 400;
const DEFAULT_MINUTES = 60;

const hashToken = (token) =>
    crypto.createHash('sha256').update(token).digest('hex');

const feedPath = (token) => `/feeds/tasks/${token}.ics`;

async function status(userId) {
    const user = await User.findByPk(userId, {
        attributes: ['task_feed_token_hash'],
    });
    return { enabled: !!user?.task_feed_token_hash };
}

// A new token replaces the old one, so an address that leaked stops working.
async function rotate(userId) {
    const token = TOKEN_PREFIX + crypto.randomBytes(24).toString('base64url');
    await User.update(
        { task_feed_token_hash: hashToken(token) },
        { where: { id: userId } }
    );
    return { enabled: true, path: feedPath(token) };
}

async function disable(userId) {
    await User.update(
        { task_feed_token_hash: null },
        { where: { id: userId } }
    );
    return { enabled: false };
}

async function findUserByToken(token) {
    if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) {
        return null;
    }
    return User.findOne({
        where: { task_feed_token_hash: hashToken(token) },
        attributes: ['id', 'timezone'],
    });
}

const dateValue = (day) => ICAL.Time.fromDateString(day);
const instantValue = (date) => ICAL.Time.fromJSDate(new Date(date), true);

// Same blocks as the Calendar page: a timed task runs from its start time
// (same day) or its due time for its estimate; a whole-day task spans from
// its start day to its due day.
function addEvent(calendar, task, timezone) {
    const event = new ICAL.Component('vevent');
    event.addPropertyWithValue('uid', `${task.uid}@tududi`);
    event.addPropertyWithValue('dtstamp', instantValue(new Date()));
    event.addPropertyWithValue('summary', task.name);
    if (task.note) {
        event.addPropertyWithValue('description', task.note.slice(0, 2000));
    }
    if (task.updated_at) {
        event.addPropertyWithValue(
            'last-modified',
            instantValue(task.updated_at)
        );
    }

    const localDay = (date) =>
        moment.utc(date).tz(timezone).format('YYYY-MM-DD');

    if (task.due_has_time) {
        const due = new Date(task.due_date);
        const start =
            task.start_date && task.start_has_time
                ? new Date(task.start_date)
                : null;
        if (start && start < due && localDay(start) === localDay(due)) {
            event.addPropertyWithValue('dtstart', instantValue(start));
            event.addPropertyWithValue('dtend', instantValue(due));
        } else {
            const minutes = task.estimated_minutes || DEFAULT_MINUTES;
            event.addPropertyWithValue('dtstart', instantValue(due));
            event.addPropertyWithValue(
                'dtend',
                instantValue(due.getTime() + minutes * 60000)
            );
        }
    } else {
        const dueDay = localDay(task.due_date);
        const startDay = task.start_date ? localDay(task.start_date) : null;
        const first = startDay && startDay < dueDay ? startDay : dueDay;
        const end = moment(dueDay, 'YYYY-MM-DD')
            .add(1, 'day')
            .format('YYYY-MM-DD');
        event.addPropertyWithValue('dtstart', dateValue(first));
        event.addPropertyWithValue('dtend', dateValue(end));
        event.addPropertyWithValue('transp', 'TRANSPARENT');
    }

    calendar.addSubcomponent(event);
}

async function buildFeed(user) {
    const timezone = getSafeTimezone(user.timezone);
    const now = Date.now();
    const tasks = await Task.findAll({
        where: {
            user_id: user.id,
            due_date: {
                [Op.between]: [
                    new Date(now - PAST_DAYS * 86400000),
                    new Date(now + FUTURE_DAYS * 86400000),
                ],
            },
            status: { [Op.notIn]: HIDDEN_STATUSES },
        },
        order: [['due_date', 'ASC']],
    });

    const calendar = new ICAL.Component('vcalendar');
    calendar.addPropertyWithValue('version', '2.0');
    calendar.addPropertyWithValue('prodid', '-//Tududi//Task feed//EN');
    calendar.addPropertyWithValue('calscale', 'GREGORIAN');
    calendar.addPropertyWithValue('x-wr-calname', 'tududi');
    calendar.addPropertyWithValue('x-wr-timezone', timezone);
    tasks.forEach((task) => addEvent(calendar, task, timezone));
    return calendar.toString();
}

module.exports = {
    TOKEN_PREFIX,
    hashToken,
    status,
    rotate,
    disable,
    findUserByToken,
    buildFeed,
};
