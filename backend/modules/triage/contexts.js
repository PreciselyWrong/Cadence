'use strict';

// Linked contexts: what the user said about a task, an event or a recurring
// series ("the room is shared, this is not a conflict"). While a context is
// alive, the question about its target is not asked again (rules/contexts.js).
// Lifetimes are applied on read by liveContexts and on purge (purgeContexts)
// (docs/39-daily-brief.md, Memory).
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const { LinkedContext, Task } = require('../../../models');
const { NotFoundError, ValidationError } = require('../../../shared/errors');
const permissionsService = require('../../../services/permissionsService');
const { logger } = require('../../../services/logService');
const { getSafeTimezone } = require('../../../utils/timezone-utils');
const calendarFeedsService = require('../../calendar-feeds/service');
const dailyPlanRepository = require('../repository');
const briefRepository = require('./repository');
const { addDays } = require('./rules/dates');
const { normalizeBriefSettings } = require('./settings');

const SCOPES = ['task', 'event', 'series'];
const TEXT_MAX = 500;
const TARGET_MAX = 255;
const LIST_MAX = 200;
// A calendar series stays alive while it has an occurrence this far back.
const SERIES_LOOKBACK_DAYS = 30;
const CLOSED_STATUSES = [
    Task.STATUS.DONE,
    Task.STATUS.ARCHIVED,
    Task.STATUS.CANCELLED,
];
const EVENT_REF =
    /^event:[^:]+:.+:(\d{4}-\d{2}-\d{2})(T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const SERIES_REF = /^series:[^:]+:.+$/;

const contextToEngine = (row) => ({
    uid: row.uid,
    scope: row.scope,
    target_ref: row.target_ref,
    text: row.text,
});

function contextText(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ValidationError('text is required');
    }
    const trimmed = value.trim();
    if (trimmed.length > TEXT_MAX) {
        throw new ValidationError(`text is at most ${TEXT_MAX} characters`);
    }
    return trimmed;
}

// The answer to a question: "yes" and "no" become the words the user will
// read back; anything else is the user's own text.
function answerText(answer) {
    if (answer === 'yes') return 'Oui';
    if (answer === 'no') return 'Non';
    return contextText(answer);
}

function scopeOf(value) {
    if (!SCOPES.includes(value)) {
        throw new ValidationError(`scope is one of ${SCOPES.join(', ')}`);
    }
    return value;
}

function targetRef(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ValidationError('target_ref is required');
    }
    if (value.length > TARGET_MAX) {
        throw new ValidationError('target_ref is too long');
    }
    return value;
}

// `series:` refs name a calendar series; any other series ref is the uid of a
// recurring task of the user.
const isCalendarSeriesRef = (ref) => ref.startsWith('series:');
const isRecurringTask = (task) =>
    Boolean(task.recurrence_type) && task.recurrence_type !== 'none';

async function visibleTasksWhere(userId, extra) {
    const visible = await permissionsService.ownershipOrPermissionWhere(
        'task',
        userId
    );
    return { [Op.and]: [visible, extra] };
}

async function findVisibleTask(user, uid) {
    return Task.findOne({
        where: await visibleTasksWhere(user.id, { uid }),
        attributes: ['uid', 'status', 'recurrence_type'],
    });
}

// A context may only point at what the user can see right now.
async function checkTarget(user, scope, ref) {
    if (scope === 'event') {
        if (!EVENT_REF.test(ref)) {
            throw new ValidationError('target_ref is not an event ref');
        }
        return;
    }
    if (scope === 'series' && isCalendarSeriesRef(ref)) {
        if (!SERIES_REF.test(ref)) {
            throw new ValidationError('target_ref is not a series ref');
        }
        return;
    }
    const task = await findVisibleTask(user, ref);
    if (!task)
        throw new ValidationError('target_ref is not a task you can see');
    if (scope === 'series' && !isRecurringTask(task)) {
        throw new ValidationError('target_ref is not a recurring task');
    }
}

// Creates the context of a target, or replaces the text of the one already
// there: one context per user, scope and target.
async function createContext(user, input) {
    const scope = scopeOf(input.scope);
    const ref = targetRef(input.target_ref);
    await checkTarget(user, scope, ref);
    const text = contextText(input.text);
    const existing = await LinkedContext.findOne({
        where: { user_id: user.id, scope, target_ref: ref },
    });
    if (existing) {
        await existing.update({ text });
        return contextToEngine(existing);
    }
    const row = await LinkedContext.create({
        user_id: user.id,
        scope,
        target_ref: ref,
        text,
    });
    return contextToEngine(row);
}

async function updateContext(user, uid, input) {
    const row = await LinkedContext.findOne({
        where: { uid, user_id: user.id },
    });
    if (!row) throw new NotFoundError('Context not found');
    await row.update({ text: contextText(input.text) });
    return contextToEngine(row);
}

async function deleteContext(user, uid) {
    const deleted = await LinkedContext.destroy({
        where: { uid, user_id: user.id },
    });
    if (deleted === 0) throw new NotFoundError('Context not found');
}

