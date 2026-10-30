'use strict';

// "Review": the one place that shows what needs a decision. Every list is
// computed from data the app already has, on request, so ignoring this page
// for weeks costs nothing and nothing here nags. Rules: docs/34-review.md.
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const { Task } = require('../../models');
const repository = require('./repository');
const dailyPlanRepository = require('../daily-plan/repository');
const permissionsService = require('../../services/permissionsService');
const { serializeTasks } = require('../tasks/core/serializers');
const { getSafeTimezone } = require('../../utils/timezone-utils');
const { ValidationError, NotFoundError } = require('../../shared/errors');
const {
    WINDOW_DAYS,
    localDay,
    addDays,
    classifyDueChange,
    missedPlanDays,
    collectPushes,
    summarize,
} = require('./postponements');

const STALE_AFTER_DAYS = 90;
const QUIET_PROJECT_DAYS = 30;
const PUSHED_TASKS_PER_PROJECT = 2;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const HISTORY_LIMIT = 100;
const MAX_WEEK_CAPACITY = 7 * 24 * 60;

const CATEGORIES = ['pushed', 'undecided', 'later', 'projects', 'stale'];

const DAY_MS = 24 * 60 * 60 * 1000;

function todayOf(timezone) {
    return moment.tz(timezone).format('YYYY-MM-DD');
}

// First day of the week holding `day`, by the user's first day of week.
function weekStartOf(day, firstDayOfWeek = 1) {
    const m = moment.utc(day, 'YYYY-MM-DD');
    const back = (m.day() - firstDayOfWeek + 7) % 7;
    return m.subtract(back, 'days').format('YYYY-MM-DD');
}

function parsePaging(query = {}) {
    const limit =
        query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit);
    const offset = query.offset === undefined ? 0 : Number(query.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        throw new ValidationError(`limit must be between 1 and ${MAX_LIMIT}`);
    }
    if (!Number.isInteger(offset) || offset < 0) {
        throw new ValidationError('offset must be 0 or more');
    }
    return { limit, offset };
}

async function visibleTasksWhere(userId) {
    return {
        [Op.and]: [
            await permissionsService.ownershipOrPermissionWhere('task', userId),
            await permissionsService.myWorkWhere(userId),
        ],
    };
}

// Tasks the review can say something about: no habits, no subtasks, no
// recurring series or their generated instances.
const REVIEWABLE = {
    habit_mode: false,
    parent_task_id: null,
};

// Frequently pushed open tasks, with their push summary, most pushed first.
// Reads only the last 30 days of the user's own due changes and plans.
async function computePushed(user, timezone, today) {
    const sinceDay = addDays(today, -WINDOW_DAYS - 1);
    const since = moment.tz(sinceDay, timezone).toDate();
    const [events, planDays] = await Promise.all([
        repository.findDueChangesByUser(user.id, since),
        repository.findPlanDaysByUser(user.id, sinceDay, addDays(today, -1)),
    ]);

    const changesByTask = new Map();
    for (const event of events) {
        const change = classifyDueChange(event, timezone);
        if (change.kind !== 'postponed') continue;
        if (!changesByTask.has(event.task_id)) {
            changesByTask.set(event.task_id, []);
        }
        changesByTask.get(event.task_id).push(change);
    }
    const ids = new Set([...changesByTask.keys(), ...planDays.keys()]);
    if (ids.size === 0) return [];

    const tasks = await repository.findOpenTasks(
        await visibleTasksWhere(user.id),
        { ...REVIEWABLE, id: { [Op.in]: [...ids] } }
    );

    const result = [];
    for (const task of tasks) {
        const missed = missedPlanDays(
            task,
            planDays.get(task.id) || [],
            today,
            timezone
        );
        const pushes = collectPushes(changesByTask.get(task.id) || [], missed);
        const summary = summarize(pushes, today, task.reviewed_at, timezone);
        if (summary.frequent) result.push({ task, push: summary });
    }
    return result.sort(
        (a, b) =>
            b.push.recent_count - a.push.recent_count ||
            String(b.push.last_postponed_on).localeCompare(
                String(a.push.last_postponed_on)
            ) ||
            a.task.id - b.task.id
    );
}

