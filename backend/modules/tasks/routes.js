const express = require('express');
const router = express.Router();

// Import sub-routers for task-related routes
const attachmentsRouter = require('./attachments');
const eventsRouter = require('./events');
const relationsRouter = require('./relations/routes');
const { trackPushes, visiblePushes } = require('./dependencies/push');
const orderRouter = require('./order/routes');

const { Task, TaskAttachment, Project } = require('../../models');
const { numericIdParam } = require('../../middleware/numericIdParam');
const idempotency = require('../../middleware/idempotency');
const taskRepository = require('./repository');
const projectSectionsRepository = require('../project-sections/repository');
const {
    resetQueryCounter,
    getQueryStats,
    enableQueryLogging,
} = require('../../middleware/queryLogger');

const {
    calculateNextDueDate,
    calculateVirtualOccurrences,
} = require('./recurringTaskService');
const { logError } = require('../../services/logService');

const { serializeTask, serializeTasks } = require('./core/serializers');
const { updateTaskTags } = require('./operations/tags');
const { filterTasksByParams } = require('./queries/query-builders');
const {
    getSafeTimezone,
    getTodayBoundsInUTC,
    getUpcomingRangeInUTC,
} = require('../../utils/timezone-utils');
const permissionsService = require('../../services/permissionsService');

const {
    isValidTaskUid,
    validateProjectAccess,
    validateParentTaskAccess,
    validateDeferUntilAndDueDate,
    validateAreaAccess,
    validateGoalAccess,
    validateAssignee,
    getRecurringParentEndDate,
} = require('./utils/validation');
const {
    buildTaskAttributes,
    buildUpdateAttributes,
} = require('./core/builders');
const { createSubtasks, updateSubtasks } = require('./operations/subtasks');
const { requireQuota } = require('../../middleware/entitlements');
const { handleCompletionStatus } = require('./operations/completion');
const { captureOldValues, logTaskChanges } = require('./utils/logging');
const { logOccurrenceMove } = require('./taskEventService');
const decisionFields = require('../review/fields');
const { notifyAssignee } = require('./operations/assignment');
const { destroyTaskRows } = require('./operations/deletion');
const {
    handleParentChildOnStatusChange,
} = require('./operations/parent-child');
const { TASK_INCLUDES_WITH_SUBTASKS } = require('./utils/constants');

const {
    handleRecurringTasks,
    buildGroupedTasks,
    serializeGroupedTasks,
    addDashboardLists,
    addPerformanceHeaders,
} = require('./operations/list');

const {
    handleRecurrenceUpdate,
    calculateNextIterations,
    planOccurrenceAdvance,
    recordOccurrence,
    skipRecurringOccurrence,
} = require('./operations/recurring');

const {
    moveOccurrence,
    planOccurrenceEdit,
    restoreSeries,
    deleteOccurrence,
} = require('./operations/moveOccurrence');
const { ValidationError } = require('../../shared/errors');
const { getTaskMetrics } = require('./queries/metrics-computation');
const { getSmartTaskCounts } = require('./queries/smart-counts');
const scopeService = require('../../services/scopeService');
const dailyPlanService = require('../daily-plan/service');

const { getSubtasks } = require('./operations/subtasks');
const todoMd = require('../todo-md');

const {
    requireTaskReadAccess,
    requireTaskWriteAccess,
} = require('./middleware/access');

if (process.env.NODE_ENV === 'development') {
    enableQueryLogging();
}

function expandRecurringTasks(
    tasks,
    maxDays = 7,
    statusFilter = null,
    userTimezone = 'UTC'
) {
    const expandedTasks = [];
    const moment = require('moment-timezone');
    const now = moment.tz(userTimezone).startOf('day').toDate();

    tasks.forEach((task) => {
        const isRecurring =
            task.recurrence_type &&
            task.recurrence_type !== 'none' &&
            !task.recurring_parent_id;

        if (!isRecurring) {
            expandedTasks.push(task);
            return;
        }

        if (
            (statusFilter === 'completed' || statusFilter === 'done') &&
            (task.status === 2 || task.status === 'done')
        ) {
            expandedTasks.push(task);
            return;
        }

        let startFrom = task.due_date ? new Date(task.due_date) : now;

        if (task.status === 2 || task.status === 'done') {
            const baseDate =
                task.completion_based && task.completed_at
                    ? new Date(task.completed_at)
                    : new Date(task.due_date || now);
            const nextDate = calculateNextDueDate(task, baseDate, userTimezone);
            startFrom = nextDate || now;
        } else if (startFrom < now) {
            let nextDate = startFrom;
            let iterations = 0;
            const MAX_ITERATIONS = 100;

            while (nextDate && nextDate < now && iterations < MAX_ITERATIONS) {
                nextDate = calculateNextDueDate(task, nextDate, userTimezone);
                iterations++;
            }

            startFrom = nextDate || now;
        }

        const occurrences = calculateVirtualOccurrences(
            task,
            maxDays,
            startFrom,
            userTimezone
        );

        occurrences.forEach((occurrence, index) => {
            const virtualTask = {
                ...(task.toJSON ? task.toJSON() : task),
                due_date: occurrence.due_date,
                is_virtual_occurrence: true,
                occurrence_index: index,
                virtual_id: `${task.id}_occurrence_${index}`,
            };
            expandedTasks.push(virtualTask);
        });
    });

    return expandedTasks;
}

