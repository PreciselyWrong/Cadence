'use strict';

const crypto = require('crypto');
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const { Task } = require('../../models');
const repository = require('./repository');
const slots = require('./slots');
const {
    planIdsOn,
    blockingTaskIds,
    laterPlanDays,
    buildSuggestions,
} = require('./day');
const permissionsService = require('../../services/permissionsService');
const scopeService = require('../../services/scopeService');
const { serializeTasks } = require('../tasks/core/serializers');
const { computeTaskMetrics } = require('../tasks/queries/metrics-computation');
const { weekStart: weekStartOf } = require('../review/fields');
const {
    GROUP_ORDER,
    DEFAULT_ORDER,
    normalizeOrder,
    orderCandidates,
    todayOrdered,
    rankCandidates,
} = require('./ranking');
const {
    DEFAULT_SUGGESTIONS,
    PROJECT_STATUSES,
    TIE_BREAKS,
    STALE_AFTER_DAYS,
    HORIZON_DAYS,
    MAX_SUGGESTIONS,
    isSuggestible,
    normalizeSuggestionSettings,
    validateSuggestionUpdate,
} = require('./planningSettings');
const {
    getSafeTimezone,
    getCurrentDateInTimezone,
    getDayBoundsInUTC,
    getTodayBoundsInUTC,
} = require('../../utils/timezone-utils');
const { ValidationError, NotFoundError } = require('../../shared/errors');
const {
    DEFAULT_DURATION,
    PlanChangedError,
    planEtag,
    parseOps,
    applyOps,
} = require('./ops');

const MAX_ITEMS = 100;
const MINUTES_PER_DAY = 24 * 60;
const MIN_DURATION = 5;
const MAX_DURATION = 12 * 60;
const INBOX_LIMIT = 20;
const DAY_HOURS_STEP = 30;

function resolvePlanDate(date, timezone) {
    if (
        date === undefined ||
        date === null ||
        date === '' ||
        date === 'today'
    ) {
        return getCurrentDateInTimezone(getSafeTimezone(timezone));
    }
    if (
        typeof date !== 'string' ||
        !moment(date, 'YYYY-MM-DD', true).isValid()
    ) {
        throw new ValidationError('date must be a YYYY-MM-DD date');
    }
    return date;
}

function isWholeNumberInRange(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max;
}

// Checks the shape of each item. Slots may overlap, as on a calendar: the
// page draws them side by side.
// Positions come from array order, so the client only has to send the list.
function validateItems(items) {
    if (!Array.isArray(items)) {
        throw new ValidationError('items must be an array');
    }
    if (items.length > MAX_ITEMS) {
        throw new ValidationError(
            `A day plan holds at most ${MAX_ITEMS} tasks`
        );
    }

    const seen = new Set();
    const normalized = items.map((item) => {
        if (!item || typeof item.task_uid !== 'string' || !item.task_uid) {
            throw new ValidationError('Each item needs a task_uid');
        }
        if (seen.has(item.task_uid)) {
            throw new ValidationError('A task can only be planned once a day');
        }
        seen.add(item.task_uid);

        const start =
            item.start_minute === undefined || item.start_minute === null
                ? null
                : item.start_minute;
        if (
            start !== null &&
            !isWholeNumberInRange(start, 0, MINUTES_PER_DAY - MIN_DURATION)
        ) {
            throw new ValidationError(
                'start_minute must be a whole number of minutes within the day'
            );
        }

        const duration =
            item.duration_minutes === undefined ||
            item.duration_minutes === null
                ? null
                : item.duration_minutes;
        if (
            duration !== null &&
            !isWholeNumberInRange(duration, MIN_DURATION, MAX_DURATION)
        ) {
            throw new ValidationError(
                `duration_minutes must be between ${MIN_DURATION} and ${MAX_DURATION}`
            );
        }
        if (
            start !== null &&
            start + (duration ?? DEFAULT_DURATION) > MINUTES_PER_DAY
        ) {
            throw new ValidationError('A time slot cannot run past midnight');
        }

        return {
            task_uid: item.task_uid,
            start_minute: start,
            duration_minutes: duration,
        };
    });

    return normalized;
}

async function visibleTaskWhere(userId) {
    return permissionsService.ownershipOrPermissionWhere('task', userId);
}

