'use strict';

const { Op } = require('sequelize');
const {
    CalendarFeed,
    DailyPlan,
    DailyPlanItem,
    Task,
    TaskRelation,
    Project,
    Tag,
    User,
} = require('../../../models');
const dailyPlanRepository = require('../repository');

const BRIEF_COLUMNS = [
    'plan_date',
    'brief',
    'brief_version',
    'brief_status',
    'brief_generated_at',
];

const OPEN_STATUSES_EXCLUDED = [
    Task.STATUS.DONE,
    Task.STATUS.ARCHIVED,
    Task.STATUS.CANCELLED,
];

const CANDIDATE_ATTRIBUTES = [
    'id',
    'uid',
    'name',
    'note',
    'status',
    'due_date',
    'estimated_minutes',
    'priority',
    'project_id',
    'parent_task_id',
    'recurrence_type',
    'recurring_parent_id',
];

// Each include names a value the brief reads: project and parent names, the
// recurring series, the tags. Only the columns the rules use are loaded.
const relatedIncludes = () => [
    { model: Project, attributes: ['name'], required: false },
    {
        model: Tag,
        attributes: ['name'],
        through: { attributes: [] },
        required: false,
    },
    {
        model: Task,
        as: 'ParentTask',
        attributes: ['uid'],
        required: false,
    },
    {
        model: Task,
        as: 'RecurringParent',
        attributes: ['uid'],
        required: false,
    },
];

class DailyBriefRepository {
    async findBriefRow(userId, planDate) {
        return DailyPlan.findOne({
            where: { user_id: userId, plan_date: planDate },
            attributes: BRIEF_COLUMNS,
        });
    }

    // The day's row, created if missing. Creating it leaves started_at empty,
    // so the day is not started (docs/39-daily-brief.md).
    async ensurePlanRow(userId, planDate) {
        return dailyPlanRepository.findOrCreatePlan(userId, planDate);
    }

    async saveBrief(planId, values) {
        await DailyPlan.update(values, { where: { id: planId } });
    }

    // Writes only while the row still holds the version the request was
    // started for: a newer brief is never overwritten by a late answer.
    async saveBriefIfVersion(planId, version, values) {
        await DailyPlan.update(values, {
            where: { id: planId, brief_version: version },
        });
    }

    async findPlanRowById(planId) {
        return DailyPlan.findByPk(planId, {
            attributes: ['id', ...BRIEF_COLUMNS],
        });
    }

    // Only tasks the user can see now; a task whose share was revoked comes
    // back as "not found" in the brief, like in the planner.
    async findVisibleTasksByUids(visibleWhere, uids) {
        if (uids.length === 0) return [];
        return Task.findAll({
            where: { [Op.and]: [visibleWhere, { uid: { [Op.in]: uids } }] },
            attributes: [
                'uid',
                'name',
                'status',
                'due_date',
                'completed_at',
                'estimated_minutes',
                'priority',
            ],
            include: [
                { model: Project, attributes: ['name'], required: false },
            ],
        });
    }

    // Open tasks that the brief reads: due by `lastDay`, overdue, in progress,
    // or planned on one of the plan days. Habits are never listed here.
    async findCandidateTasks(visibleWhere, { lastDayEnd, plannedTaskIds }) {
        const relevant = [
            { due_date: { [Op.lte]: lastDayEnd } },
            { status: Task.STATUS.IN_PROGRESS },
        ];
        if (plannedTaskIds.length > 0) {
            relevant.push({ id: { [Op.in]: plannedTaskIds } });
        }
        return Task.findAll({
            where: {
                [Op.and]: [
                    visibleWhere,
                    {
                        habit_mode: false,
                        status: { [Op.notIn]: OPEN_STATUSES_EXCLUDED },
                    },
                    { [Op.or]: relevant },
                ],
            },
            attributes: CANDIDATE_ATTRIBUTES,
            include: relatedIncludes(),
        });
    }

    // { task_id: [plan_date, ...] } for the user's plans in [from, to].
    async findPlannedDays(userId, from, to) {
        const plans = await DailyPlan.findAll({
            where: {
                user_id: userId,
                plan_date: { [Op.between]: [from, to] },
            },
            attributes: ['id', 'plan_date'],
            include: [
                {
                    model: DailyPlanItem,
                    as: 'Items',
                    attributes: ['task_id'],
                    required: true,
                },
            ],
        });
        const planned = new Map();
        for (const plan of plans) {
            const day = String(plan.plan_date).slice(0, 10);
            for (const item of plan.Items || []) {
                if (!planned.has(item.task_id)) planned.set(item.task_id, []);
                planned.get(item.task_id).push(day);
            }
        }
        return planned;
    }

    // Blocking links touching the given tasks, with the uid of the task on the
    // other side. "blocks" is stored as source blocks target.
    async findBlockingLinks(taskIds) {
        if (taskIds.length === 0) return [];
        return TaskRelation.findAll({
            where: {
                relation_type: 'blocks',
                [Op.or]: [
                    { source_task_id: { [Op.in]: taskIds } },
                    { target_task_id: { [Op.in]: taskIds } },
                ],
            },
            attributes: ['source_task_id', 'target_task_id'],
            include: [
                { model: Task, as: 'SourceTask', attributes: ['id', 'uid'] },
                { model: Task, as: 'TargetTask', attributes: ['id', 'uid'] },
            ],
        });
    }

    // Tasks completed since `since` (an instant), most recent first.
    async findClosedTasks(visibleWhere, since) {
        return Task.findAll({
            where: {
                [Op.and]: [
                    visibleWhere,
                    {
                        habit_mode: false,
                        status: Task.STATUS.DONE,
                        completed_at: { [Op.gte]: since },
                    },
                ],
            },
            attributes: ['uid', 'name', 'note', 'completed_at'],
            order: [['completed_at', 'DESC']],
            limit: 200,
        });
    }

    // The ICS feeds among the given uids, with their last fetch error.
    async findCalendarFeedsByUids(userId, uids) {
        if (uids.length === 0) return [];
        return CalendarFeed.findAll({
            where: { user_id: userId, uid: { [Op.in]: uids } },
            attributes: ['uid', 'last_error'],
        });
    }

    // Every user row with its settings. The scheduler filters the brief flag
    // in code: ui_settings is JSON and its shape differs per database.
    async findAllUsersForBriefJob() {
        return User.findAll({
            attributes: ['id', 'timezone', 'ui_settings'],
        });
    }
}

module.exports = new DailyBriefRepository();
