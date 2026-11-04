'use strict';

// Reads what the brief needs and maps it to the input shape buildBrief expects
// (see tests/unit/modules/daily-plan-brief-rules/fixtures.js). Reads only:
// nothing here writes a task, an event or a mail.
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const { Task } = require('../../../models');
const permissionsService = require('../../../services/permissionsService');
const calendarFeedsService = require('../../calendar-feeds/service');
const reviewService = require('../../review/service');
const dailyPlanRepository = require('../repository');
const dailyPlanService = require('../service');
const slots = require('../slots');
const briefRepository = require('./repository');
const decisions = require('./decisions');
const contexts = require('./contexts');
const { addDays } = require('./rules/dates');
const {
    getSafeTimezone,
    getDayBoundsInUTC,
    utcToUserDateString,
} = require('../../../utils/timezone-utils');
const { mailAgentConfigured } = require('./sources');

const MONEY_PATTERN =
    /(€|chf|\$|factur|paie|payer|pay|invoice|bill|loyer|rent|impôt|tax)/i;
const INBOX_READ_LIMIT = 50;
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

// A task as the rules read it. `planned` are the plan days of this task in the
// horizon, `blocks` the uids of its blocking links on each side.
function mapTask(task, { planned, blocks, timezone }) {
    const tagNames = (task.Tags || []).map((tag) => tag.name);
    const name = task.name || '';
    return {
        uid: task.uid,
        name,
        note: task.note ?? null,
        status: Task.getStatusName(task.status),
        due_date: task.due_date
            ? utcToUserDateString(task.due_date, timezone)
            : null,
        estimated_minutes: task.estimated_minutes ?? null,
        priority: task.priority ?? 0,
        parent_uid: task.ParentTask?.uid ?? null,
        project_name: task.Project?.name ?? null,
        tags: tagNames,
        recurring: isRecurring(task),
        // The recurring parent's uid; a series master is its own series.
        series_uid:
            task.RecurringParent?.uid ?? (isRecurring(task) ? task.uid : null),
        planned_on: planned,
        blocks_uids: blocks.blocks,
        blocked_by_uids: blocks.blockedBy,
        money:
            MONEY_PATTERN.test(name) ||
            tagNames.some((tag) => MONEY_PATTERN.test(tag)),
    };
}

// { taskId: { blocks: [uid], blockedBy: [uid] } } for the given task ids.
// "blocks" is stored as source blocks target.
function blocksByTask(links, taskIds) {
    const result = new Map(
        taskIds.map((id) => [id, { blocks: [], blockedBy: [] }])
    );
    for (const link of links) {
        const source = link.SourceTask;
        const target = link.TargetTask;
        if (!source || !target) continue;
        if (result.has(source.id))
            result.get(source.id).blocks.push(target.uid);
        if (result.has(target.id)) {
            result.get(target.id).blockedBy.push(source.uid);
        }
    }
    return result;
}

// A calendar occurrence in the brief's shape. The ref and series_ref formats
// are fixed by docs/39-daily-brief.md ("Event refs").
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

// Due by `dueUntil` (overdue included), in progress, or planned on a day
// from `today` to `plannedUntil`.
async function readTasks(user, { today, dueUntil, plannedUntil, timezone }) {
    const planned = await briefRepository.findPlannedDays(
        user.id,
        today,
        plannedUntil
    );
    const candidates = await briefRepository.findCandidateTasks(
        await visibleWhere(user.id),
        {
            lastDayEnd: getDayBoundsInUTC(dueUntil, timezone).end,
            plannedTaskIds: [...planned.keys()],
        }
    );
    const ids = candidates.map((task) => task.id);
    const blocks = blocksByTask(
        await briefRepository.findBlockingLinks(ids),
        ids
    );
    return candidates.map((task) =>
        mapTask(task, {
            planned: planned.get(task.id) || [],
            blocks: blocks.get(task.id),
            timezone,
        })
    );
}