// A Focus scope never hides plan items: the planner replaces the whole
// list on every drag or carry-over from what the client holds, so a hidden
// item would be dropped on the next save. Items outside the scope are
// marked in_focus: false and the client dims them instead.
async function serializePlan(plan, userId, timezone, scopeWhere = null) {
    if (!plan) return null;

    const items = plan.Items || [];
    const visibleWhere = await visibleTaskWhere(userId);
    const tasks = await repository.findVisibleTasksByIds(
        visibleWhere,
        items.map((item) => item.task_id)
    );
    const inFocusIds = scopeWhere
        ? new Set(
              (
                  await Task.findAll({
                      where: scopeService.withScope(
                          { id: { [Op.in]: tasks.map((task) => task.id) } },
                          scopeWhere
                      ),
                      attributes: ['id'],
                      raw: true,
                  })
              ).map((row) => row.id)
          )
        : null;
    const serialized = await serializeTasks(tasks, timezone, {
        preserveOriginalName: true,
    });
    const byId = new Map(tasks.map((task, i) => [task.id, serialized[i]]));

    // Completing a recurring task moves the same row on to its next due
    // date and reopens it, so its status alone would show it as open again.
    // Count it as done for this day when an occurrence was completed on the
    // day and the task has since moved past it.
    const bounds = getDayBoundsInUTC(plan.plan_date, timezone);
    const completedIds = await repository.findTaskIdsCompletedBetween(
        tasks.map((task) => task.id),
        bounds.start,
        bounds.end
    );
    const closedStatuses = [Task.STATUS.DONE, Task.STATUS.ARCHIVED];
    const statusById = new Map(tasks.map((task) => [task.id, task.status]));
    const isOccurrenceDone = (taskId) => {
        const dueDate = byId.get(taskId).due_date;
        return (
            completedIds.has(taskId) &&
            !!dueDate &&
            dueDate > plan.plan_date &&
            !closedStatuses.includes(statusById.get(taskId))
        );
    };

    return {
        uid: plan.uid,
        date: plan.plan_date,
        started_at: plan.started_at,
        ai_wrap_up: plan.ai_wrap_up || null,
        items: items
            .filter((item) => byId.has(item.task_id))
            .map((item) => ({
                task_uid: byId.get(item.task_id).uid,
                position: item.position,
                start_minute: item.start_minute,
                duration_minutes: item.duration_minutes,
                task: byId.get(item.task_id),
                occurrence_done: isOccurrenceDone(item.task_id),
                ...(inFocusIds
                    ? { in_focus: inFocusIds.has(item.task_id) }
                    : {}),
            })),
    };
}

async function getPlan(user, date, scopeQuery = null) {
    const timezone = getSafeTimezone(user.timezone);
    const planDate = resolvePlanDate(date, timezone);
    const [plan, dayHours, focusBlocks, scope] = await Promise.all([
        repository.findPlan(user.id, planDate),
        getDayHours(user),
        repository
            .findUiSettings(user.id)
            .then((settings) => readFocus(settings, user)),
        scopeQuery ? scopeService.resolveScope(scopeQuery, user.id) : null,
    ]);
    return {
        date: planDate,
        day_hours: dayHours,
        focus_blocks: focusBlocks.blocks,
        focus_exceptions: focusBlocks.exceptions,
        focus_blocks_of_day: slots.focusBlocksOn(
            focusBlocks.blocks,
            focusBlocks.allExceptions,
            planDate
        ),
        plan: await serializePlan(
            plan,
            user.id,
            timezone,
            await scopeService.taskScopeWhere(scope)
        ),
    };
}

const DAY_COMPLETED_LIMIT = 50;

