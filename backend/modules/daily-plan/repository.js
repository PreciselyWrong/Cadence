'use strict';

const { Op } = require('sequelize');
const {
    DailyPlan,
    DailyPlanItem,
    Task,
    InboxItem,
    Project,
    RecurringCompletion,
    Tag,
    User,
    sequelize,
} = require('../../models');
const { lockNewRow } = require('../../utils/db-dialect');
const { TASK_INCLUDES } = require('../tasks/utils/constants');
const {
    getTaskIncludeConfigLight,
} = require('../tasks/queries/query-builders');

const OPEN_STATUSES_EXCLUDED = [
    Task.STATUS.DONE,
    Task.STATUS.ARCHIVED,
    Task.STATUS.CANCELLED,
];

class DailyPlanRepository {
    async findPlan(userId, planDate) {
        return DailyPlan.findOne({
            where: { user_id: userId, plan_date: planDate },
            include: [{ model: DailyPlanItem, as: 'Items' }],
            order: [[{ model: DailyPlanItem, as: 'Items' }, 'position', 'ASC']],
        });
    }

    async findOrCreatePlan(userId, planDate, transaction) {
        const [plan] = await DailyPlan.findOrCreate({
            where: { user_id: userId, plan_date: planDate },
            defaults: { user_id: userId, plan_date: planDate },
            transaction,
        });
        return plan;
    }

    // Only tasks the user can currently see; a task whose share was revoked
    // silently drops out of the plan.
    async findVisibleTasksByIds(visibleWhere, ids) {
        if (ids.length === 0) return [];
        return Task.findAll({
            where: { [Op.and]: [visibleWhere, { id: { [Op.in]: ids } }] },
            include: TASK_INCLUDES,
        });
    }

    // Tasks with a recurring occurrence completed (not skipped) in the range.
    async findTaskIdsCompletedBetween(taskIds, start, end) {
        if (taskIds.length === 0) return new Set();
        const rows = await RecurringCompletion.findAll({
            where: {
                task_id: { [Op.in]: taskIds },
                skipped: false,
                completed_at: { [Op.between]: [start, end] },
            },
            attributes: ['task_id'],
            raw: true,
        });
        return new Set(rows.map((row) => row.task_id));
    }

    async findVisibleProjectIds(visibleWhere, ids) {
        if (ids.length === 0) return [];
        const projects = await Project.findAll({
            where: { [Op.and]: [visibleWhere, { id: { [Op.in]: ids } }] },
            attributes: ['id'],
            raw: true,
        });
        return projects.map((project) => project.id);
    }

    async findVisibleTasksByUids(visibleWhere, uids, transaction) {
        if (uids.length === 0) return [];
        return Task.findAll({
            where: { [Op.and]: [visibleWhere, { uid: { [Op.in]: uids } }] },
            attributes: ['id', 'uid', 'estimated_minutes'],
            transaction,
        });
    }

    async findVisibleTaskIds(visibleWhere, ids, transaction) {
        if (ids.length === 0) return new Set();
        const rows = await Task.findAll({
            where: { [Op.and]: [visibleWhere, { id: { [Op.in]: ids } }] },
            attributes: ['id'],
            raw: true,
            transaction,
        });
        return new Set(rows.map((row) => row.id));
    }

