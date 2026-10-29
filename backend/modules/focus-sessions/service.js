'use strict';

const moment = require('moment-timezone');
const { Op } = require('sequelize');
const { FocusSession, Task } = require('../../models');
const { getSafeTimezone } = require('../../utils/timezone-utils');
const { ValidationError, NotFoundError } = require('../../shared/errors');

const MIN_SECONDS = 60;
const MAX_SECONDS = 12 * 60 * 60;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 400;

const serialize = (session) => ({
    uid: session.uid,
    started_at: session.started_at,
    ended_at: session.ended_at,
    duration_seconds: session.duration_seconds,
    task: session.Task
        ? { uid: session.Task.uid, name: session.Task.name }
        : null,
});

const include = [{ model: Task, as: 'Task', attributes: ['uid', 'name'] }];

async function create(user, body = {}) {
    const ended = new Date(body.ended_at || Date.now());
    const seconds = Math.round(Number(body.duration_seconds));
    if (isNaN(ended.getTime())) throw new ValidationError('Invalid end time');
    if (
        !Number.isFinite(seconds) ||
        seconds < MIN_SECONDS ||
        seconds > MAX_SECONDS
    ) {
        throw new ValidationError(
            'Duration must be between 1 minute and 12 hours'
        );
    }
    if (ended.getTime() > Date.now() + 60000) {
        throw new ValidationError('A session cannot end in the future');
    }
    const started = body.started_at
        ? new Date(body.started_at)
        : new Date(ended.getTime() - seconds * 1000);
    if (isNaN(started.getTime()) || started >= ended) {
        throw new ValidationError('Invalid start time');
    }

    let taskId = null;
    if (body.task_uid) {
        const task = await Task.findOne({
            where: { uid: String(body.task_uid), user_id: user.id },
            attributes: ['id'],
        });
        if (!task) throw new NotFoundError('Task not found');
        taskId = task.id;
    }

    const session = await FocusSession.create({
        user_id: user.id,
        task_id: taskId,
        started_at: started,
        ended_at: ended,
        duration_seconds: seconds,
    });
    await session.reload({ include });
    return serialize(session);
}

// Local day range (YYYY-MM-DD, inclusive) as UTC instants.
function rangeOf(start, end, timezone) {
    if (!DAY.test(start || '') || !DAY.test(end || '') || start > end) {
        throw new ValidationError('start and end must be YYYY-MM-DD days');
    }
    const from = moment.tz(start, timezone).startOf('day');
    const to = moment.tz(end, timezone).endOf('day');
    if (to.diff(from, 'days') > MAX_RANGE_DAYS) {
        throw new ValidationError('The range is too long');
    }
    return { from: from.toDate(), to: to.toDate() };
}

async function list(user, { start, end }) {
    const timezone = getSafeTimezone(user.timezone);
    const { from, to } = rangeOf(start, end, timezone);
    const sessions = await FocusSession.findAll({
        where: { user_id: user.id, started_at: { [Op.between]: [from, to] } },
        include,
        order: [['started_at', 'ASC']],
    });
    return sessions.map(serialize);
}

async function remove(user, uid) {
    const deleted = await FocusSession.destroy({
        where: { uid: String(uid), user_id: user.id },
    });
    if (!deleted) throw new NotFoundError('Focus session not found');
}

// Totals for the last `days` days (today included) in the user's timezone:
// minutes per day, minutes per hour of the day, the tasks focused on most.
async function stats(user, daysParam) {
    const days = Math.min(Math.max(parseInt(daysParam, 10) || 30, 1), 365);
    const timezone = getSafeTimezone(user.timezone);
    const today = moment.tz(timezone).startOf('day');
    const first = today.clone().subtract(days - 1, 'days');
    const sessions = await FocusSession.findAll({
        where: {
            user_id: user.id,
            started_at: { [Op.gte]: first.toDate() },
        },
        include,
        order: [['started_at', 'ASC']],
    });

    const byDay = new Map();
    for (let i = 0; i < days; i++) {
        byDay.set(first.clone().add(i, 'days').format('YYYY-MM-DD'), 0);
    }
    const byHour = Array(24).fill(0);
    const byTask = new Map();
    let totalSeconds = 0;

    sessions.forEach((session) => {
        const local = moment(session.started_at).tz(timezone);
        const key = local.format('YYYY-MM-DD');
        if (!byDay.has(key)) return;
        totalSeconds += session.duration_seconds;
        byDay.set(key, byDay.get(key) + session.duration_seconds);
        byHour[local.hour()] += session.duration_seconds;
        if (session.Task) {
            const entry = byTask.get(session.Task.uid) || {
                uid: session.Task.uid,
                name: session.Task.name,
                seconds: 0,
            };
            entry.seconds += session.duration_seconds;
            byTask.set(session.Task.uid, entry);
        }
    });

    const minutes = (seconds) => Math.round(seconds / 60);
    return {
        days,
        total_minutes: minutes(totalSeconds),
        sessions: sessions.length,
        by_day: [...byDay.entries()].map(([date, seconds]) => ({
            date,
            minutes: minutes(seconds),
        })),
        by_hour: byHour.map(minutes),
        top_tasks: [...byTask.values()]
            .sort((a, b) => b.seconds - a.seconds)
            .slice(0, 5)
            .map((t) => ({
                uid: t.uid,
                name: t.name,
                minutes: minutes(t.seconds),
            })),
    };
}

module.exports = { create, list, remove, stats };