async function readClosedTasks(user, { today, timezone, days }) {
    const since = getDayBoundsInUTC(addDays(today, -days), timezone).start;
    const tasks = await briefRepository.findClosedTasks(
        await visibleWhere(user.id),
        since
    );
    return tasks.slice(0, CLOSED_LIMIT).map((task) => ({
        uid: task.uid,
        name: task.name || '',
        note: task.note ?? null,
        completed_at: new Date(task.completed_at).toISOString(),
    }));
}

async function readInbox(user) {
    const { items } = await dailyPlanRepository.findOpenInboxItems(
        user.id,
        INBOX_READ_LIMIT
    );
    return items.map((item) => ({
        uid: item.uid,
        title: item.title || '',
        created_at: new Date(item.created_at).toISOString(),
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

async function readCalendar(user, settings, { today, lastDay }) {
    const feedUids = settings.calendarFeedUids;
    if (feedUids.length === 0) {
        return {
            source: { id: 'calendar', status: 'not_configured', detail: null },
            events: [],
        };
    }
    const { events, errors } = await calendarFeedsService.eventsForBrief(
        user,
        today,
        lastDay,
        feedUids
    );
    return {
        source: {
            id: 'calendar',
            status: errors.length > 0 ? 'error' : 'read',
            detail: errors.map((error) => error.message).join('; ') || null,
        },
        events: events.map(mapEvent),
    };
}

// "pending" only when the mail agent is set up: the replies arrive later,
// asynchronously, from generate.js.
async function readMailSource(user, settings) {
    if (!settings.mail.enabled) {
        return { id: 'mail', status: 'not_configured', detail: null };
    }
    if (!(await mailAgentConfigured(user))) {
        return {
            id: 'mail',
            status: 'not_configured',
            detail: 'agent_not_configured',
        };
    }
    return { id: 'mail', status: 'pending', detail: null };
}

// What the user said and decided, read by the engine: the live contexts, the
// decisions of the retention window, and the feedback counts per card type.
async function readMemory(user, settings, { today, timezone, now }) {
    const [liveContexts, decisionRows, noiseStats] = await Promise.all([
        contexts.liveContexts(user, {
            now,
            timezone,
            today,
            lookaheadDays: settings.calendarLookaheadDays,
        }),
        decisions.listForEngine(
            user,
            addDays(today, -settings.retention.decisionsDays)
        ),
        decisions.noiseStats(user),
    ]);
    return { contexts: liveContexts, decisions: decisionRows, noiseStats };
}

// The input of buildBrief for the user's local day `today` (YYYY-MM-DD,
// default: today in their timezone), built at the instant `now`.
async function collectInput(user, settings, { today, now = new Date() } = {}) {
    const timezone = getSafeTimezone(user.timezone);
    const day = today ?? moment.tz(now, timezone).format('YYYY-MM-DD');
    const eventsLastDay = addDays(day, settings.calendarLookaheadDays);
    const lastDay = addDays(
        day,
        Math.max(settings.timelineDays - 1, settings.calendarLookaheadDays)
    );
    const dates = daysBetween(day, lastDay);

    const [
        tasks,
        closedTasks,
        inboxItems,
        focusBlocksByDate,
        postponements,
        calendar,
        mail,
        memory,
    ] = await Promise.all([
        readTasks(user, {
            today: day,
            dueUntil: eventsLastDay,
            plannedUntil: lastDay,
            timezone,
        }),
        readClosedTasks(user, {
            today: day,
            timezone,
            days: settings.thresholds.closedLookbackDays,
        }),
        readInbox(user),
        readFocusByDate(user, dates),
        readPostponements(user, timezone, day),
        readCalendar(user, settings, { today: day, lastDay: eventsLastDay }),
        readMailSource(user, settings),
        readMemory(user, settings, { today: day, timezone, now }),
    ]);

    return {
        today: day,
        timezone,
        now: new Date(now).toISOString(),
        tasks,
        closedTasks,
        inboxItems,
        events: calendar.events,
        focusBlocksByDate,
        postponements,
        contexts: memory.contexts,
        decisions: memory.decisions,
        noiseStats: memory.noiseStats,
        replies: null,
        sources: [
            { id: 'tasks', status: 'read', detail: null },
            calendar.source,
            mail,
        ],
    };
}

module.exports = { collectInput, mapTask, mapEvent, daysBetween };