// The Today page for one day (GET /daily-plan/day): the plan, the tasks due
// that day that are not planned on a day from today on, the overdue tasks
// (split: `overdue` not planned later, `overdue_planned` planned on a later
// day, with that day) and the suggestions (today only), and the tasks done
// that day that are not in its plan. Membership rules are in day.js.
async function getDay(user, date, scopeQuery = null) {
    const timezone = getSafeTimezone(user.timezone);
    const today = getCurrentDateInTimezone(timezone);
    const planView = await getPlan(user, date, scopeQuery);
    const planDate = planView.date;
    const isToday = planDate === today;
    const dayBounds = getDayBoundsInUTC(planDate, timezone);
    const visibleWhere = await visibleTaskWhere(user.id);
    const lines = await repository.findPlanLinesFrom(user.id, today, planDate);
    const blocked = [...blockingTaskIds(lines, { date: planDate, today })];
    const plannedOnDay = [...planIdsOn(lines, planDate)];

    const serialize = (tasks) =>
        serializeTasks(tasks, timezone, { preserveOriginalName: true });
    const [dueTasks, overdueTasks, completedTasks] = await Promise.all([
        repository.findDueBetween(
            visibleWhere,
            dayBounds.start,
            dayBounds.end,
            blocked
        ),
        isToday
            ? repository.findOverdueBefore(
                  visibleWhere,
                  getTodayBoundsInUTC(timezone).start,
                  plannedOnDay
              )
            : [],
        repository.findCompletedBetween(
            visibleWhere,
            dayBounds.start,
            dayBounds.end,
            plannedOnDay,
            DAY_COMPLETED_LIMIT
        ),
    ]);
    const laterDays = laterPlanDays(lines, { today });
    const [due, overdue, overduePlannedTasks, completed] = await Promise.all([
        serialize(dueTasks),
        serialize(overdueTasks.filter((task) => !laterDays.has(task.id))),
        serialize(overdueTasks.filter((task) => laterDays.has(task.id))),
        serialize(completedTasks),
    ]);
    const plannedDayByUid = new Map(
        overdueTasks
            .filter((task) => laterDays.has(task.id))
            .map((task) => [task.uid, laterDays.get(task.id)])
    );
    const overduePlanned = overduePlannedTasks.map((task) => ({
        ...task,
        planned_date: plannedDayByUid.get(task.uid),
    }));

    let suggestions = null;
    if (isToday) {
        const candidates = await getCandidates(user, { scopeQuery });
        const excludeUids = new Set([
            ...(planView.plan?.items || []).map((item) => item.task_uid),
            ...due.map((task) => task.uid),
            ...overdue.map((task) => task.uid),
            ...overduePlanned.map((task) => task.uid),
        ]);
        suggestions = buildSuggestions(candidates, {
            weekStart: weekStartOf(today, user.first_day_of_week ?? 1),
            excludeUids,
        });
    }

    return {
        date: planDate,
        is_today: isToday,
        day_hours: planView.day_hours,
        focus_blocks_of_day: planView.focus_blocks_of_day,
        plan: planView.plan,
        etag: planEtag(planView.plan?.items || []),
        due,
        overdue,
        overdue_planned: overduePlanned,
        suggestions,
        completed,
    };
}

// Writes the given days in one transaction: `change` gets the lines of each
// day, read under lock, and returns the lines of the days it changes. With
// `ifMatch`, the write is refused (and nothing stored) unless the day's
// visible items still have that etag. Resolves to whether any day changed.
async function writeDays(user, planDate, dates, { ifMatch = null, change }) {
    const visibleWhere = await visibleTaskWhere(user.id);
    try {
        return await repository.transactPlans(
            user.id,
            dates,
            async (days, transaction) => {
                if (ifMatch !== null) {
                    const lines = days.get(planDate).lines;
                    const visibleIds = await repository.findVisibleTaskIds(
                        visibleWhere,
                        lines.map((line) => line.task_id),
                        transaction
                    );
                    const visible = lines.filter((line) =>
                        visibleIds.has(line.task_id)
                    );
                    if (planEtag(visible) !== ifMatch) {
                        throw new PlanChangedError();
                    }
                }
                return change(days, { visibleWhere, transaction });
            }
        );
    } catch (error) {
        if (error instanceof PlanChangedError) {
            error.plan = await getPlan(user, planDate);
        }
        throw error;
    }
}

async function replaceItems(user, date, items, { ifMatch = null } = {}) {
    const timezone = getSafeTimezone(user.timezone);
    const planDate = resolvePlanDate(date, timezone);
    const normalized = validateItems(items);

    await writeDays(user, planDate, [planDate], {
        ifMatch,
        change: async (days, { visibleWhere, transaction }) => {
            const tasks = await repository.findVisibleTasksByUids(
                visibleWhere,
                normalized.map((item) => item.task_uid),
                transaction
            );
            const byUid = new Map(tasks.map((task) => [task.uid, task]));
            const missing = normalized.find(
                (item) => !byUid.has(item.task_uid)
            );
            if (missing) {
                throw new NotFoundError(`Task ${missing.task_uid} not found`);
            }
            return new Map([
                [
                    planDate,
                    normalized.map((item) => {
                        const task = byUid.get(item.task_uid);
                        return {
                            task_id: task.id,
                            task_uid: task.uid,
                            start_minute: item.start_minute,
                            duration_minutes:
                                item.duration_minutes ??
                                task.estimated_minutes ??
                                DEFAULT_DURATION,
                        };
                    }),
                ],
            ]);
        },
    });
    return getPlan(user, planDate);
}

