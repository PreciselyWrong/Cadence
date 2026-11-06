'use strict';

const { TaskTriage } = require('../../models');

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
};