// Calendar: keeps every task as stored and adds the later occurrences of
// each open recurring parent up to `endDay` (YYYY-MM-DD, user timezone).
// Days that already have a generated instance are skipped.
function expandCalendarOccurrences(tasks, endDay, userTimezone = 'UTC') {
    const moment = require('moment-timezone');
    const localDay = (date) =>
        typeof date === 'string'
            ? date.slice(0, 10)
            : moment.utc(date).tz(userTimezone).format('YYYY-MM-DD');
    const instanceDays = new Set(
        tasks
            .filter((t) => t.recurring_parent_id && t.due_date)
            .map((t) => `${t.recurring_parent_id}:${localDay(t.due_date)}`)
    );
    const expanded = [];

    tasks.forEach((task) => {
        expanded.push(task);
        const isOpenParent =
            task.recurrence_type &&
            task.recurrence_type !== 'none' &&
            !task.recurring_parent_id &&
            task.due_date &&
            ![2, 3, 5, 'done', 'archived', 'cancelled'].includes(task.status);
        if (!isOpenParent) return;

        // The first occurrence is the parent's own due date.
        calculateVirtualOccurrences(task, 100, task.due_date, userTimezone)
            .slice(1)
            .forEach((occurrence, index) => {
                const day = localDay(occurrence.due_date);
                if (day > endDay) return;
                if (instanceDays.has(`${task.id}:${day}`)) return;
                expanded.push({
                    ...(task.toJSON ? task.toJSON() : task),
                    due_date: occurrence.due_date,
                    is_virtual_occurrence: true,
                    occurrence_index: index + 1,
                    virtual_id: `${task.id}_occurrence_${index + 1}`,
                });
            });
    });

    return expanded;
}