const lineKey = (line) => [
    line.task_id,
    line.start_minute,
    line.duration_minutes,
];

const sameLines = (before, after) =>
    JSON.stringify(before.map(lineKey)) === JSON.stringify(after.map(lineKey));

// Applies the PATCH ops in order, in one transaction. Only a remove may name
// a task the user cannot see: it takes the line away whatever the sharing,
// so a revoked task can still be taken off a day.
async function runPlanOps(user, date, ops, { ifMatch = null } = {}) {
    const timezone = getSafeTimezone(user.timezone);
    const planDate = resolvePlanDate(date, timezone);
    const parsed = parseOps(ops, planDate);
    const uids = [
        ...new Set(
            parsed.filter((op) => op.op !== 'remove').map((op) => op.task_uid)
        ),
    ];
    const moveDates = parsed
        .filter((op) => op.op === 'move')
        .map((op) => op.to_date);

    const changed = await writeDays(user, planDate, [planDate, ...moveDates], {
        ifMatch,
        change: async (days, { visibleWhere, transaction }) => {
            const tasks = await repository.findVisibleTasksByUids(
                visibleWhere,
                uids,
                transaction
            );
            const byUid = new Map(tasks.map((task) => [task.uid, task]));
            const missing = uids.find((uid) => !byUid.has(uid));
            if (missing) {
                throw new NotFoundError(`Task ${missing} not found`);
            }

            const linesByDay = new Map(
                [...days].map(([day, { lines }]) => [day, lines])
            );
            const next = applyOps(linesByDay, parsed, {
                planDate,
                tasks: byUid,
            });
            const writes = new Map();
            for (const [day, lines] of next) {
                if (sameLines(days.get(day).lines, lines)) continue;
                validateItems(lines);
                writes.set(day, lines);
            }
            return writes;
        },
    });
    return { planDate, changed };
}

async function applyPlanOps(user, date, ops, { ifMatch = null } = {}) {
    const { planDate } = await runPlanOps(user, date, ops, { ifMatch });
    return getPlan(user, planDate);
}

async function startPlan(user, date) {
    const timezone = getSafeTimezone(user.timezone);
    const planDate = resolvePlanDate(date, timezone);
    await repository.markStarted(user.id, planDate);
    return getPlan(user, planDate);
}

// Appends tasks to a day's plan without a time, skipping ones already on
// it. Used to move unfinished work to tomorrow.
async function carryOver(user, date, taskUids) {
    if (
        !Array.isArray(taskUids) ||
        taskUids.some((uid) => typeof uid !== 'string' || !uid)
    ) {
        throw new ValidationError('task_uids must be a list of task uids');
    }
    const timezone = getSafeTimezone(user.timezone);
    const planDate = resolvePlanDate(date, timezone);
    if (taskUids.length === 0) return getPlan(user, planDate);
    return applyPlanOps(
        user,
        planDate,
        taskUids.map((uid) => ({ op: 'add', task_uid: uid }))
    );
}

// The `today` flag on the task API: true appends the task to today's plan,
// false takes it off. Removing from a day with no plan creates nothing.
async function setTaskOnToday(user, taskUid, onToday) {
    if (onToday) return carryOver(user, 'today', [taskUid]);
    const { planDate, changed } = await runPlanOps(user, 'today', [
        { op: 'remove', task_uid: taskUid },
    ]);
    return changed ? getPlan(user, planDate) : null;
}

// The task leaves every plan from today on (a horizon chosen instead of a
// day); earlier days keep it, they are history. Each day goes through the
// plan ops, so the sync journal and the ETags follow.
async function takeTaskOffPlansFrom(user, task) {
    const timezone = getSafeTimezone(user.timezone);
    const today = resolvePlanDate('today', timezone);
    const dates = await repository.findPlanDatesWithTask(
        user.id,
        task.id,
        today
    );
    for (const date of dates) {
        await runPlanOps(user, date, [{ op: 'remove', task_uid: task.uid }]);
    }
    return dates;
}

async function clearPlan(user, date) {
    const timezone = getSafeTimezone(user.timezone);
    const planDate = resolvePlanDate(date, timezone);
    await repository.deletePlan(user.id, planDate);
    return { date: planDate, plan: null };
}

// How many suggestions GET /daily-plan/candidates may send at once. The
// planner raises its limit page by page, so a day with more open tasks than
// this is still reachable one request at a time.
const MAX_SUGGESTED_LIMIT = 1000;

