'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const moment = require('moment-timezone');
const { getSafeTimezone } = require('../../../utils/timezone-utils');
const { CLOSED_STATUSES } = require('../../projects/nextAction');
const { periodOf, pushFor, shiftHorizons } = require('./core/schedule');

// When a task's dates, week or month change, the open tasks it blocks are
// pushed later so they still follow it (core/schedule.js), and theirs in
// turn. It runs as a model hook, so every write path (REST, sync, MCP,
// imports) pushes the same way. A blocked task is moved even when the
// writer could not edit it: the link was made by someone who could edit
// both.

const SCHEDULE_FIELDS = ['start_date', 'due_date', 'week_of', 'month_of'];

// Links are kept acyclic when made, but two racing requests could still
// close a loop; a chain never revisits a task and never runs longer.
const MAX_CHAIN = 200;

// Per request: the tasks pushed (for the response) and, while a device's
// batch is applied, the moved tasks whose pushes wait for the batch's end.
const pushes = new AsyncLocalStorage();

async function trackPushes(fn) {
    const store = { pushed: [], deferred: null };
    const value = await pushes.run(store, fn);
    return { value, pushed: store.pushed };
}

const isRecurring = (task) =>
    !!task.recurrence_type && task.recurrence_type !== 'none';

const dayOnly = (value) => (value ? String(value).slice(0, 10) : null);

function localPeriod(task, owner) {
    if (CLOSED_STATUSES.includes(task.status) || isRecurring(task)) {
        return null;
    }
    const timezone = getSafeTimezone(owner?.timezone);
    const day = (value) =>
        value ? moment.utc(value).tz(timezone).format('YYYY-MM-DD') : null;
    return periodOf(
        {
            start: day(task.start_date),
            due: day(task.due_date),
            week_of: dayOnly(task.week_of),
            month_of: dayOnly(task.month_of),
        },
        owner?.first_day_of_week ?? 1
    );
}

// Moves a stored instant by whole local days, keeping its time of day.
const shiftInstant = (value, days, timezone) =>
    value ? moment.utc(value).tz(timezone).add(days, 'days').toDate() : value;

function createPusher({ Task, TaskRelation, User }) {
    const ownerOf = async (task, options) => {
        const cache = options.dependencyOwners;
        if (cache?.has(task.user_id)) return cache.get(task.user_id);
        const owner = await User.findByPk(task.user_id, {
            attributes: ['id', 'timezone', 'first_day_of_week'],
            transaction: options.transaction,
        });
        cache?.set(task.user_id, owner);
        return owner;
    };

    // Pushes `succ` after `pred` when it no longer follows it. The update
    // fires the hook again, which carries the push down the chain.
    async function pushAfter(pred, succ, options = {}) {
        const chain = options.dependencyChain || [];
        if (chain.includes(succ.id) || chain.length >= MAX_CHAIN) return;
        const owners = options.dependencyOwners || new Map();
        const scoped = { ...options, dependencyOwners: owners };

        // An earlier push in the same chain may have moved it already
        await succ.reload({ transaction: options.transaction });

        const predOwner = await ownerOf(pred, scoped);
        const before = localPeriod(pred, predOwner);
        if (!before) return;
        const succOwner = await ownerOf(succ, scoped);
        const after = localPeriod(succ, succOwner);
        if (!after) return;

        const firstDayOfWeek = succOwner?.first_day_of_week ?? 1;
        const change = pushFor(before, after, firstDayOfWeek);
        if (!change) return;

        let attrs = {};
        if (change.shiftDays) {
            const timezone = getSafeTimezone(succOwner?.timezone);
            attrs = {
                start_date: shiftInstant(
                    succ.start_date,
                    change.shiftDays,
                    timezone
                ),
                due_date: shiftInstant(
                    succ.due_date,
                    change.shiftDays,
                    timezone
                ),
                ...shiftHorizons(
                    {
                        week_of: dayOnly(succ.week_of),
                        month_of: dayOnly(succ.month_of),
                    },
                    change.shiftDays,
                    firstDayOfWeek
                ),
            };
        }
        if (change.weekOf) attrs.week_of = change.weekOf;
        if (change.monthOf) attrs.month_of = change.monthOf;

        await succ.update(attrs, {
            transaction: options.transaction,
            dependencyChain: [...chain, pred.id],
            dependencyOwners: owners,
        });
        const pushed = pushes.getStore()?.pushed;
        if (pushed && !pushed.some((task) => task.uid === succ.uid)) {
            pushed.push({ uid: succ.uid, name: succ.name });
        }
    }

    async function pushSuccessors(task, options) {
        const links = await TaskRelation.findAll({
            where: { relation_type: 'blocks', source_task_id: task.id },
            attributes: ['target_task_id'],
            transaction: options.transaction,
            raw: true,
        });
        if (links.length === 0) return;
        const successors = await Task.findAll({
            where: { id: links.map((link) => link.target_task_id) },
            order: [['id', 'ASC']],
            transaction: options.transaction,
        });
        for (const succ of successors) {
            await pushAfter(task, succ, options);
        }
    }

    return { pushAfter, pushSuccessors };
}

let pusher = null;

function install(models) {
    pusher = createPusher(models);
    models.Task.addHook('afterUpdate', async (task, options) => {
        if (!SCHEDULE_FIELDS.some((field) => task.changed(field))) return;
        const deferred = pushes.getStore()?.deferred;
        if (deferred) {
            deferred.add(task.id);
            return;
        }
        await pusher.pushSuccessors(task, options);
    });
}

// A device's batch lands whole before anything is pushed: a later op of the
// same batch may already move the blocked task, and must not lose its merge
// to a push stamped after it. The pushes then run outside the device's op,
// so they reach that device too.
async function deferPushes(fn, Task) {
    const store = { pushed: [], deferred: new Set() };
    const value = await pushes.run(store, fn);
    const moved = [...store.deferred];
    store.deferred = null;
    if (pusher && moved.length > 0) {
        await pushes.run(store, async () => {
            const tasks = await Task.findAll({ where: { id: moved } });
            for (const task of tasks) await pusher.pushSuccessors(task, {});
        });
    }
    return value;
}

// For a link just made: pushes the blocked task after its blocker.
const pushAfter = (pred, succ, options) =>
    pusher ? pusher.pushAfter(pred, succ, options) : null;

// The pushed tasks `userId` may read; the others are not named.
async function visiblePushes(pushed, userId) {
    const permissionsService = require('../../../services/permissionsService');
    const visible = [];
    for (const task of pushed) {
        const access = await permissionsService.getAccess(
            userId,
            'task',
            task.uid
        );
        if (access !== permissionsService.ACCESS.NONE) visible.push(task);
    }
    return visible;
}

module.exports = {
    install,
    pushAfter,
    trackPushes,
    deferPushes,
    visiblePushes,
};
