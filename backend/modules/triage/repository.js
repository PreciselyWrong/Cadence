'use strict';

const { Op } = require('sequelize');
const { Project, Tag, Task, TaskTriage, User } = require('../../models');

const CLOSED_STATUSES = [
    Task.STATUS.DONE,
    Task.STATUS.ARCHIVED,
    Task.STATUS.CANCELLED,
];

// Each include names a value the rules read: project and parent names, the
// recurring series, the tags. Only the columns the rules use are loaded.
const relatedIncludes = () => [
    { model: Project, attributes: ['name'], required: false },
    {
        model: Tag,
        attributes: ['name'],
        through: { attributes: [] },
        required: false,
    },
    { model: Task, as: 'ParentTask', attributes: ['uid'], required: false },
    {
        model: Task,
        as: 'RecurringParent',
        attributes: ['uid'],
        required: false,
    },
];

module.exports = {
    // Every open task the user can see. Habits are never listed here.
    findOpenTasks: (visibleWhere) =>
        Task.findAll({
            where: {
                [Op.and]: [
                    visibleWhere,
                    {
                        habit_mode: false,
                        status: { [Op.notIn]: CLOSED_STATUSES },
                    },
                ],
            },
            attributes: [
                'id',
                'uid',
                'user_id',
                'name',
                'note',
                'status',
                'due_date',
                'project_id',
                'parent_task_id',
                'recurrence_type',
                'recurring_parent_id',
                'source_key',
            ],
            include: relatedIncludes(),
        }),

    // Tasks completed since `since` (an instant), most recent first.
    findClosedTasks: (visibleWhere, since) =>
        Task.findAll({
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
            attributes: [
                'uid',
                'name',
                'note',
                'completed_at',
                'due_date',
                'recurrence_type',
                'recurring_parent_id',
            ],
            include: relatedIncludes(),
            order: [['completed_at', 'DESC']],
            limit: 200,
        }),

    // Every user row with its settings, for the daily jobs. They filter in
    // code: ui_settings is JSON and its shape differs per database.
    findAllUsersForJobs: () =>
        User.findAll({ attributes: ['id', 'uid', 'timezone', 'ui_settings'] }),

    findAllForUser: (userId) =>
        TaskTriage.findAll({ where: { user_id: userId } }),

    findOne: (userId, taskUid) =>
        TaskTriage.findOne({ where: { user_id: userId, task_uid: taskUid } }),

    // One row per task: a new decision or proposal replaces the last one.
    async save(userId, taskUid, fields) {
        const row = await this.findOne(userId, taskUid);
        if (row) return row.update(fields);
        return TaskTriage.create({
            user_id: userId,
            task_uid: taskUid,
            ...fields,
        });
    },

    // Takes the order's key for this task. False: the same order got there
    // first, so this one must do nothing. `fields` fill a row that does not
    // exist yet.
    async reserveKey(userId, taskUid, key, fields) {
        const row = await this.findOne(userId, taskUid);
        if (row?.apply_key === key) return false;
        if (row) {
            const [updated] = await TaskTriage.update(
                { apply_key: key },
                { where: { id: row.id, apply_key: row.apply_key } }
            );
            return updated === 1;
        }
        try {
            await TaskTriage.create({
                user_id: userId,
                task_uid: taskUid,
                apply_key: key,
                ...fields,
            });
            return true;
        } catch (error) {
            if (error.name !== 'SequelizeUniqueConstraintError') throw error;
            return this.reserveKey(userId, taskUid, key, fields);
        }
    },

    releaseKey: (userId, taskUid) =>
        TaskTriage.update(
            { apply_key: null },
            { where: { user_id: userId, task_uid: taskUid } }
        ),

    async countSubtasks(taskUid) {
        const task = await Task.findOne({
            where: { uid: taskUid },
            attributes: ['id'],
        });
        return task ? Task.count({ where: { parent_task_id: task.id } }) : 0;
    },
};