function laterWhere(somedayIds, today) {
    return {
        ...REVIEWABLE,
        [Op.or]: [
            { id: { [Op.in]: somedayIds.length ? somedayIds : [0] } },
            { review_on: { [Op.lte]: today } },
        ],
    };
}

function staleWhere(somedayIds, now) {
    const before = new Date(now.getTime() - STALE_AFTER_DAYS * DAY_MS);
    const where = {
        ...REVIEWABLE,
        recurrence_type: 'none',
        recurring_parent_id: null,
        status: { [Op.ne]: Task.STATUS.WAITING },
        updated_at: { [Op.lt]: before },
        [Op.or]: [{ reviewed_at: null }, { reviewed_at: { [Op.lt]: before } }],
    };
    if (somedayIds.length) where.id = { [Op.notIn]: somedayIds };
    return where;
}

// Active projects that do not move: nothing to do next, nothing changed in
// 30 days, or several tasks pushed again and again. Projects waiting on
// someone, parked (#someday), done or not started are left out. Keeping a
// project in the review hides "no next action" until the project changes,
// and "quiet" for another 30 days.
async function computeStagnantProjects(user, pushed, now) {
    const where = await permissionsService.ownershipOrPermissionWhere(
        'project',
        user.id
    );
    const { projectIds: somedayProjects } = await repository.findSomedayIds(
        user.id
    );
    const projects = await repository.findActiveProjects(
        where,
        somedayProjects
    );
    const stats = await repository.findProjectTaskStats(
        projects.map((p) => p.id),
        now
    );
    const pushedByProject = new Map();
    for (const { task } of pushed) {
        if (!task.project_id) continue;
        pushedByProject.set(
            task.project_id,
            (pushedByProject.get(task.project_id) || 0) + 1
        );
    }

    const time = (value) => (value ? new Date(value).getTime() : 0);
    const quietBefore = now.getTime() - QUIET_PROJECT_DAYS * DAY_MS;
    const result = [];
    for (const project of projects) {
        const s = stats.get(project.id);
        const reviewed = time(project.reviewed_at);
        const lastChange = Math.max(
            time(s.lastChange),
            time(project.updated_at),
            time(project.created_at)
        );
        const reasons = [];
        if (s.actionable === 0 && s.waiting === 0 && reviewed < lastChange) {
            reasons.push('no_next_action');
        }
        const futureDue =
            project.due_date_at && time(project.due_date_at) > now.getTime();
        if (
            s.actionable + s.waiting > 0 &&
            !futureDue &&
            Math.max(lastChange, reviewed) < quietBefore
        ) {
            reasons.push('quiet');
        }
        if (
            (pushedByProject.get(project.id) || 0) >= PUSHED_TASKS_PER_PROJECT
        ) {
            reasons.push('pushed_tasks');
        }
        if (reasons.length === 0) continue;
        result.push({
            project: {
                id: project.id,
                uid: project.uid,
                name: project.name,
                status: project.status,
                due_date_at: project.due_date_at,
                reviewed_at: project.reviewed_at,
            },
            reasons,
            open_tasks: s.actionable + s.waiting,
            last_activity_at: lastChange ? new Date(lastChange) : null,
        });
    }
    return result.sort(
        (a, b) =>
            time(a.last_activity_at) - time(b.last_activity_at) ||
            a.project.id - b.project.id
    );
}

const serialize = async (tasks, timezone) =>
    serializeTasks(tasks, timezone, { preserveOriginalName: true });