router.get('/tasks', async (req, res) => {
    const startTime = Date.now();
    resetQueryCounter();

    try {
        const {
            type,
            groupBy,
            maxDays,
            order_by,
            include_lists,
            limit: limitParam,
            offset: offsetParam,
        } = req.query;
        const { id: userId, timezone, language } = req.currentUser;

        await handleRecurringTasks(userId, type);

        // One resolved scope (area_uid / project_uid / tags) serves the
        // list, the upcoming projects and the Today lists alike.
        const scope = await scopeService.resolveScope(req.query, userId);

        const hasPagination =
            limitParam !== undefined || offsetParam !== undefined;
        const limit = parseInt(limitParam, 10) || 20;
        const offset = parseInt(offsetParam, 10) || 0;
        // Today and upcoming-by-day expand or filter the list in memory, so
        // they page after that; everything else pages in the database.
        const sqlPagination =
            hasPagination &&
            type !== 'today' &&
            !(type === 'upcoming' && groupBy === 'day');

        let tasks;
        let totalCount;
        if (sqlPagination) {
            const paged = await filterTasksByParams(
                req.query,
                userId,
                timezone,
                null,
                { limit, offset },
                scope
            );
            tasks = paged.rows;
            totalCount = paged.count;
        } else {
            tasks = await filterTasksByParams(
                req.query,
                userId,
                timezone,
                null,
                null,
                scope
            );
        }

        // Fetch projects with upcoming due dates for the upcoming view
        let upcomingProjects = [];
        if (type === 'upcoming') {
            const safeTimezone = getSafeTimezone(timezone);
            const upcomingRange = getUpcomingRangeInUTC(safeTimezone, 7);
            const { Op } = require('sequelize');

            // Get projects owned by user or shared with user
            const ownedOrShared =
                await permissionsService.ownershipOrPermissionWhere(
                    'project',
                    userId
                );

            upcomingProjects = await Project.findAll({
                where: scopeService.withScope(
                    {
                        ...ownedOrShared,
                        due_date_at: {
                            [Op.between]: [
                                upcomingRange.start,
                                upcomingRange.end,
                            ],
                        },
                        status: {
                            [Op.notIn]: ['done', 'cancelled'],
                        },
                    },
                    await scopeService.projectScopeWhere(scope)
                ),
                order: [['due_date_at', 'ASC NULLS FIRST']],
            });
        }

        if (type === 'upcoming' && groupBy === 'day') {
            const days = maxDays ? parseInt(maxDays, 10) : 7;
            const safeTimezone = getSafeTimezone(timezone);
            tasks = expandRecurringTasks(
                tasks,
                days,
                req.query.status,
                safeTimezone
            );
        }

        if (
            type === 'calendar' &&
            /^\d{4}-\d{2}-\d{2}$/.test(req.query.end || '')
        ) {
            const safeTimezone = getSafeTimezone(timezone);
            tasks = expandCalendarOccurrences(
                tasks,
                req.query.end,
                safeTimezone
            );
        }

        if (type === 'today') {
            const safeTimezone = getSafeTimezone(timezone);
            const todayBounds = getTodayBoundsInUTC(safeTimezone);

            const instancesForToday = tasks.filter(
                (t) =>
                    t.recurring_parent_id &&
                    t.due_date &&
                    new Date(t.due_date) >= todayBounds.start &&
                    new Date(t.due_date) <= todayBounds.end
            );

            const parentIdsWithTodayInstances = new Set(
                instancesForToday.map((t) => t.recurring_parent_id)
            );

            tasks = tasks.filter(
                (t) =>
                    !t.recurrence_type ||
                    t.recurrence_type === 'none' ||
                    t.recurring_parent_id !== null ||
                    !parentIdsWithTodayInstances.has(t.id)
            );
        }

        if (totalCount === undefined) totalCount = tasks.length;
        let paginatedTasks = tasks;

        if (hasPagination && !sqlPagination) {
            paginatedTasks = tasks.slice(offset, offset + limit);
        }

        const groupedTasks = await buildGroupedTasks(
            paginatedTasks,
            type,
            groupBy,
            maxDays,
            order_by,
            timezone,
            language || 'en'
        );

        const serializationOptions =
            type === 'today' || type === 'calendar'
                ? { preserveOriginalName: true }
                : {};

        const response = {
            tasks: await serializeTasks(
                paginatedTasks,
                timezone,
                serializationOptions
            ),
        };

        const serializedGrouped = await serializeGroupedTasks(
            groupedTasks,
            timezone
        );
        if (serializedGrouped) {
            response.groupedTasks = serializedGrouped;
        }

        // Add upcoming projects to response
        if (type === 'upcoming' && upcomingProjects.length > 0) {
            response.projects = upcomingProjects.map((project) => ({
                id: project.id,
                uid: project.uid,
                name: project.name,
                status: project.status,
                priority: project.priority,
                due_date_at: project.due_date_at,
                created_at: project.created_at,
                updated_at: project.updated_at,
            }));
        }

        await addDashboardLists(
            response,
            userId,
            timezone,
            type,
            include_lists,
            serializationOptions,
            await scopeService.taskScopeWhere(scope)
        );

        if (hasPagination) {
            response.pagination = {
                total: totalCount,
                limit: limit,
                offset: offset,
                hasMore: offset + paginatedTasks.length < totalCount,
            };
        }

        addPerformanceHeaders(res, startTime, getQueryStats());
        res.json(response);
    } catch (error) {
        logError('Error fetching tasks:', error);
        if (error.message === 'Invalid order column specified.') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/tasks/metrics', async (req, res) => {
    try {
        const response = await getTaskMetrics(
            req.currentUser.id,
            req.currentUser.timezone,
            req.query.type
        );

        res.json(response);
    } catch (error) {
        logError('Error fetching task metrics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/tasks/smart-counts', async (req, res) => {
    try {
        const counts = await getSmartTaskCounts(
            req.currentUser.id,
            req.currentUser.timezone
        );
        res.json(counts);
    } catch (error) {
        logError('Error fetching smart task counts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Tasks mirrored from a TODO.md file keep their name, note, done box and
// project in the file (todo-md/policy.js); the rest is edited here as usual.
const patchGuards = [requireTaskWriteAccess, todoMd.guards.patchTaskGuard];
const deleteTaskGuards = [requireTaskWriteAccess, todoMd.guards.refuseFileTask];
const taskWriteGuards = [requireTaskWriteAccess];
const editGuards = [requireTaskWriteAccess, todoMd.guards.occurrenceEditGuard];

router.post(
    '/task',
    requireQuota(
        'task',
        (req) =>
            1 +
            (Array.isArray(req.body?.subtasks) ? req.body.subtasks.length : 0)
    ),
    async (req, res) => {
        try {
            const {
                name,
                project_id,
                project_uid,
                area_id,
                area_uid,
                goal_id,
                parent_task_id,
                tags,
                Tags,
                subtasks,
            } = req.body;
            const tagsData = tags || Tags;

            if (!name || name.trim() === '') {
                return res
                    .status(400)
                    .json({ error: 'Task name is required.' });
            }

            const timezone = getSafeTimezone(req.currentUser.timezone);
            const taskAttributes = buildTaskAttributes(
                req.body,
                req.currentUser.id,
                timezone
            );

            try {
                // Fetch parent end date if this is a recurring instance
                const recurringParentEndDate = await getRecurringParentEndDate(
                    req.body.recurring_parent_id,
                    req.currentUser.id
                );

                validateDeferUntilAndDueDate(
                    taskAttributes.defer_until,
                    taskAttributes.due_date,
                    recurringParentEndDate
                );
            } catch (error) {
                return res.status(400).json({ error: error.message });
            }

            try {
                const validProjectId = await validateProjectAccess(
                    project_uid || project_id,
                    req.currentUser.id
                );
                if (validProjectId) taskAttributes.project_id = validProjectId;
            } catch (error) {
                return res
                    .status(error.message === 'Forbidden' ? 403 : 400)
                    .json({ error: error.message });
            }

            try {
                const validAreaId = await validateAreaAccess(
                    area_uid || area_id,
                    req.currentUser.id
                );
                if (validAreaId) taskAttributes.area_id = validAreaId;
            } catch (error) {
                return res.status(400).json({ error: error.message });
            }

            try {
                const validParentId = await validateParentTaskAccess(
                    parent_task_id,
                    req.currentUser.id
                );
                if (validParentId)
                    taskAttributes.parent_task_id = validParentId;
            } catch (error) {
                return res.status(400).json({ error: error.message });
            }

            try {
                const validGoalId = await validateGoalAccess(
                    goal_id,
                    req.currentUser.id
                );
                if (validGoalId) taskAttributes.goal_id = validGoalId;
            } catch (error) {
                return res.status(400).json({ error: error.message });
            }

            try {
                await validateAssignee(
                    taskAttributes.assigned_to,
                    req.currentUser.id,
                    { projectId: taskAttributes.project_id }
                );
            } catch (error) {
                return res.status(400).json({ error: error.message });
            }

            const fileProject = taskAttributes.project_id
                ? await Project.findByPk(taskAttributes.project_id)
                : null;
            let task;
            if (
                todoMd.service.isFileBackedProject(fileProject) &&
                todoMd.service.asksForFile(tagsData, req.body.todo_section)
            ) {
                // The bullet goes into the project's TODO.md; subtasks have
                // no place in that file.
                try {
                    task = await todoMd.service.createTask(fileProject, {
                        name: req.body.name,
                        note: req.body.note,
                        section: req.body.todo_section,
                    });
                } catch (error) {
                    if (error instanceof todoMd.service.TodoMdError) {
                        return todoMd.guards.sendError(res, error);
                    }
                    throw error;
                }
            } else {
                task = await taskRepository.create(taskAttributes);
                await updateTaskTags(task, tagsData, req.currentUser.id);
                await createSubtasks(task.id, subtasks, req.currentUser.id);
            }
            if (req.body.today === true) {
                await dailyPlanService.setTaskOnToday(
                    req.currentUser,
                    task.uid,
                    true
                );
            }

            const taskWithAssociations = await taskRepository.findById(
                task.id,
                {
                    include: TASK_INCLUDES_WITH_SUBTASKS,
                }
            );

            if (!taskWithAssociations) {
                logError('Failed to reload created task:', task.id);
                const fallbackTask = {
                    ...task.toJSON(),
                    tags: [],
                    Project: null,
                    subtasks: [],
                    today_move_count: 0,
                    due_date: task.due_date
                        ? task.due_date instanceof Date
                            ? task.due_date.toISOString().split('T')[0]
                            : new Date(task.due_date)
                                  .toISOString()
                                  .split('T')[0]
                        : null,
                    completed_at: task.completed_at
                        ? task.completed_at instanceof Date
                            ? task.completed_at.toISOString()
                            : new Date(task.completed_at).toISOString()
                        : null,
                };
                return res.status(201).json(fallbackTask);
            }

            await notifyAssignee(
                taskWithAssociations,
                null,
                req.currentUser.id
            );

            const serializedTask = await serializeTask(
                taskWithAssociations,
                req.currentUser.timezone,
                { skipDisplayNameTransform: true }
            );

            res.set({
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                Pragma: 'no-cache',
                Expires: '0',
            });

            res.status(201).json(serializedTask);
        } catch (error) {
            logError('Error creating task:', error);
            logError('Error stack:', error.stack);
            logError('Error name:', error.name);
            res.status(400).json({
                error: 'There was a problem creating the task.',
                details: error.errors
                    ? error.errors.map((e) => e.message)
                    : [error.message],
            });
        }
    }
);

router.param('uid', numericIdParam('task', Task));

router.get('/task/:uid', requireTaskReadAccess, async (req, res) => {
    try {
        const task = await taskRepository.findByUid(req.params.uid, {
            include: TASK_INCLUDES_WITH_SUBTASKS,
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        const serializedTask = await serializeTask(
            task,
            req.currentUser.timezone,
            { skipDisplayNameTransform: true }
        );

        res.json(serializedTask);
    } catch (error) {
        logError('Error fetching task:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// A PATCH refused before the task is written; the route answers with it.
class PatchRefused extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// Applies a PATCH body to a loaded task (with TASK_INCLUDES_WITH_SUBTASKS):
// the task page, API clients and an edited occurrence of a recurring series
// all go through these rules and this logging.
async function applyTaskPatch(task, body, req) {
    const {
        status,
        project_id,
        project_uid,
        area_id,
        area_uid,
        goal_id,
        parent_task_id,
        tags,
        Tags,
        subtasks,
        recurrence_type,
        recurrence_interval,
        recurrence_end_date,
        recurrence_weekday,
        recurrence_weekdays,
        recurrence_month_day,
        recurrence_week_of_month,
        completion_based,
        update_parent_recurrence,
    } = body;

    const tagsData = tags || Tags;

    const oldValues = captureOldValues(task);
    const oldStatus = task.status;

    if (update_parent_recurrence && task.recurring_parent_id) {
        const parentTask = await taskRepository.findByIdAndUser(
            task.recurring_parent_id,
            req.currentUser.id
        );

        if (parentTask) {
            await parentTask.update({
                recurrence_type:
                    recurrence_type !== undefined
                        ? recurrence_type
                        : parentTask.recurrence_type,
                recurrence_interval:
                    recurrence_interval !== undefined
                        ? recurrence_interval
                        : parentTask.recurrence_interval,
                recurrence_end_date:
                    recurrence_end_date !== undefined
                        ? recurrence_end_date
                        : parentTask.recurrence_end_date,
                recurrence_weekday:
                    recurrence_weekday !== undefined
                        ? recurrence_weekday
                        : parentTask.recurrence_weekday,
                recurrence_weekdays:
                    recurrence_weekdays !== undefined
                        ? recurrence_weekdays
                        : parentTask.recurrence_weekdays,
                recurrence_month_day:
                    recurrence_month_day !== undefined
                        ? recurrence_month_day
                        : parentTask.recurrence_month_day,
                recurrence_week_of_month:
                    recurrence_week_of_month !== undefined
                        ? recurrence_week_of_month
                        : parentTask.recurrence_week_of_month,
                completion_based:
                    completion_based !== undefined
                        ? completion_based
                        : parentTask.completion_based,
            });
        }
    }

    const timezone = getSafeTimezone(req.currentUser.timezone);
    const taskAttributes = buildUpdateAttributes(body, task, timezone);
    try {
        decisionFields.applyDecisionFields(
            taskAttributes,
            body,
            task,
            req.currentUser
        );
    } catch (error) {
        throw new PatchRefused(400, error.message);
    }

    try {
        const finalDeferUntil =
            taskAttributes.defer_until !== undefined
                ? taskAttributes.defer_until
                : task.defer_until;
        const finalDueDate =
            taskAttributes.due_date !== undefined
                ? taskAttributes.due_date
                : task.due_date;

        // Fetch parent end date if this is a recurring instance
        const recurringParentEndDate = await getRecurringParentEndDate(
            task.recurring_parent_id,
            req.currentUser.id
        );

        validateDeferUntilAndDueDate(
            finalDeferUntil,
            finalDueDate,
            recurringParentEndDate
        );
    } catch (error) {
        throw new PatchRefused(400, error.message);
    }

    await handleCompletionStatus(taskAttributes, status, task);

    const projectIdentifier =
        project_uid !== undefined ? project_uid : project_id;
    if (projectIdentifier !== undefined) {
        try {
            const validProjectId = await validateProjectAccess(
                projectIdentifier,
                req.currentUser.id
            );
            taskAttributes.project_id = validProjectId;
        } catch (error) {
            throw new PatchRefused(
                error.message === 'Forbidden' ? 403 : 400,
                error.message
            );
        }
    }

    const areaIdentifier = area_uid !== undefined ? area_uid : area_id;
    if (areaIdentifier !== undefined) {
        try {
            const validAreaId = await validateAreaAccess(
                areaIdentifier,
                req.currentUser.id
            );
            taskAttributes.area_id = validAreaId;
        } catch (error) {
            throw new PatchRefused(400, error.message);
        }
    }

    if (parent_task_id !== undefined) {
        if (parent_task_id && parent_task_id.toString().trim()) {
            try {
                const validParentId = await validateParentTaskAccess(
                    parent_task_id,
                    req.currentUser.id
                );
                taskAttributes.parent_task_id = validParentId;
            } catch (error) {
                throw new PatchRefused(400, error.message);
            }
        } else {
            taskAttributes.parent_task_id = null;
        }
    }

    if (goal_id !== undefined) {
        if (goal_id && goal_id.toString().trim()) {
            try {
                const validGoalId = await validateGoalAccess(
                    goal_id,
                    req.currentUser.id
                );
                taskAttributes.goal_id = validGoalId;
            } catch (error) {
                throw new PatchRefused(400, error.message);
            }
        } else {
            taskAttributes.goal_id = null;
        }
    }

    // Board column. It must belong to the task's (new) project, and a
    // task that changes project leaves its old project's column.
    const finalProjectId =
        taskAttributes.project_id !== undefined
            ? taskAttributes.project_id
            : task.project_id;
    if (body.section_uid !== undefined) {
        const sectionUid = body.section_uid;
        if (sectionUid) {
            const section = await projectSectionsRepository.findByUid(
                String(sectionUid)
            );
            if (
                !section ||
                !finalProjectId ||
                section.project_id !== finalProjectId
            ) {
                throw new PatchRefused(
                    400,
                    "Section does not belong to the task's project."
                );
            }
            taskAttributes.section_id = section.id;
        } else {
            taskAttributes.section_id = null;
        }
        // A card moved to another column goes to its end.
        if ((taskAttributes.section_id || null) !== (task.section_id || null)) {
            taskAttributes.section_position = null;
        }
    } else if (
        task.section_id &&
        (finalProjectId || null) !== (task.project_id || null)
    ) {
        taskAttributes.section_id = null;
        taskAttributes.section_position = null;
    }

    if (taskAttributes.assigned_to) {
        try {
            await validateAssignee(
                taskAttributes.assigned_to,
                req.currentUser.id,
                {
                    projectId:
                        taskAttributes.project_id !== undefined
                            ? taskAttributes.project_id
                            : task.project_id,
                    currentAssignedTo: task.assigned_to,
                }
            );
        } catch (error) {
            throw new PatchRefused(400, error.message);
        }
    }

    const recurrenceFields = [
        'recurrence_type',
        'recurrence_interval',
        'recurrence_end_date',
        'recurrence_weekday',
        'recurrence_weekdays',
        'recurrence_month_day',
        'recurrence_week_of_month',
        'completion_based',
    ];

    const recurrenceChanged = await handleRecurrenceUpdate(
        task,
        recurrenceFields,
        body
    );

    let recurringOccurrence = null;

    if (
        status !== undefined &&
        (taskAttributes.status === Task.STATUS.DONE ||
            taskAttributes.status === 'done')
    ) {
        recurringOccurrence = planOccurrenceAdvance(task, {
            overrides: taskAttributes,
            timezone,
        });

        if (recurringOccurrence?.hasNext) {
            taskAttributes.status = Task.STATUS.NOT_STARTED;
            taskAttributes.completed_at = null;
            taskAttributes.due_date = recurringOccurrence.nextDueDate;
            Object.assign(taskAttributes, recurringOccurrence.reminderFields);
        }
    }

    console.log('[routes.js] Before task.update - taskAttributes:', {
        status: taskAttributes.status,
        completed_at: taskAttributes.completed_at,
    });

    // An example from the welcome screen becomes the user's own task
    // the first time they change anything about it.
    if (task.example_of) taskAttributes.example_of = null;

    await task.update(taskAttributes);

    console.log('[routes.js] After task.update - task values:', {
        id: task.id,
        status: task.status,
        completed_at: task.completed_at,
    });

    // Defensive check: ensure completed_at is null if status is not DONE
    if (
        taskAttributes.status !== undefined &&
        taskAttributes.status !== Task.STATUS.DONE &&
        taskAttributes.status !== 'done' &&
        task.completed_at !== null
    ) {
        console.log(
            '[routes.js] DEFENSIVE CHECK TRIGGERED - Force clearing completed_at'
        );
        // Force clear completed_at if it wasn't cleared properly
        await task.update({ completed_at: null });
        console.log(
            '[routes.js] After defensive update - completed_at:',
            task.completed_at
        );
    }

    if (status !== undefined) {
        await handleParentChildOnStatusChange(
            task,
            oldStatus,
            taskAttributes.status,
            req.currentUser.id
        );
    }

    if (recurringOccurrence) {
        await recordOccurrence(task, recurringOccurrence, req.currentUser.id);
    }

    await updateTaskTags(task, tagsData, req.currentUser.id);
    const parked = await decisionFields.applyLater(
        task,
        body,
        req.currentUser.id
    );
    await updateSubtasks(task.id, subtasks, req.currentUser.id);
    if (parked && body.today === undefined) {
        await dailyPlanService.setTaskOnToday(req.currentUser, task.uid, false);
    }
    if (decisionFields.wantsUnplan(body)) {
        await dailyPlanService.takeTaskOffPlansFrom(req.currentUser, task);
    }
    if (typeof body.today === 'boolean') {
        await dailyPlanService.setTaskOnToday(
            req.currentUser,
            task.uid,
            body.today
        );
    }
    await logTaskChanges(task, oldValues, body, tagsData, req.currentUser.id, {
        source: req.authToken ? 'api' : 'web',
        // Completing a recurring task moves its due date itself;
        // recordOccurrence logs that.
        skipDueDate: Boolean(recurringOccurrence?.hasNext),
    });

    const taskWithAssociations = await taskRepository.findById(task.id, {
        include: TASK_INCLUDES_WITH_SUBTASKS,
    });
    await notifyAssignee(
        taskWithAssociations,
        oldValues.assigned_to,
        req.currentUser.id
    );
    return taskWithAssociations;
}

// A client retrying a lost answer (desktop "Terminé") sends the same
// Idempotency-Key, so a recurring task advances once.
router.patch('/task/:uid', patchGuards, idempotency, async (req, res) => {
    try {
        const task = await taskRepository.findByUid(req.params.uid, {
            include: TASK_INCLUDES_WITH_SUBTASKS,
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        // Tasks this one blocks may be pushed later (tasks/dependencies).
        const { value: taskWithAssociations, pushed } = await trackPushes(() =>
            applyTaskPatch(task, req.body, req)
        );

        const serializedTask = await serializeTask(
            taskWithAssociations,
            req.currentUser.timezone,
            { skipDisplayNameTransform: true }
        );

        res.json({
            ...serializedTask,
            pushed_tasks: await visiblePushes(pushed, req.currentUser.id),
        });
    } catch (error) {
        if (error instanceof PatchRefused) {
            return res.status(error.status).json({ error: error.message });
        }
        logError('Error updating task:', error);
        res.status(400).json({
            error: 'There was a problem updating the task.',
            details: error.errors
                ? error.errors.map((e) => e.message)
                : [error.message],
        });
    }
});

// Deletes a task. A series' generated instances go too, except past ones,
// which stay as plain tasks.
async function deleteTaskAndInstances(task) {
    const taskId = task.id;

    const childTasks = await taskRepository.findRecurringChildren(taskId);

    if (childTasks.length > 0) {
        const now = new Date();

        const futureInstances = childTasks.filter((child) => {
            if (!child.due_date) return true;
            return new Date(child.due_date) > now;
        });

        const pastInstances = childTasks.filter((child) => {
            if (!child.due_date) return false;
            return new Date(child.due_date) <= now;
        });

        for (const futureInstance of futureInstances) {
            await futureInstance.destroy();
        }

        for (const pastInstance of pastInstances) {
            await pastInstance.update({
                recurring_parent_id: null,
                recurrence_type: 'none',
                recurrence_interval: null,
                recurrence_end_date: null,
                recurrence_weekday: null,
                recurrence_month_day: null,
                recurrence_week_of_month: null,
                completion_based: false,
            });
        }
    }

    await destroyTaskRows(task);
}

router.delete('/task/:uid', deleteTaskGuards, async (req, res) => {
    try {
        const task = await taskRepository.findByUid(req.params.uid, {
            include: [{ model: TaskAttachment, as: 'Attachments' }],
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        await deleteTaskAndInstances(task);

        res.json({ message: 'Task successfully deleted' });
    } catch (error) {
        res.status(400).json({
            error: 'There was a problem deleting the task.',
        });
    }
});

router.get('/task/:uid/subtasks', async (req, res) => {
    try {
        if (!isValidTaskUid(req.params.uid)) {
            return res.status(400).json({ error: 'Invalid UID' });
        }

        const task = await taskRepository.findByUid(req.params.uid);
        if (!task) {
            return res.json([]);
        }

        const result = await getSubtasks(
            task.id,
            req.currentUser.id,
            req.currentUser.timezone
        );

        if (result.error === 'Forbidden') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        if (result.error === 'Not found') {
            return res.json([]);
        }

        res.json(result.subtasks);
    } catch (error) {
        logError('Error fetching subtasks:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/task/:uid/next-iterations', async (req, res) => {
    try {
        if (!isValidTaskUid(req.params.uid)) {
            return res.status(400).json({ error: 'Invalid UID' });
        }

        const task = await taskRepository.findByUid(req.params.uid);

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Verify user owns this task
        if (task.user_id !== req.currentUser.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!task.recurrence_type || task.recurrence_type === 'none') {
            return res.json({ iterations: [] });
        }

        const iterations = await calculateNextIterations(
            task,
            req.query.startFromDate,
            req.currentUser.timezone
        );

        res.json({ iterations });
    } catch (error) {
        logError('Error getting next iterations:', error);
        res.status(500).json({ error: 'Failed to get next iterations' });
    }
});

// « Transformer en projet » (docs/37-links.md).
router.post('/task/:uid/to-project', async (req, res) => {
    try {
        const { taskToProject } = require('./operations/toProject');
        res.status(201).json(
            await taskToProject(req.currentUser.id, req.params.uid)
        );
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        logError('Task to project failed:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/task/:uid/skip-occurrence', taskWriteGuards, async (req, res) => {
    try {
        const task = await taskRepository.findByUid(req.params.uid);

        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        const result = await skipRecurringOccurrence(
            task,
            req.currentUser.id,
            req.currentUser.timezone
        );

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        const taskWithAssociations = await taskRepository.findById(task.id, {
            include: TASK_INCLUDES_WITH_SUBTASKS,
        });

        res.json(
            await serializeTask(
                taskWithAssociations,
                req.currentUser.timezone,
                { skipDisplayNameTransform: true }
            )
        );
    } catch (error) {
        logError('Error skipping recurring occurrence:', error);
        res.status(500).json({ error: 'Failed to skip occurrence' });
    }
});

const occurrenceSource = (req) => (req.authToken ? 'api' : 'web');

// The review reads a moved occurrence as any other due date change.
async function logMovedOccurrence(req, seriesId, fromDay, toDay, scope) {
    try {
        await logOccurrenceMove(seriesId, req.currentUser.id, fromDay, toDay, {
            source: occurrenceSource(req),
            scope,
        });
    } catch (error) {
        logError('Error logging moved occurrence:', error);
    }
}

const serializeById = async (req, id) =>
    serializeTask(
        await taskRepository.findById(id, {
            include: TASK_INCLUDES_WITH_SUBTASKS,
        }),
        req.currentUser.timezone,
        { skipDisplayNameTransform: true }
    );

router.post('/task/:uid/move-occurrence', taskWriteGuards, async (req, res) => {
    try {
        const task = await taskRepository.findByUid(req.params.uid);

        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        const { task: parent, moved } = await moveOccurrence(task, {
            scope: req.body.scope,
            occurrenceDate: req.body.occurrence_date,
            dueDate: req.body.due_date,
            timezone: req.currentUser.timezone,
        });

        await logMovedOccurrence(
            req,
            parent.id,
            req.body.occurrence_date,
            req.body.due_date,
            req.body.scope
        );

        res.json({
            task: await serializeById(req, parent.id),
            moved: moved ? await serializeById(req, moved.id) : null,
        });
    } catch (error) {
        if (error instanceof ValidationError) {
            return res.status(400).json({ error: error.message });
        }
        logError('Error moving recurring occurrence:', error);
        res.status(500).json({ error: 'Failed to move occurrence' });
    }
});

// Edits one occurrence of a recurring series, the occurrence and the
// following ones, or the whole series. The occurrence is first split off
// (moveOccurrence, to its new day if `changes.due_date` names one), then the
// changes go through the same rules as PATCH /task/:uid, on the task that
// now holds it.
router.post('/task/:uid/edit-occurrence', editGuards, async (req, res) => {
    try {
        const task = await taskRepository.findByUid(req.params.uid);

        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        const { scope, occurrence_date: occurrenceDate } = req.body;
        const timezone = req.currentUser.timezone;
        const { dueDate, patch, onSeries, before } = planOccurrenceEdit(task, {
            scope,
            occurrenceDate,
            changes: req.body.changes,
            timezone,
        });

        const { task: series, moved } = await moveOccurrence(task, {
            scope,
            occurrenceDate,
            dueDate,
            timezone,
        });
        const target = onSeries ? series : moved;

        try {
            await applyTaskPatch(
                await taskRepository.findById(target.id, {
                    include: TASK_INCLUDES_WITH_SUBTASKS,
                }),
                patch,
                req
            );
        } catch (error) {
            await restoreSeries(series, before, onSeries ? null : moved);
            throw error;
        }

        await logMovedOccurrence(
            req,
            series.id,
            occurrenceDate,
            dueDate,
            scope
        );

        res.json({
            task: await serializeById(req, series.id),
            edited: await serializeById(req, target.id),
        });
    } catch (error) {
        if (error instanceof ValidationError) {
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof PatchRefused) {
            return res.status(error.status).json({ error: error.message });
        }
        logError('Error editing recurring occurrence:', error);
        res.status(400).json({
            error: 'There was a problem updating the task.',
            details: error.errors
                ? error.errors.map((e) => e.message)
                : [error.message],
        });
    }
});

// Deletes one occurrence of a recurring series (skips the current one,
// leaves a later one out), the occurrence and the following ones (the series
// ends the day before), or the whole series.
router.post(
    '/task/:uid/delete-occurrence',
    deleteTaskGuards,
    async (req, res) => {
        try {
            const task = await taskRepository.findByUid(req.params.uid, {
                include: [{ model: TaskAttachment, as: 'Attachments' }],
            });

            if (!task) {
                return res.status(404).json({ error: 'Task not found.' });
            }

            const { deleteSeries } = await deleteOccurrence(task, {
                scope: req.body.scope,
                occurrenceDate: req.body.occurrence_date,
                timezone: req.currentUser.timezone,
                userId: req.currentUser.id,
            });

            if (deleteSeries) {
                await deleteTaskAndInstances(task);
                return res.json({ task: null, deleted: true });
            }

            res.json({
                task: await serializeById(req, task.id),
                deleted: false,
            });
        } catch (error) {
            if (error instanceof ValidationError) {
                return res.status(400).json({ error: error.message });
            }
            logError('Error deleting recurring occurrence:', error);
            res.status(500).json({ error: 'Failed to delete occurrence' });
        }
    }
);

// Mount sub-routers for task-related routes
router.use(attachmentsRouter);
router.use(eventsRouter);
router.use(relationsRouter);
router.use(orderRouter);

module.exports = router;
