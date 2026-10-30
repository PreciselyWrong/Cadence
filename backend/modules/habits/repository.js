'use strict';

const BaseRepository = require('../../shared/database/BaseRepository');
const { Task, RecurringCompletion } = require('../../models');
const { Op } = require('sequelize');

class HabitsRepository extends BaseRepository {
    constructor() {
        super(Task);
    }

    // Archived (3) and cancelled (5) habits are listed separately. With
    // updatedSince, both kinds are returned so a client sees archiving too.
    async findAllByUser(
        userId,
        { archived = false, updatedSince = null } = {}
    ) {
        const where = { user_id: userId, habit_mode: true };
        if (updatedSince) {
            where.updated_at = { [Op.gt]: updatedSince };
        } else {
            where.status = archived
                ? { [Op.in]: [3, 5] }
                : { [Op.notIn]: [3, 5] };
        }
        return this.model.findAll({
            where,
            order: [['created_at', 'DESC']],
        });
    }

    async findByUidAndUser(uid, userId) {
        return this.model.findOne({
            where: { uid, user_id: userId },
        });
    }

    // uids are unique across all users, so a clash is checked globally.
    async findAnyByUid(uid) {
        return this.model.findOne({ where: { uid } });
    }

    async findCompletionByUid(uid) {
        return RecurringCompletion.findOne({ where: { uid } });
    }

    async createHabit(userId, data) {
        return this.model.create({
            ...data,
            user_id: userId,
            habit_mode: true,
            status: 0,
        });
    }

    // Dates are optional: updatedSince alone lists every check-in changed
    // since then, whatever day it is for.
    async findCompletions(taskId, { startDate, endDate, updatedSince } = {}) {
        const where = { task_id: taskId };
        if (startDate && endDate) {
            where.completed_at = { [Op.between]: [startDate, endDate] };
        }
        if (updatedSince) {
            where.updated_at = { [Op.gt]: updatedSince };
        }
        return RecurringCompletion.findAll({
            where,
            order: [['completed_at', 'DESC']],
        });
    }

    async findCompletionById(completionId, taskId) {
        return RecurringCompletion.findOne({
            where: { id: completionId, task_id: taskId },
        });
    }
}

module.exports = new HabitsRepository();
