'use strict';

// Reads what the triage rules need and maps it to their input shape (see
// tests/unit/modules/triage-rules/fixtures.js): every open task the user can
// see, the recently closed ones, the calendar and the focus blocks. Reads
// only: nothing here writes a task or an event.
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const { Task } = require('../../models');
const permissionsService = require('../../services/permissionsService');
const calendarFeedsService = require('../calendar-feeds/service');
const reviewService = require('../review/service');
const dailyPlanRepository = require('../daily-plan/repository');
const dailyPlanService = require('../daily-plan/service');
const slots = require('../daily-plan/slots');
const repository = require('./repository');
const contexts = require('./contexts');
const { addDays } = require('./core/rules/dates');
const {
    getSafeTimezone,
    getDayBoundsInUTC,
    utcToUserDateString,
} = require('../../utils/timezone-utils');

const CLOSED_LIMIT = 200;

// Every day from `from` to `to`, both included.
function daysBetween(from, to) {
    const days = [];
    for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
    return days;
}

// The planner's visibility: own tasks and shared ones, minus the work that
// is assigned to someone else.
async function visibleWhere(userId) {
    return {
        [Op.and]: [
            await permissionsService.ownershipOrPermissionWhere('task', userId),
            await permissionsService.myWorkWhere(userId),
        ],
    };
}

const isRecurring = (task) =>
    Boolean(task.recurring_parent_id) ||
    (Boolean(task.recurrence_type) && task.recurrence_type !== 'none');

// A task as the rules read it.
function mapTask(task, { timezone, userId }) {
    return {
        uid: task.uid,
        name: task.name || '',
        owned: task.user_id === userId,
        note: task.note ?? null,
        status: Task.getStatusName(task.status),
        due_date: task.due_date
            ? utcToUserDateString(task.due_date, timezone)
            : null,
        parent_uid: task.ParentTask?.uid ?? null,
        project_name: task.Project?.name ?? null,
        tags: (task.Tags || []).map((tag) => tag.name),
        recurring: isRecurring(task),
        // The recurring parent's uid; a series master is its own series.
        series_uid:
            task.RecurringParent?.uid ?? (isRecurring(task) ? task.uid : null),
        file_backed: Boolean(task.source_key),
    };
}

// A calendar occurrence as the rules read it. The ref and series_ref formats
// are fixed by docs/40-triage.md ("Event refs"): linked contexts point at them.
function mapEvent(event) {
    return {
        ref: `event:${event.feed_uid}:${event.uid}:${event.start}`,
        series_ref: event.series_id
            ? `series:${event.feed_uid}:${event.series_id}`
            : null,
        feed_uid: event.feed_uid,
        title: event.title,
        date: event.date,
        all_day: Boolean(event.all_day),
        start_minute: event.start_minute ?? null,
        end_minute: event.end_minute ?? null,
        busy: Boolean(event.busy),
        calendar: event.feed_name ?? null,
    };
}

async function readOpenTasks(user, timezone) {
    const tasks = await repository.findOpenTasks(await visibleWhere(user.id));
    return tasks.map((task) => mapTask(task, { timezone, userId: user.id }));
}

async function readClosedTasks(user, { today, timezone, days }) {
    const since = getDayBoundsInUTC(addDays(today, -days), timezone).start;
    const tasks = await repository.findClosedTasks(
        await visibleWhere(user.id),
        since
    );
    return tasks.slice(0, CLOSED_LIMIT).map((task) => ({
        uid: task.uid,
        name: task.name || '',
        note: task.note ?? null,
        completed_at: new Date(task.completed_at).toISOString(),
        due_date: task.due_date
            ? utcToUserDateString(task.due_date, timezone)
            : null,
        parent_uid: task.ParentTask?.uid ?? null,
        project_name: task.Project?.name ?? null,
        recurring: isRecurring(task),
        series_uid:
            task.RecurringParent?.uid ?? (isRecurring(task) ? task.uid : null),
    }));
}

// { [date]: [{ start, end, label }] } of the focus blocks each day really has.
async function readFocusByDate(user, dates) {
    const settings = await dailyPlanRepository.findUiSettings(user.id);
    const { blocks, allExceptions } = dailyPlanService.readFocus(
        settings,
        user
    );
    return Object.fromEntries(
        dates.map((date) => [
            date,
            slots.focusBlocksOn(blocks, allExceptions, date).map((block) => ({
                start: block.start,
                end: block.end,
                label: block.label ?? '',
            })),
        ])
    );
}

// { [task uid]: { recent_count, last_planned_for } } for every pushed task.
async function readPostponements(user, timezone, today) {
    const pushed = await reviewService.computePushed(user, timezone, today, {
        all: true,
    });
    return Object.fromEntries(
        pushed.map(({ task, push }) => [
            task.uid,
            {
                recent_count: push.recent_count,
                last_planned_for: push.last_planned_for,
            },
        ])
    );
}

// A calendar that fails to load gives no events: its conflicts wait for the
// next read.
async function readEvents(user, settings, { today, lastDay }) {
    const feedUids = settings.calendarFeedUids;
    if (feedUids.length === 0) return [];
    const { events } = await calendarFeedsService.eventsInRange(
        user,
        today,
        lastDay,
        feedUids
    );
    return events.map(mapEvent);
}

// The input of the rules for the user's local day `today` (YYYY-MM-DD,
// default: today in their timezone), built at the instant `now`.
async function collectInput(user, settings, { today, now = new Date() } = {}) {
    const timezone = getSafeTimezone(user.timezone);
    const day = today ?? moment.tz(now, timezone).format('YYYY-MM-DD');
    const lastDay = addDays(day, settings.calendarLookaheadDays);

    const [
        tasks,
        closedTasks,
        focusBlocksByDate,
        postponements,
        events,
        liveContexts,
    ] = await Promise.all([
        readOpenTasks(user, timezone),
        readClosedTasks(user, {
            today: day,
            timezone,
            days: settings.thresholds.closedLookbackDays,
        }),
        readFocusByDate(user, daysBetween(day, lastDay)),
        readPostponements(user, timezone, day),
        readEvents(user, settings, { today: day, lastDay }),
        contexts.liveContexts(user, {
            now,
            timezone,
            today: day,
            lookaheadDays: settings.calendarLookaheadDays,
        }),
    ]);

    return {
        today: day,
        timezone,
        now: new Date(now).toISOString(),
        tasks,
        closedTasks,
        events,
        focusBlocksByDate,
        postponements,
        contexts: liveContexts,
    };
}

module.exports = { collectInput, mapTask, mapEvent, daysBetween };