// Reads ?suggested_limit=N, the planner's "Show more": absent means the
// user's Planning setting.
function parseSuggestedLimit(value) {
    if (value === undefined || value === null || value === '') return null;
    const limit = Number(value);
    if (!isWholeNumberInRange(limit, 1, MAX_SUGGESTED_LIMIT)) {
        throw new ValidationError(
            `suggested_limit must be a whole number between 1 and ${MAX_SUGGESTED_LIMIT}`
        );
    }
    return limit;
}

const isRoutineLater = (task, todayEnd) =>
    Boolean(task.recurrence_type) &&
    task.recurrence_type !== 'none' &&
    Boolean(task.due_date) &&
    new Date(task.due_date).getTime() > todayEnd;

// The user's order of the Today list. Written through the model, so the sync
// journal hands it to every device; a task of someone else keeps its place.
async function saveTodayOrder(user, taskUids) {
    if (
        !Array.isArray(taskUids) ||
        taskUids.length > MAX_SUGGESTED_LIMIT ||
        !taskUids.every((uid) => typeof uid === 'string')
    ) {
        throw new ValidationError('task_uids must be a list of task uids');
    }
    const tasks = await repository.findOwnTasksByUids(user.id, taskUids);
    const byUid = new Map(tasks.map((task) => [task.uid, task]));
    let rank = 0;
    for (const uid of taskUids) {
        const task = byUid.get(uid);
        if (!task) continue;
        if (task.today_order !== rank) await task.update({ today_order: rank });
        rank += 1;
    }
    return { task_uids: taskUids.filter((uid) => byUid.has(uid)) };
}

