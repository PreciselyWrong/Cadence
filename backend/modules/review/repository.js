'use strict';

const { Op } = require('sequelize');
const {
    Task,
    TaskEvent,
    Project,
    Tag,
    InboxItem,
    DailyPlan,
    DailyPlanItem,
    sequelize,
} = require('../../models');

const OPEN_STATUSES_EXCLUDED = [
    Task.STATUS.DONE,
    Task.STATUS.ARCHIVED,
    Task.STATUS.CANCELLED,
];

const reviewRepository = {
    // The user's own due date changes since a moment, oldest first. Only
    // the columns the classifier reads.
    async findDueChangesByUser(userId, since) {
        return TaskEvent.findAll({
            where: {
                user_id: userId,
                event_type: 'due_date_changed',
                created_at: { [Op.gte]: since },
            },
            attributes: [
                'id',
                'task_id',
                'old_value',
                'new_value',
                'metadata',
                'created_at',
            ],
            order: [['created_at', 'ASC']],
        });
    },

    async findDueChangesForTask(taskId, userId, limit) {
        return TaskEvent.findAll({
            where: {
                task_id: taskId,
                user_id: userId,
                event_type: 'due_date_changed',
            },
            attributes: [
                'id',
                'task_id',
                'old_value',
                'new_value',
                'metadata',
                'created_at',
            ],
            order: [['created_at', 'DESC']],
            limit,
        });
    },

    // { task_id: [plan_date, ...] } for the user's plans in [from, to].
    async findPlanDaysByUser(userId, from, to, taskId = null) {
        const plans = await DailyPlan.findAll({
            where: {
                user_id: userId,
                plan_date: { [Op.between]: [from, to] },
            },
            attributes: ['id', 'plan_date'],
            raw: true,
        });
        if (plans.length === 0) return new Map();
        const dateById = new Map(plans.map((p) => [p.id, p.plan_date]));
        const where = { daily_plan_id: { [Op.in]: [...dateById.keys()] } };
        if (taskId) where.task_id = taskId;
        const items = await DailyPlanItem.findAll({
            where,
            attributes: ['task_id', 'daily_plan_id'],
            raw: true,
        });
        const byTask = new Map();
        for (const item of items) {
            const day = String(dateById.get(item.daily_plan_id)).slice(0, 10);
            if (!byTask.has(item.task_id)) byTask.set(item.task_id, []);
            byTask.get(item.task_id).push(day);
        }
        return byTask;
    },

    async findPlanDaysForTask(userId, taskId) {
        const plans = await DailyPlan.findAll({
            where: { user_id: userId },
            attributes: ['plan_date'],
            include: [
                {
                    model: DailyPlanItem,
                    as: 'Items',
                    where: { task_id: taskId },
                    attributes: [],
                    required: true,
                },
            ],
            raw: true,
        });
        return plans.map((p) => String(p.plan_date).slice(0, 10));
    },

    // Open tasks among the ids that the user may see.
    async findOpenTasks(visibleWhere, extraWhere = {}, options = {}) {
        return Task.findAll({
            where: {
                [Op.and]: [
                    visibleWhere,
                    { status: { [Op.notIn]: OPEN_STATUSES_EXCLUDED } },
                    extraWhere,
                ],
            },
            include: [
                {
                    model: Project,
                    attributes: ['id', 'uid', 'name', 'status'],
                    required: false,
                },
                {
                    model: Tag,
                    attributes: ['id', 'uid', 'name'],
                    through: { attributes: [] },
                    required: false,
                },
            ],
            ...options,
        });
    },

    async countOpenTasks(visibleWhere, extraWhere = {}) {
        return Task.count({
            where: {
                [Op.and]: [
                    visibleWhere,
                    { status: { [Op.notIn]: OPEN_STATUSES_EXCLUDED } },
                    extraWhere,
                ],
            },
            distinct: true,
            col: 'id',
        });
    },

    // Ids of tasks and projects carrying the user's #someday tag.
    async findSomedayIds(userId) {
        const [tasks, projects] = await Promise.all([
            sequelize.query(
                `SELECT tt.task_id AS id FROM tasks_tags tt
                 JOIN tags ON tags.id = tt.tag_id
                 WHERE tags.name = 'someday' AND tags.user_id = ?`,
                {
                    replacements: [userId],
                    type: sequelize.QueryTypes.SELECT,
                }
            ),
            sequelize.query(
                `SELECT pt.project_id AS id FROM projects_tags pt
                 JOIN tags ON tags.id = pt.tag_id
                 WHERE tags.name = 'someday' AND tags.user_id = ?`,
                {
                    replacements: [userId],
                    type: sequelize.QueryTypes.SELECT,
                }
            ),
        ]);
        return {
            taskIds: tasks.map((r) => r.id),
            projectIds: projects.map((r) => r.id),
        };
    },

    async findSomedayTag(userId) {
        return Tag.findOne({ where: { user_id: userId, name: 'someday' } });
    },

    async createSomedayTag(userId) {
        const [tag] = await Tag.findOrCreate({
            where: { user_id: userId, name: 'someday' },
            defaults: {
                name: 'someday',
                user_id: userId,
                tag_type: 'system',
                pinned: true,
            },
        });
        return tag;
    },

    async markProjectReviewed(uid) {
        const project = await Project.findOne({ where: { uid } });
        if (!project) return null;
        // Silent: keeping a project is not a change to it.
        await project.update({ reviewed_at: new Date() }, { silent: true });
        return project;
    },

    async findOpenInboxItems(userId, limit, offset) {
        const where = { user_id: userId, status: 'added' };
        const [items, count] = await Promise.all([
            InboxItem.findAll({
                where,
                attributes: ['uid', 'title', 'content', 'created_at'],
                order: [['created_at', 'ASC']],
                limit,
                offset,
            }),
            InboxItem.count({ where }),
        ]);
        return { items, count };
    },

    // Active projects the user may see, with what the stagnation check
    // needs: open tasks that can be worked on now, and the latest change to
    // the project or any of its tasks.
    async findActiveProjects(visibleWhere, excludedIds) {
        const where = {
            [Op.and]: [
                visibleWhere,
                { status: { [Op.in]: ['in_progress', 'planned'] } },
                { is_template: false },
            ],
        };
        if (excludedIds.length > 0) {
            where[Op.and].push({ id: { [Op.notIn]: excludedIds } });
        }
        return Project.findAll({
            where,
            attributes: [
                'id',
                'uid',
                'name',
                'status',
                'due_date_at',
                'updated_at',
                'created_at',
                'reviewed_at',
            ],
        });
    },

    async findProjectTaskStats(projectIds, now) {
        if (projectIds.length === 0) return new Map();
        const rows = await Task.findAll({
            where: { project_id: { [Op.in]: projectIds } },
            attributes: [
                'project_id',
                'status',
                'defer_until',
                'updated_at',
                'completed_at',
                'created_at',
            ],
            raw: true,
        });
        const stats = new Map();
        for (const id of projectIds) {
            stats.set(id, { actionable: 0, waiting: 0, lastChange: null });
        }
        const later = (a, b) =>
            !a || (b && new Date(b) > new Date(a)) ? b : a;
        for (const row of rows) {
            const s = stats.get(row.project_id);
            s.lastChange = later(
                later(later(s.lastChange, row.updated_at), row.completed_at),
                row.created_at
            );
            if (OPEN_STATUSES_EXCLUDED.includes(row.status)) continue;
            const deferred = row.defer_until && new Date(row.defer_until) > now;
            if (row.status === Task.STATUS.WAITING || deferred) s.waiting += 1;
            else s.actionable += 1;
        }
        return stats;
    },
};

module.exports = reviewRepository;