    // Reads the plans of the given dates under lock, lets `change` decide
    // what they should hold, and stores the lines it returns, all in one
    // transaction. `change(days, transaction)` gets a Map of date to
    // { plan, lines } (plan is null when the day has none yet; lines carry
    // task_id and task_uid) and returns a Map of date to the new lines, for
    // the dates it changed. Locks are taken in date order so two writers
    // touching the same days cannot deadlock on PostgreSQL.
    async transactPlans(userId, planDates, change) {
        const dates = [...new Set(planDates)].sort();
        return sequelize.transaction(async (transaction) => {
            const days = new Map();
            for (const planDate of dates) {
                await lockNewRow(
                    sequelize,
                    transaction,
                    `daily-plan:${userId}:${planDate}`
                );
                const plan = await DailyPlan.findOne({
                    where: { user_id: userId, plan_date: planDate },
                    transaction,
                });
                const items = plan
                    ? await DailyPlanItem.findAll({
                          where: { daily_plan_id: plan.id },
                          include: [
                              {
                                  model: Task,
                                  as: 'Task',
                                  attributes: [
                                      'id',
                                      'uid',
                                      'estimated_minutes',
                                  ],
                              },
                          ],
                          order: [
                              ['position', 'ASC'],
                              ['id', 'ASC'],
                          ],
                          transaction,
                      })
                    : [];
                days.set(planDate, {
                    plan,
                    lines: items.map((item) => ({
                        task_id: item.task_id,
                        task_uid: item.Task.uid,
                        start_minute: item.start_minute,
                        duration_minutes: item.duration_minutes,
                    })),
                });
            }

            const changed = await change(days, transaction);
            for (const [planDate, lines] of changed) {
                const plan =
                    days.get(planDate).plan ||
                    (await this.findOrCreatePlan(
                        userId,
                        planDate,
                        transaction
                    ));
                await DailyPlanItem.destroy({
                    where: { daily_plan_id: plan.id },
                    transaction,
                });
                if (lines.length > 0) {
                    await DailyPlanItem.bulkCreate(
                        lines.map((line, position) => ({
                            daily_plan_id: plan.id,
                            task_id: line.task_id,
                            position,
                            start_minute: line.start_minute,
                            duration_minutes: line.duration_minutes,
                        })),
                        { transaction }
                    );
                }
            }
            return changed.size > 0;
        });
    }

    async markStarted(userId, planDate) {
        const plan = await this.findOrCreatePlan(userId, planDate);
        if (!plan.started_at) {
            await plan.update({ started_at: new Date() });
        }
        return plan;
    }

    async saveWrapUp(userId, planDate, wrapUp) {
        const plan = await this.findOrCreatePlan(userId, planDate);
        await plan.update({ ai_wrap_up: wrapUp });
        return plan;
    }

    async deletePlan(userId, planDate) {
        return sequelize.transaction(async (transaction) => {
            const plan = await DailyPlan.findOne({
                where: { user_id: userId, plan_date: planDate },
                transaction,
            });
            if (!plan) return false;
            await DailyPlanItem.destroy({
                where: { daily_plan_id: plan.id },
                transaction,
            });
            await plan.destroy({ transaction });
            return true;
        });
    }

    // Open top-level tasks the user tagged "today" (any case), with every
    // tag loaded, not only the matching one.
    async findTasksTaggedToday(visibleWhere) {
        const tagged = await Task.findAll({
            where: {
                [Op.and]: [
                    visibleWhere,
                    {
                        status: { [Op.notIn]: OPEN_STATUSES_EXCLUDED },
                        parent_task_id: null,
                        recurring_parent_id: null,
                    },
                ],
            },
            attributes: ['id'],
            include: [
                {
                    model: Tag,
                    attributes: [],
                    through: { attributes: [] },
                    required: true,
                    where: sequelize.where(
                        sequelize.fn('lower', sequelize.col('Tags.name')),
                        'today'
                    ),
                },
            ],
        });
        if (tagged.length === 0) return [];
        return Task.findAll({
            where: { id: { [Op.in]: tagged.map((task) => task.id) } },
            include: getTaskIncludeConfigLight(),
        });
    }

    // Open tasks the user committed to this week or put in view; they lead
    // the suggestions whatever the Planning filters say.
    async findFunnelTasks(visibleWhere, weekStart) {
        return Task.findAll({
            where: {
                [Op.and]: [
                    visibleWhere,
                    {
                        status: { [Op.notIn]: OPEN_STATUSES_EXCLUDED },
                        parent_task_id: null,
                        [Op.or]: [
                            { week_of: weekStart },
                            { in_view_at: { [Op.ne]: null } },
                        ],
                    },
                ],
            },
            include: getTaskIncludeConfigLight(),
        });
    }