// The planner's left column: open tasks tagged #today plus the same lists
// the classic Today page shows, deduplicated so a task appears in the first
// group it belongs to, and ranked by the rules in ranking.js. The user's
// planning settings decide which tasks count as suggested and how many are
// shown at first; suggestedLimit raises that cap when the planner asks for
// more, and suggested_total says how many there are in all.
async function getCandidates(
    user,
    { suggestedLimit = null, scopeQuery = null } = {}
) {
    const timezone = getSafeTimezone(user.timezone);
    const { order, suggestions } = await getPlanningSettings(user);
    const cap = suggestedLimit ?? suggestions.maxSuggestions;
    const scopeWhere = await scopeService.taskScopeWhere(
        scopeQuery ? await scopeService.resolveScope(scopeQuery, user.id) : null
    );
    const myVisibleWhere = {
        [Op.and]: [
            await permissionsService.ownershipOrPermissionWhere(
                'task',
                user.id
            ),
            await permissionsService.myWorkWhere(user.id),
        ],
    };
    const weekStart = weekStartOf(
        moment.tz(timezone).format('YYYY-MM-DD'),
        user.first_day_of_week ?? 1
    );
    const [metrics, funnelTasks, taggedToday] = await Promise.all([
        computeTaskMetrics(user.id, timezone, null, suggestions, scopeWhere),
        repository.findFunnelTasks(
            scopeService.withScope(myVisibleWhere, scopeWhere),
            weekStart
        ),
        repository.findTasksTaggedToday(
            scopeService.withScope(
                {
                    [Op.and]: [
                        await permissionsService.ownershipOrPermissionWhere(
                            'task',
                            user.id
                        ),
                        await permissionsService.myWorkWhere(user.id),
                    ],
                },
                scopeWhere
            )
        ),
    ]);

    // Groups follow the task's own due date, as Profile > Planning
    // describes them. The Today page's due-today list also counts a project
    // due today, which puts undated tasks there. Started tasks that
    // are past due count as overdue here, so late work is never ranked below
    // fresh work.
    const bounds = getTodayBoundsInUTC(timezone);
    const todayStart = new Date(bounds.start).getTime();
    const todayEnd = new Date(bounds.end).getTime();
    const now = Date.now();
    const dueTime = (task) =>
        task.due_date ? new Date(task.due_date).getTime() : null;
    const isLate = (task) =>
        dueTime(task) !== null && dueTime(task) < todayStart;
    const isDueToday = (task) =>
        dueTime(task) !== null &&
        dueTime(task) >= todayStart &&
        dueTime(task) <= todayEnd;
    const started = [...metrics.tasks_in_progress, ...metrics.today_plan_tasks];
    const fromProjectDates = metrics.tasks_due_today.filter(
        (task) => !isLate(task) && !isDueToday(task)
    );

    // Tasks tagged #today come first by default and leave the other groups.
    const groupTasks = {
        tagged_today: taggedToday,
        overdue: [
            ...metrics.tasks_overdue.filter(isLate),
            ...metrics.tasks_due_today.filter(isLate),
            ...started.filter(isLate),
        ],
        due_today: [
            ...metrics.tasks_overdue.filter(isDueToday),
            ...metrics.tasks_due_today.filter(isDueToday),
        ],
        in_progress: started,
        suggested: [
            // Committed this week or in view: chosen by the user, so only a
            // later defer-until keeps them back.
            ...funnelTasks.filter(
                (task) =>
                    !task.defer_until ||
                    new Date(task.defer_until).getTime() <= now
            ),
            // A routine due on another day comes back by itself.
            ...metrics.suggested_tasks.filter(
                (task) => !isRoutineLater(task, todayEnd)
            ),
            ...fromProjectDates.filter((task) =>
                isSuggestible(task, suggestions, now)
            ),
        ],
    };

    const seen = new Set();
    const unique = {};
    for (const key of GROUP_ORDER) {
        unique[key] = rankCandidates(
            groupTasks[key],
            suggestions.tieBreak
        ).filter((task) => {
            if (seen.has(task.id)) return false;
            seen.add(task.id);
            return true;
        });
    }

    // Tomorrow's tasks have their own place, under the day. What is already on
    // the day stays there; they leave the suggestions.
    const tomorrowBounds = getDayBoundsInUTC(
        moment.tz(timezone).add(1, 'day').format('YYYY-MM-DD'),
        timezone
    );
    const onTheDay = new Set(
        GROUP_ORDER.filter((key) => key !== 'suggested').flatMap((key) =>
            unique[key].map((task) => task.id)
        )
    );
    const tomorrow = (
        await repository.findTasksDueBetween(
            scopeService.withScope(myVisibleWhere, scopeWhere),
            tomorrowBounds.start,
            tomorrowBounds.end
        )
    ).filter((task) => !onTheDay.has(task.id));
    const tomorrowIds = new Set(tomorrow.map((task) => task.id));
    unique.suggested = unique.suggested.filter(
        (task) => !tomorrowIds.has(task.id)
    );

    // The cap comes last: keep the first suggestions in the final order.
    let ranked = orderCandidates(unique, order, suggestions.tieBreak, {
        weekStart,
    });
    const suggestedTotal = unique.suggested.length;
    const shown = new Set(
        ranked
            .filter(({ group }) => group === 'suggested')
            .slice(0, cap)
            .map(({ task }) => task.id)
    );
    unique.suggested = unique.suggested.filter((task) => shown.has(task.id));
    ranked = ranked.filter(
        ({ group, task }) => group !== 'suggested' || shown.has(task.id)
    );

    const result = {};
    for (const key of GROUP_ORDER) {
        result[key] = await serializeTasks(unique[key], timezone, {
            preserveOriginalName: true,
        });
    }
    result.tomorrow = await serializeTasks(tomorrow, timezone, {
        preserveOriginalName: true,
    });
    result.ranked = todayOrdered(ranked).map(({ task }) => task.uid);
    result.suggested_total = suggestedTotal;

    const inbox = await repository.findOpenInboxItems(user.id, INBOX_LIMIT);
    result.inbox = inbox.items.map((item) => ({
        uid: item.uid,
        title: item.title,
        content: item.content,
        created_at: item.created_at,
    }));
    result.inbox_count = inbox.count;

    return result;
}

// Everything the candidate list reads from ui_settings.planning, each value
// normalized to a known one.
async function getPlanningSettings(user) {
    const settings = await repository.findUiSettings(user.id);
    return {
        order: normalizeOrder(settings.planning?.candidateOrder),
        suggestions: normalizeSuggestionSettings(settings.planning),
    };
}

// Which tasks count as suggested (Profile > Planning), with the allowed
// values so the client does not repeat them.
async function getSuggestionSettings(user) {
    const { suggestions } = await getPlanningSettings(user);
    return {
        settings: suggestions,
        defaults: DEFAULT_SUGGESTIONS,
        options: {
            projectStatuses: PROJECT_STATUSES,
            tieBreak: TIE_BREAKS,
            staleAfterDays: STALE_AFTER_DAYS,
            horizonDays: HORIZON_DAYS,
            maxSuggestions: MAX_SUGGESTIONS,
        },
    };
}

