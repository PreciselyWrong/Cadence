'use strict';

const {
    Goal,
    Area,
    Project,
    Task,
    UserGoalOrder,
    sequelize,
} = require('../../models');
const { Op } = require('sequelize');
const permissionsService = require('../../services/permissionsService');

const visibleWhere = (resourceType, userId) =>
    permissionsService.ownershipOrPermissionWhere(resourceType, userId);

const AREA_INCLUDE = {
    model: Area,
    attributes: ['id', 'uid', 'name', 'color'],
};

const OBJECTIVE_INCLUDE = {
    model: Goal,
    as: 'Objective',
    attributes: ['uid'],
};

// Done, archived: finished. Cancelled work does not count against progress.
const DONE_TASK_STATUSES = [2, 3];
const CANCELLED_TASK_STATUS = 5;

const percentOf = ({ done, total }) =>
    total > 0 ? Math.round((done / total) * 100) : null;

const sumProgress = (parts) => {
    const sum = parts.reduce(
        (acc, p) => ({ done: acc.done + p.done, total: acc.total + p.total }),
        { done: 0, total: 0 }
    );
    return { ...sum, percent: percentOf(sum) };
};

// The task to do next among open top-level tasks: the nearest due date, then
// the oldest, then by name. Android applies the same rule (`Goals.nextStep`).
const time = (value) => (value ? new Date(value).getTime() : null);
const compareNextSteps = (a, b) => {
    const dueA = time(a.due_date);
    const dueB = time(b.due_date);
    if (dueA !== dueB) {
        if (dueA === null) return 1;
        if (dueB === null) return -1;
        return dueA - dueB;
    }
    const createdA = time(a.created_at);
    const createdB = time(b.created_at);
    if (createdA !== createdB) {
        if (createdA === null) return 1;
        if (createdB === null) return -1;
        return createdA - createdB;
    }
    return (a.name || '').localeCompare(b.name || '');
};

const firstStep = (candidates) =>
    candidates.filter(Boolean).sort(compareNextSteps)[0] || null;

const OPEN_EXCLUDED_STATUSES = [...DONE_TASK_STATUSES, CANCELLED_TASK_STATUS];

class GoalsRepository {
    // Own progress of each goal id: the share of its linked projects and
    // tasks that are finished, as { done, total }, and its next open task
    // (`step`).
    async _ownProgress(goalIds, userId) {
        const [projectWhere, taskWhere] = await Promise.all([
            visibleWhere('project', userId),
            visibleWhere('task', userId),
        ]);
        const [projects, tasks] = await Promise.all([
            Project.findAll({
                where: {
                    [Op.and]: [{ goal_id: { [Op.in]: goalIds } }, projectWhere],
                },
                attributes: ['goal_id', 'status'],
                raw: true,
            }),
            Task.findAll({
                where: {
                    [Op.and]: [
                        { goal_id: { [Op.in]: goalIds }, parent_task_id: null },
                        taskWhere,
                    ],
                },
                attributes: [
                    'goal_id',
                    'status',
                    'uid',
                    'name',
                    'due_date',
                    'created_at',
                ],
                raw: true,
            }),
        ]);

        const progress = new Map(
            goalIds.map((id) => [id, { done: 0, total: 0, step: null }])
        );
        for (const task of tasks) {
            if (OPEN_EXCLUDED_STATUSES.includes(task.status)) continue;
            const entry = progress.get(task.goal_id);
            entry.step = firstStep([entry.step, task]);
        }
        const count = (rows, isDone, isCancelled) => {
            for (const row of rows) {
                if (isCancelled(row.status)) continue;
                const entry = progress.get(row.goal_id);
                entry.total += 1;
                if (isDone(row.status)) entry.done += 1;
            }
        };
        count(
            projects,
            (status) => status === 'done',
            (status) => status === 'cancelled'
        );
        count(
            tasks,
            (status) => DONE_TASK_STATUSES.includes(status),
            (status) => status === CANCELLED_TASK_STATUS
        );
        return progress;
    }

    // Progress per goal id; an objective also counts its key results' items.
    async _progressWithKeyResults(goals, userId) {
        const keyResults = await Goal.findAll({
            where: { parent_goal_id: { [Op.in]: goals.map((g) => g.id) } },
            attributes: ['id', 'parent_goal_id'],
            raw: true,
        });
        const childrenOf = new Map();
        for (const kr of keyResults) {
            const list = childrenOf.get(kr.parent_goal_id) || [];
            list.push(kr.id);
            childrenOf.set(kr.parent_goal_id, list);
        }
        const ids = [
            ...new Set([
                ...goals.map((g) => g.id),
                ...keyResults.map((k) => k.id),
            ]),
        ];
        const own = await this._ownProgress(ids, userId);
        return new Map(
            goals.map((goal) => {
                const parts = [goal.id, ...(childrenOf.get(goal.id) || [])].map(
                    (id) => own.get(id)
                );
                const step = firstStep(parts.map((p) => p.step));
                return [
                    goal.id,
                    {
                        progress: sumProgress(parts),
                        next_task: step
                            ? {
                                  uid: step.uid,
                                  name: step.name,
                                  due_date: step.due_date
                                      ? new Date(step.due_date).toISOString()
                                      : null,
                              }
                            : null,
                        key_results_count: (childrenOf.get(goal.id) || [])
                            .length,
                    },
                ];
            })
        );
    }

