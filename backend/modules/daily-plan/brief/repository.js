'use strict';

const { Op } = require('sequelize');
const { DailyPlan, Task, Project } = require('../../../models');

const BRIEF_COLUMNS = [
    'plan_date',
    'brief',
    'brief_version',
    'brief_status',
    'brief_generated_at',
];

class DailyBriefRepository {
    async findBriefRow(userId, planDate) {
        return DailyPlan.findOne({
            where: { user_id: userId, plan_date: planDate },
            attributes: BRIEF_COLUMNS,
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
}

module.exports = new DailyBriefRepository();