async function saveSuggestionSettings(user, body) {
    const update = validateSuggestionUpdate(body);
    if (update.excludedProjectIds) {
        const visible = await repository.findVisibleProjectIds(
            await permissionsService.ownershipOrPermissionWhere(
                'project',
                user.id
            ),
            update.excludedProjectIds
        );
        const unknown = update.excludedProjectIds.filter(
            (id) => !visible.includes(id)
        );
        if (unknown.length > 0) {
            throw new ValidationError(
                `Unknown projects in excludedProjectIds: ${unknown.join(', ')}`
            );
        }
    }
    const settings = await repository.findUiSettings(user.id);
    await repository.saveUiSettings(user.id, {
        ...settings,
        planning: { ...(settings.planning || {}), ...update },
    });
    return getSuggestionSettings(user);
}

// The user's bucket order for the candidate list (Profile > Planning).
async function getRanking(user) {
    const settings = await repository.findUiSettings(user.id);
    return {
        order: normalizeOrder(settings.planning?.candidateOrder),
        default_order: DEFAULT_ORDER,
    };
}

async function saveRanking(user, order) {
    if (
        !Array.isArray(order) ||
        order.length !== DEFAULT_ORDER.length ||
        new Set(order).size !== order.length ||
        order.some((key) => !DEFAULT_ORDER.includes(key))
    ) {
        throw new ValidationError(
            `order must list each of ${DEFAULT_ORDER.join(', ')} once`
        );
    }
    const settings = await repository.findUiSettings(user.id);
    await repository.saveUiSettings(user.id, {
        ...settings,
        planning: { ...(settings.planning || {}), candidateOrder: order },
    });
    return getRanking(user);
}

// The hours the planner shows by default, as minutes after local midnight
// in the user's timezone (Profile > Planning).
const isValidDayHours = (hours) =>
    !!hours &&
    Number.isInteger(hours.start) &&
    Number.isInteger(hours.end) &&
    hours.start >= 0 &&
    hours.end <= MINUTES_PER_DAY &&
    hours.start < hours.end &&
    hours.start % DAY_HOURS_STEP === 0 &&
    hours.end % DAY_HOURS_STEP === 0;

async function getDayHours(user) {
    const settings = await repository.findUiSettings(user.id);
    const saved = settings.planning?.dayHours;
    return isValidDayHours(saved)
        ? { start: saved.start, end: saved.end }
        : { ...slots.DEFAULT_DAY_HOURS };
}

async function saveDayHours(user, hours) {
    const next = { start: hours?.start, end: hours?.end };
    if (!isValidDayHours(next)) {
        throw new ValidationError(
            `start and end must be minutes of the day in steps of ${DAY_HOURS_STEP}, with start before end`
        );
    }
    const settings = await repository.findUiSettings(user.id);
    await repository.saveUiSettings(user.id, {
        ...settings,
        planning: { ...(settings.planning || {}), dayHours: next },
    });
    return getDayHours(user);
}

// Recurring focus blocks (days + hours) that auto-placement never uses,
// stored in ui_settings.planning.focusBlocks next to dayHours.
const MAX_FOCUS_BLOCKS = 20;

const normalizeFocusBlock = (block) => {
    if (!block || typeof block !== 'object') return null;
    const days = Array.isArray(block.days)
        ? [...new Set(block.days)].sort((a, b) => a - b)
        : [];
    const valid =
        days.length > 0 &&
        days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
        isValidDayHours({ start: block.start, end: block.end });
    if (!valid) return null;
    const label =
        typeof block.label === 'string' ? block.label.trim().slice(0, 60) : '';
    return {
        id:
            typeof block.id === 'string' && block.id
                ? block.id.slice(0, 40)
                : crypto.randomUUID(),
        days,
        start: block.start,
        end: block.end,
        ...(label ? { label } : {}),
    };
};

// Exceptions free focus blocks between two dates, both included (holidays,
// a day off); stored in ui_settings.planning.focusExceptions. One that has
// ended is dropped, and so is one whose chosen blocks were all deleted.
const MAX_FOCUS_EXCEPTIONS = 50;

const isDate = (value) =>
    typeof value === 'string' && moment(value, 'YYYY-MM-DD', true).isValid();

