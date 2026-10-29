const { Op } = require('sequelize');
const { Task } = require('../../../models');
const permissionsService = require('../../../services/permissionsService');
const {
    getSafeTimezone,
    getTodayBoundsInUTC,
} = require('../../../utils/timezone-utils');
const { filterTasksByParams } = require('./query-builders');

// Tomorrow and Next 7 days badge the same filter as the list they open, one
// row per page, so the number matches the list. Today has no list filter of
// its own (the Today page mixes plan, progress and due sections), so it counts
// the open tasks due today.
async function countDueToday(userId, userTimezone) {
    const ownedOrShared = await permissionsService.ownershipOrPermissionWhere(
        'task',
        userId,
        null
    );
    const bounds = getTodayBoundsInUTC(getSafeTimezone(userTimezone));

    return Task.count({
        where: {
            [Op.and]: [
                ownedOrShared,
                {
                    parent_task_id: null,
                    status: {
                        [Op.notIn]: [
                            Task.STATUS.DONE,
                            Task.STATUS.ARCHIVED,
                            Task.STATUS.CANCELLED,
                        ],
                    },
                    due_date: { [Op.between]: [bounds.start, bounds.end] },
                    [Op.or]: [
                        { recurring_parent_id: { [Op.ne]: null } },
                        {
                            [Op.and]: [
                                { recurring_parent_id: null },
                                {
                                    [Op.or]: [
                                        { recurrence_type: 'none' },
                                        { recurrence_type: null },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    });
}

async function countListed(type, userId, userTimezone) {
    const { count } = await filterTasksByParams(
        { type },
        userId,
        userTimezone,
        null,
        { limit: 1, offset: 0 }
    );
    return count;
}

async function getSmartTaskCounts(userId, userTimezone) {
    const [today, tomorrow, next7] = await Promise.all([
        countDueToday(userId, userTimezone),
        countListed('tomorrow', userId, userTimezone),
        countListed('upcoming', userId, userTimezone),
    ]);
    return { today, tomorrow, next7 };
}

module.exports = { getSmartTaskCounts };