    // Open top-level tasks due between two instants, soonest first.
    findTasksDueBetween(visibleWhere, start, end) {
        return Task.findAll({
            where: {
                [Op.and]: [
                    visibleWhere,
                    {
                        status: { [Op.notIn]: OPEN_STATUSES_EXCLUDED },
                        parent_task_id: null,
                        habit_mode: false,
                        due_date: { [Op.between]: [start, end] },
                    },
                ],
            },
            include: getTaskIncludeConfigLight(),
            order: [
                ['due_date', 'ASC'],
                ['id', 'ASC'],
            ],
        });
    }

    // Plan lines of the user on `date` or on any day from `from` on, as
    // { plan_date, task_id }: the only plans that place a task on a day.
    async findPlanLinesFrom(userId, from, date) {
        const plans = await DailyPlan.findAll({
            where: {
                user_id: userId,
                [Op.or]: [
                    { plan_date: { [Op.gte]: from } },
                    { plan_date: date },
                ],
            },
            attributes: ['plan_date'],
            include: [
                { model: DailyPlanItem, as: 'Items', attributes: ['task_id'] },
            ],
        });
        return plans.flatMap((plan) =>
            plan.Items.map((item) => ({
                plan_date: plan.plan_date,
                task_id: item.task_id,
            }))
        );
    }

    // Open top-level tasks of a day's due list or overdue list (not habits,
    // not recurring occurrences), minus the excluded ids.
    findOpenDayTasks(visibleWhere, condition, excludedIds, order) {
        return Task.findAll({
            where: {
                [Op.and]: [
                    visibleWhere,
                    {
                        status: { [Op.notIn]: OPEN_STATUSES_EXCLUDED },
                        parent_task_id: null,
                        habit_mode: false,
                        recurring_parent_id: null,
                    },
                    condition,
                    ...(excludedIds.length
                        ? [{ id: { [Op.notIn]: excludedIds } }]
                        : []),
                ],
            },
            include: TASK_INCLUDES,
            order,
        });
    }

    findDueBetween(visibleWhere, start, end, excludedIds) {
        return this.findOpenDayTasks(
            visibleWhere,
            { due_date: { [Op.between]: [start, end] } },
            excludedIds,
            [
                ['due_date', 'ASC'],
                ['id', 'ASC'],
            ]
        );
    }

    findOverdueBefore(visibleWhere, start, excludedIds) {
        return this.findOpenDayTasks(
            visibleWhere,
            { due_date: { [Op.lt]: start } },
            excludedIds,
            [
                ['due_date', 'ASC'],
                ['id', 'ASC'],
            ]
        );
    }

    // Tasks done between two instants, most recent first, minus the excluded ids.
    findCompletedBetween(visibleWhere, start, end, excludedIds, limit) {
        return Task.findAll({
            where: {
                [Op.and]: [
                    visibleWhere,
                    {
                        status: Task.STATUS.DONE,
                        parent_task_id: null,
                        habit_mode: false,
                        recurring_parent_id: null,
                        completed_at: { [Op.between]: [start, end] },
                    },
                    ...(excludedIds.length
                        ? [{ id: { [Op.notIn]: excludedIds } }]
                        : []),
                ],
            },
            include: TASK_INCLUDES,
            order: [
                ['completed_at', 'DESC'],
                ['id', 'DESC'],
            ],
            limit,
        });
    }

    findOwnTasksByUids(userId, uids) {
        return Task.findAll({ where: { user_id: userId, uid: uids } });
    }

    async findOpenInboxItems(userId, limit) {
        const where = { user_id: userId, status: 'added' };
        const [items, count] = await Promise.all([
            InboxItem.findAll({
                where,
                attributes: ['uid', 'title', 'content', 'created_at'],
                order: [['created_at', 'DESC']],
                limit,
            }),
            InboxItem.count({ where }),
        ]);
        return { items, count };
    }

    async findUiSettings(userId) {
        const user = await User.findByPk(userId, {
            attributes: ['id', 'ui_settings'],
        });
        return parseSettings(user?.ui_settings);
    }

    async saveUiSettings(userId, settings) {
        await User.update({ ui_settings: settings }, { where: { id: userId } });
    }
}

function parseSettings(value) {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) || {};
        } catch {
            return {};
        }
    }
    return value;
}

module.exports = new DailyPlanRepository();