    async _attachCounts(goals, userId) {
        if (goals.length === 0) return [];

        const goalIds = goals.map((g) => g.id);
        const progressByGoal = await this._progressWithKeyResults(
            goals,
            userId
        );
        const [projectWhere, taskWhere] = await Promise.all([
            visibleWhere('project', userId),
            visibleWhere('task', userId),
        ]);

        const [projectCounts, taskCounts] = await Promise.all([
            Project.findAll({
                where: {
                    [Op.and]: [{ goal_id: { [Op.in]: goalIds } }, projectWhere],
                },
                attributes: [
                    'goal_id',
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                ],
                group: ['goal_id'],
                raw: true,
            }),
            Task.findAll({
                where: {
                    [Op.and]: [
                        { goal_id: { [Op.in]: goalIds }, parent_task_id: null },
                        taskWhere,
                    ],
                },
                attributes: [
                    'goal_id',
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                ],
                group: ['goal_id'],
                raw: true,
            }),
        ]);

        const projectMap = {};
        projectCounts.forEach((r) => {
            projectMap[r.goal_id] = parseInt(r.count, 10);
        });
        const taskMap = {};
        taskCounts.forEach((r) => {
            taskMap[r.goal_id] = parseInt(r.count, 10);
        });

        return goals.map((goal) => {
            const { Objective, ...json } = goal.toJSON();
            return {
                ...json,
                parent_goal_uid: Objective ? Objective.uid : null,
                projects_count: projectMap[goal.id] || 0,
                tasks_count: taskMap[goal.id] || 0,
                ...progressByGoal.get(goal.id),
            };
        });
    }

    // Custom order positions of the Goals page for a user, by goal_id.
    async getUserGoalPositions(userId) {
        const rows = await UserGoalOrder.findAll({
            where: { user_id: userId },
            attributes: ['goal_id', 'position'],
            raw: true,
        });
        const map = {};
        rows.forEach((row) => {
            map[row.goal_id] = row.position;
        });
        return map;
    }

    async findIdsByUids(whereClause, uids) {
        return Goal.findAll({
            where: { [Op.and]: [whereClause, { uid: { [Op.in]: uids } }] },
            attributes: ['id', 'uid'],
            raw: true,
        });
    }

    // Replaces the user's whole custom order with goalIds, in that order.
    async replaceUserGoalOrder(userId, goalIds) {
        await sequelize.transaction(async (transaction) => {
            await UserGoalOrder.destroy({
                where: { user_id: userId },
                transaction,
            });
            await UserGoalOrder.bulkCreate(
                goalIds.map((goalId, index) => ({
                    user_id: userId,
                    goal_id: goalId,
                    position: index,
                })),
                { transaction }
            );
        });
    }

    // Goals the user owns or has been shared.
    async findAllByUser(userId) {
        const goals = await Goal.findAll({
            where: await visibleWhere('goal', userId),
            include: [AREA_INCLUDE, OBJECTIVE_INCLUDE],
            order: [['title', 'ASC']],
        });
        return this._attachCounts(goals, userId);
    }

    async findAllByArea(userId, areaId) {
        const goals = await Goal.findAll({
            where: {
                [Op.and]: [
                    { area_id: areaId },
                    await visibleWhere('goal', userId),
                ],
            },
            include: [AREA_INCLUDE, OBJECTIVE_INCLUDE],
            order: [['title', 'ASC']],
        });
        return this._attachCounts(goals, userId);
    }

    // A goal whoever owns it, with the projects and tasks in it that the user
    // can see. The caller checks access to the goal itself.
    async findVisibleByUid(userId, uid) {
        const [projectWhere, taskWhere] = await Promise.all([
            visibleWhere('project', userId),
            visibleWhere('task', userId),
        ]);
        return Goal.findOne({
            where: { uid },
            include: [
                AREA_INCLUDE,
                {
                    model: Project,
                    as: 'Projects',
                    where: projectWhere,
                    required: false,
                    attributes: ['id', 'uid', 'name', 'status', 'color'],
                },
                {
                    model: Task,
                    as: 'Tasks',
                    where: taskWhere,
                    required: false,
                    attributes: [
                        'id',
                        'uid',
                        'name',
                        'status',
                        'priority',
                        'due_date',
                        'project_id',
                        'area_id',
                    ],
                },
            ],
        });
    }

    // Key results of an objective with their counts and progress.
    async findKeyResults(userId, objective) {
        const keyResults = await Goal.findAll({
            where: { parent_goal_id: objective.id },
            include: [AREA_INCLUDE, OBJECTIVE_INCLUDE],
            order: [['title', 'ASC']],
        });
        return this._attachCounts(keyResults, userId);
    }

    // The objective's own progress: its items plus its key results'.
    async progressOf(userId, goal) {
        const map = await this._progressWithKeyResults([goal], userId);
        return map.get(goal.id);
    }

    async findByUid(userId, uid) {
        return Goal.findOne({
            where: { uid, user_id: userId },
            include: [
                AREA_INCLUDE,
                {
                    model: Project,
                    as: 'Projects',
                    where: { user_id: userId },
                    required: false,
                    attributes: ['id', 'uid', 'name', 'status', 'color'],
                },
                {
                    model: Task,
                    as: 'Tasks',
                    where: { user_id: userId },
                    required: false,
                    attributes: [
                        'id',
                        'uid',
                        'name',
                        'status',
                        'priority',
                        'due_date',
                        'project_id',
                        'area_id',
                    ],
                },
            ],
        });
    }

    async create(data) {
        return Goal.create(data);
    }

    async update(goal, data) {
        return goal.update(data);
    }

    async delete(goal) {
        return goal.destroy();
    }

    async countActiveByUser(userId) {
        return Goal.count({ where: { user_id: userId, status: 'active' } });
    }
}

module.exports = new GoalsRepository();
