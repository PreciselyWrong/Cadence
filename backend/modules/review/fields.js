'use strict';

// The decision fields a task PATCH accepts besides its own columns:
//   in_view: boolean        → in_view_at (kept when already in view)
//   week_of: date | 'this_week' | 'next_week' | null → first day of that week
//   review_on: YYYY-MM-DD | null
//   reviewed: true          → reviewed_at = now
//   later: boolean          → adds or removes the user's #someday tag; true
//                             also takes the task out of view, the week
//                             and today's plan
// None of them touches due_date, so nothing here reaches Google or makes a
// task overdue.
const moment = require('moment-timezone');
const { ValidationError } = require('../../shared/errors');
const { getSafeTimezone } = require('../../utils/timezone-utils');
const repository = require('./repository');

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const isDay = (value) =>
    typeof value === 'string' &&
    DAY_RE.test(value) &&
    moment.utc(value, 'YYYY-MM-DD', true).isValid();

const asBoolean = (value, name) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw new ValidationError(`${name} must be true or false`);
};

function weekStart(day, firstDayOfWeek) {
    const m = moment.utc(day, 'YYYY-MM-DD');
    const back = (m.day() - firstDayOfWeek + 7) % 7;
    return m.subtract(back, 'days').format('YYYY-MM-DD');
}

function parseWeekOf(value, user) {
    if (value === null || value === '') return null;
    const timezone = getSafeTimezone(user.timezone);
    const first = user.first_day_of_week ?? 1;
    const today = moment.tz(timezone).format('YYYY-MM-DD');
    if (value === 'this_week') return weekStart(today, first);
    if (value === 'next_week') {
        return moment
            .utc(weekStart(today, first), 'YYYY-MM-DD')
            .add(7, 'days')
            .format('YYYY-MM-DD');
    }
    if (!isDay(value)) {
        throw new ValidationError(
            'week_of must be a date (YYYY-MM-DD), this_week, next_week or null'
        );
    }
    return weekStart(value, first);
}

// Adds the column changes to `attrs`. Throws ValidationError on bad input.
function applyDecisionFields(attrs, body, task, user) {
    if (body.in_view !== undefined) {
        const inView = asBoolean(body.in_view, 'in_view');
        if (!inView) attrs.in_view_at = null;
        else if (!task.in_view_at) attrs.in_view_at = new Date();
    }
    if (body.week_of !== undefined) {
        attrs.week_of = parseWeekOf(body.week_of, user);
    }
    if (body.review_on !== undefined) {
        if (body.review_on !== null && body.review_on !== '') {
            if (!isDay(body.review_on)) {
                throw new ValidationError(
                    'review_on must be a date (YYYY-MM-DD) or null'
                );
            }
            attrs.review_on = body.review_on;
        } else {
            attrs.review_on = null;
        }
    }
    if (body.reviewed !== undefined && asBoolean(body.reviewed, 'reviewed')) {
        attrs.reviewed_at = new Date();
    }
    // Parking wins over anything sent with it.
    if (body.later !== undefined && asBoolean(body.later, 'later')) {
        attrs.in_view_at = null;
        attrs.week_of = null;
    }
}

// Applies `later` to the task's tags after the update. The tag is the
// user's own #someday system tag, created if they have none yet. Returns
// true when the task should also leave today's plan.
async function applyLater(task, body, userId) {
    if (body.later === undefined || Array.isArray(body.tags || body.Tags)) {
        return false;
    }
    const later = asBoolean(body.later, 'later');
    if (later) {
        const tag = await repository.createSomedayTag(userId);
        await task.addTag(tag);
        return true;
    }
    const tag = await repository.findSomedayTag(userId);
    if (tag) await task.removeTag(tag);
    return false;
}

module.exports = { applyDecisionFields, applyLater, parseWeekOf, weekStart };