// The counts for the tabs, and how many distinct things need a look: a
// task in two lists counts once. "Later" only counts toward that total
// when its review date has come.
async function getSummary(user) {
    const timezone = getSafeTimezone(user.timezone);
    const today = todayOf(timezone);
    const now = new Date();
    const visible = await visibleTasksWhere(user.id);
    const { taskIds: somedayIds } = await repository.findSomedayIds(user.id);

    const pushed = await computePushed(user, timezone, today);
    const [projects, inbox, laterCount, reviewDue, staleTasks] =
        await Promise.all([
            computeStagnantProjects(user, pushed, now),
            repository.findOpenInboxItems(user.id, 1, 0),
            repository.countOpenTasks(visible, laterWhere(somedayIds, today)),
            repository.findOpenTasks(
                visible,
                { ...REVIEWABLE, review_on: { [Op.lte]: today } },
                { attributes: ['id'], include: [] }
            ),
            repository.findOpenTasks(visible, staleWhere(somedayIds, now), {
                attributes: ['id'],
                include: [],
            }),
        ]);

    const attention = new Set([
        ...pushed.map(({ task }) => task.id),
        ...reviewDue.map((t) => t.id),
        ...staleTasks.map((t) => t.id),
    ]);
    const weekStart = weekStartOf(today, user.first_day_of_week ?? 1);
    const decided = await repository.countOpenTasks(
        await permissionsService.ownershipOrPermissionWhere('task', user.id),
        {
            reviewed_at: {
                [Op.gte]: moment.tz(weekStart, timezone).toDate(),
            },
        }
    );

    return {
        counts: {
            pushed: pushed.length,
            undecided: inbox.count,
            later: laterCount,
            review_due: reviewDue.length,
            projects: projects.length,
            stale: staleTasks.length,
        },
        attention_total: attention.size + inbox.count + projects.length,
        decided_this_week: decided,
        week_start: weekStart,
    };
}

async function getCategory(user, category, query = {}) {
    if (!CATEGORIES.includes(category)) {
        throw new NotFoundError('Unknown review list');
    }
    const { limit, offset } = parsePaging(query);
    const timezone = getSafeTimezone(user.timezone);
    const today = todayOf(timezone);
    const now = new Date();

    if (category === 'undecided') {
        const { items, count } = await repository.findOpenInboxItems(
            user.id,
            limit,
            offset
        );
        return {
            total: count,
            items: items.map((item) => ({
                uid: item.uid,
                title: item.title,
                content: item.content,
                created_at: item.created_at,
            })),
        };
    }

    if (category === 'pushed' || category === 'projects') {
        const pushed = await computePushed(user, timezone, today);
        if (category === 'projects') {
            const projects = await computeStagnantProjects(user, pushed, now);
            return {
                total: projects.length,
                items: projects.slice(offset, offset + limit),
            };
        }
        const page = pushed.slice(offset, offset + limit);
        const serialized = await serialize(
            page.map(({ task }) => task),
            timezone
        );
        return {
            total: pushed.length,
            items: page.map(({ push }, i) => ({
                task: serialized[i],
                push,
            })),
        };
    }

    const visible = await visibleTasksWhere(user.id);
    const { taskIds: somedayIds } = await repository.findSomedayIds(user.id);
    const where =
        category === 'later'
            ? laterWhere(somedayIds, today)
            : staleWhere(somedayIds, now);
    // Parked ideas whose review date has come go first, then the ones with
    // a date, then the rest, oldest first. Old tasks: least recently changed.
    const order =
        category === 'later'
            ? [
                  ['review_on', 'ASC NULLS LAST'],
                  ['created_at', 'ASC'],
                  ['id', 'ASC'],
              ]
            : [
                  ['updated_at', 'ASC'],
                  ['id', 'ASC'],
              ];
    const [total, tasks] = await Promise.all([
        repository.countOpenTasks(visible, where),
        repository.findOpenTasks(visible, where, {
            order,
            limit,
            offset,
            subQuery: false,
        }),
    ]);
    const serialized = await serialize(tasks, timezone);
    return {
        total,
        items: serialized.map((task) => ({
            task,
            review_due: Boolean(task.review_on && task.review_on <= today),
            last_activity_at: task.updated_at,
        })),
    };
}