const normalizeFocusException = (exception, blockIds) => {
    if (!exception || typeof exception !== 'object') return null;
    const { start, end, block_ids: chosen } = exception;
    if (!isDate(start) || !isDate(end) || end < start) return null;
    if (chosen !== undefined && chosen !== null && !Array.isArray(chosen)) {
        return null;
    }
    const label =
        typeof exception.label === 'string'
            ? exception.label.trim().slice(0, 60)
            : '';
    return {
        id:
            typeof exception.id === 'string' && exception.id
                ? exception.id.slice(0, 40)
                : crypto.randomUUID(),
        start,
        end,
        block_ids: chosen?.length ? [...new Set(chosen)] : null,
        ...(label ? { label } : {}),
    };
};

// Keeps the exceptions still to come whose blocks still exist.
const liveFocusExceptions = (exceptions, blocks, today) => {
    const ids = new Set(blocks.map((block) => block.id));
    return exceptions
        .filter((exception) => exception.end >= today)
        .map((exception) =>
            exception.block_ids
                ? {
                      ...exception,
                      block_ids: exception.block_ids.filter((id) =>
                          ids.has(id)
                      ),
                  }
                : exception
        )
        .filter(
            (exception) => !exception.block_ids || exception.block_ids.length
        )
        .sort((a, b) => a.start.localeCompare(b.start));
};

const userToday = (user) =>
    getCurrentDateInTimezone(getSafeTimezone(user.timezone));

// `exceptions` are the ones still to come; `allExceptions` keeps the ended
// ones too, so a past day is shown with the blocks it really had.
const readFocus = (settings, user) => {
    const savedBlocks = settings.planning?.focusBlocks;
    const blocks = Array.isArray(savedBlocks)
        ? savedBlocks.map(normalizeFocusBlock).filter(Boolean)
        : [];
    const savedExceptions = settings.planning?.focusExceptions;
    const allExceptions = Array.isArray(savedExceptions)
        ? savedExceptions.map((e) => normalizeFocusException(e)).filter(Boolean)
        : [];
    return {
        blocks,
        exceptions: liveFocusExceptions(allExceptions, blocks, userToday(user)),
        allExceptions,
    };
};

async function getFocusBlocks(user) {
    const { blocks, exceptions } = readFocus(
        await repository.findUiSettings(user.id),
        user
    );
    return { blocks, exceptions };
}

// `exceptions` is optional: left out, the saved ones are kept.
async function saveFocusBlocks(user, body) {
    const input = body?.blocks;
    if (!Array.isArray(input) || input.length > MAX_FOCUS_BLOCKS) {
        throw new ValidationError(
            `blocks must be a list of at most ${MAX_FOCUS_BLOCKS} focus blocks`
        );
    }
    const blocks = input.map(normalizeFocusBlock);
    if (blocks.some((block) => block === null)) {
        throw new ValidationError(
            `each focus block needs days (0-6) and start before end in steps of ${DAY_HOURS_STEP} minutes`
        );
    }
    const settings = await repository.findUiSettings(user.id);
    let exceptions = readFocus(settings, user).exceptions;
    if (body.exceptions !== undefined) {
        const list = body.exceptions;
        if (!Array.isArray(list) || list.length > MAX_FOCUS_EXCEPTIONS) {
            throw new ValidationError(
                `exceptions must be a list of at most ${MAX_FOCUS_EXCEPTIONS} exceptions`
            );
        }
        const ids = new Set(blocks.map((block) => block.id));
        exceptions = list.map((e) => normalizeFocusException(e));
        const invalid = exceptions.some(
            (e) => e === null || e.block_ids?.some((id) => !ids.has(id))
        );
        if (invalid) {
            throw new ValidationError(
                'each exception needs a start and an end date (YYYY-MM-DD, end not before start) and only known block ids'
            );
        }
    }
    await repository.saveUiSettings(user.id, {
        ...settings,
        planning: {
            ...(settings.planning || {}),
            focusBlocks: blocks,
            focusExceptions: liveFocusExceptions(
                exceptions,
                blocks,
                userToday(user)
            ),
        },
    });
    return getFocusBlocks(user);
}

module.exports = {
    getDay,
    saveTodayOrder,
    readFocus,
    getFocusBlocks,
    saveFocusBlocks,
    getDayHours,
    saveDayHours,
    resolvePlanDate,
    validateItems,
    getPlan,
    replaceItems,
    applyPlanOps,
    startPlan,
    clearPlan,
    carryOver,
    setTaskOnToday,
    takeTaskOffPlansFrom,
    getCandidates,
    parseSuggestedLimit,
    getRanking,
    saveRanking,
    getPlanningSettings,
    getSuggestionSettings,
    saveSuggestionSettings,
};