async function listContexts(user, { scope, target_ref: ref } = {}) {
    const where = { user_id: user.id };
    if (scope !== undefined) where.scope = scopeOf(scope);
    if (ref !== undefined) where.target_ref = targetRef(ref);
    const rows = await LinkedContext.findAll({
        where,
        order: [['id', 'ASC']],
        limit: LIST_MAX,
    });
    return rows.map(contextToEngine);
}

// True once the event's local day is over. Event refs are
// `event:<feed>:<event uid>:<start>`; the uid may hold colons, so the start is
// matched from the end. The end time is not in the ref: a timed event lives
// until the end of its local day.
function eventOver(ref, now, timezone) {
    const match = EVENT_REF.exec(ref);
    if (!match) return true;
    const [, date, time] = match;
    const localDay = time
        ? moment.tz(moment.utc(`${date}${time}`), timezone).format('YYYY-MM-DD')
        : date;
    const nextDayStart = moment
        .tz(localDay, 'YYYY-MM-DD', timezone)
        .add(1, 'day');
    return now.getTime() >= nextDayStart.valueOf();
}

// The feed uid of a `series:<feed>:<series id>` ref.
const feedOfSeriesRef = (ref) => ref.split(':')[1];

// Uids of the rows whose lifetime is over. Calendar series are checked by
// reading their calendar: a series is over only when that calendar was read
// without error and has no occurrence in the lookback and lookahead window.
async function deadUids(user, rows, { now, timezone, today, lookaheadDays }) {
    const dead = new Set();
    const taskRefs = rows
        .filter(
            (row) =>
                row.scope === 'task' ||
                (row.scope === 'series' && !isCalendarSeriesRef(row.target_ref))
        )
        .map((row) => row.target_ref);
    const tasks = new Map();
    if (taskRefs.length > 0) {
        const found = await Task.findAll({
            where: await visibleTasksWhere(user.id, {
                uid: { [Op.in]: taskRefs },
            }),
            attributes: ['uid', 'status', 'recurrence_type'],
        });
        for (const task of found) tasks.set(task.uid, task);
    }

    const bySeriesFeed = new Map();
    for (const row of rows) {
        if (row.scope === 'event') {
            if (eventOver(row.target_ref, now, timezone)) dead.add(row.uid);
        } else if (row.scope === 'task') {
            const task = tasks.get(row.target_ref);
            if (!task || CLOSED_STATUSES.includes(task.status)) {
                dead.add(row.uid);
            }
        } else if (!isCalendarSeriesRef(row.target_ref)) {
            const task = tasks.get(row.target_ref);
            if (!task || !isRecurringTask(task)) dead.add(row.uid);
        } else {
            const feed = feedOfSeriesRef(row.target_ref);
            if (!bySeriesFeed.has(feed)) bySeriesFeed.set(feed, []);
            bySeriesFeed.get(feed).push(row);
        }
    }

    const from = addDays(today, -SERIES_LOOKBACK_DAYS);
    const to = addDays(today, lookaheadDays);
    for (const [feed, seriesRows] of bySeriesFeed) {
        const { events, errors } = await calendarFeedsService.eventsForBrief(
            user,
            from,
            to,
            [feed]
        );
        if (errors.length > 0) continue;
        const present = new Set(
            events
                .filter((event) => event.series_id)
                .map((event) => `series:${event.feed_uid}:${event.series_id}`)
        );
        for (const row of seriesRows) {
            if (!present.has(row.target_ref)) dead.add(row.uid);
        }
    }
    return dead;
}

// The contexts still alive for the user on `today`, and the uids of those
// whose lifetime is over.
async function evaluateContexts(user, options) {
    const rows = await LinkedContext.findAll({
        where: { user_id: user.id },
        order: [['id', 'ASC']],
    });
    const dead = await deadUids(user, rows, options);
    return {
        live: rows.filter((row) => !dead.has(row.uid)).map(contextToEngine),
        dead: [...dead],
    };
}

// The engine's view (rules/contexts.js): only the contexts still alive.
async function liveContexts(user, options) {
    return (await evaluateContexts(user, options)).live;
}

// Daily purge: deletes the contexts whose lifetime is over, for every user.
// One user's failure is logged without content and does not stop the others.
async function purgeContexts(now = new Date()) {
    const users = await briefRepository.findAllUsersForBriefJob();
    let deleted = 0;
    for (const user of users) {
        try {
            const count = await LinkedContext.count({
                where: { user_id: user.id },
            });
            if (count === 0) continue;
            const timezone = getSafeTimezone(user.timezone);
            const settings = normalizeBriefSettings(
                (await dailyPlanRepository.findUiSettings(user.id)).brief
            );
            const { dead } = await evaluateContexts(user, {
                now,
                timezone,
                today: moment.tz(now, timezone).format('YYYY-MM-DD'),
                lookaheadDays: settings.calendarLookaheadDays,
            });
            if (dead.length > 0) {
                deleted += await LinkedContext.destroy({
                    where: { user_id: user.id, uid: { [Op.in]: dead } },
                });
            }
        } catch (error) {
            logger.error(
                { code: error.code || error.name, userId: user.id },
                'Daily brief context purge failed for a user'
            );
        }
    }
    return { deleted };
}

module.exports = {
    SCOPES,
    answerText,
    createContext,
    updateContext,
    deleteContext,
    listContexts,
    liveContexts,
    purgeContexts,
    contextToEngine,
};