// The week step: what the user committed to this week, what is in view,
// and planned time against the capacity they set (if any).
async function getWeek(user) {
    const timezone = getSafeTimezone(user.timezone);
    const today = todayOf(timezone);
    const weekStart = weekStartOf(today, user.first_day_of_week ?? 1);
    const visible = await visibleTasksWhere(user.id);
    const [committed, inView, settings] = await Promise.all([
        repository.findOpenTasks(
            visible,
            { week_of: weekStart },
            { order: [['id', 'ASC']] }
        ),
        repository.findOpenTasks(
            visible,
            {
                in_view_at: { [Op.ne]: null },
                [Op.or]: [
                    { week_of: null },
                    { week_of: { [Op.ne]: weekStart } },
                ],
            },
            { order: [['in_view_at', 'DESC']] }
        ),
        dailyPlanRepository.findUiSettings(user.id),
    ]);
    const capacity = settings.planning?.weekCapacityMinutes;
    const planned = committed.reduce(
        (sum, task) => sum + (task.estimated_minutes || 0),
        0
    );
    return {
        week_start: weekStart,
        week_end: addDays(weekStart, 6),
        committed: await serialize(committed, timezone),
        in_view: await serialize(inView, timezone),
        planned_minutes: planned,
        unestimated: committed.filter((task) => !task.estimated_minutes).length,
        capacity_minutes: Number.isInteger(capacity) ? capacity : null,
    };
}

async function saveWeekCapacity(user, minutes) {
    const value = minutes === null ? null : Number(minutes);
    if (
        value !== null &&
        (!Number.isInteger(value) || value < 0 || value > MAX_WEEK_CAPACITY)
    ) {
        throw new ValidationError(
            `capacity_minutes must be null or a whole number up to ${MAX_WEEK_CAPACITY}`
        );
    }
    const settings = await dailyPlanRepository.findUiSettings(user.id);
    const planning = { ...(settings.planning || {}) };
    if (value === null) delete planning.weekCapacityMinutes;
    else planning.weekCapacityMinutes = value;
    await dailyPlanRepository.saveUiSettings(user.id, {
        ...settings,
        planning,
    });
    return { capacity_minutes: value };
}

// A task's schedule history as the current user wrote it: every due date
// change with its kind, and the past plan days it was left unfinished.
async function getTaskHistory(user, task) {
    const timezone = getSafeTimezone(user.timezone);
    const today = todayOf(timezone);
    const [events, planDays] = await Promise.all([
        repository.findDueChangesForTask(task.id, user.id, HISTORY_LIMIT),
        repository.findPlanDaysForTask(user.id, task.id),
    ]);
    const changes = events
        .map((event) => ({
            ...classifyDueChange(event, timezone),
            created_at: event.created_at,
        }))
        .reverse();
    const missed = missedPlanDays(task, planDays, today, timezone);
    const pushes = collectPushes(changes, missed);
    return {
        ...summarize(pushes, today, task.reviewed_at, timezone),
        missed_plan_days: missed.length,
        created_at: task.created_at,
        last_activity_at: task.updated_at,
        reviewed_at: task.reviewed_at,
        history_complete: events.length < HISTORY_LIMIT,
        changes: changes.reverse(),
        missed_days: missed.sort().reverse(),
    };
}

async function markProjectReviewed(uid) {
    const project = await repository.markProjectReviewed(uid);
    if (!project) throw new NotFoundError('Project not found.');
    return { uid: project.uid, reviewed_at: project.reviewed_at };
}

module.exports = {
    CATEGORIES,
    markProjectReviewed,
    STALE_AFTER_DAYS,
    weekStartOf,
    localDay,
    getSummary,
    getCategory,
    getWeek,
    saveWeekCapacity,
    getTaskHistory,
};
