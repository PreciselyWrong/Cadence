'use strict';

const { Task, TaskTriage } = require('../../models');

module.exports = {
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
