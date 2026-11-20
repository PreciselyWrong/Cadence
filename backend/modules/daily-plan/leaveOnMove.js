'use strict';

const { Op } = require('sequelize');
const {
    getSafeTimezone,
    getCurrentDateInTimezone,
    utcToUserDateString,
} = require('../../utils/timezone-utils');

// A one-off task whose due date moves to a later day leaves the plans of the
// days before it, from today on, on every write path (task pane, sync, MCP),
// because it runs as a model hook. A past plan is the record of that day.
// Recurring tasks and habits are left alone: completing one moves the same row
// on to its next due date, so the clients ask first and send `unplan`.

// Done and archived tasks keep their place: the plan records them as done.
const CLOSED_STATUSES = [2, 3];

const isRecurring = (task) =>
    !!task.recurrence_type && task.recurrence_type !== 'none';

async function leavePlans(models, task, options) {
    if (
        !task.changed('due_date') ||
        isRecurring(task) ||
        task.recurring_parent_id ||
        task.habit_mode ||
        CLOSED_STATUSES.includes(task.status)
    ) {
        return;
    }
    const { User, DailyPlan, DailyPlanItem } = models;
    const transaction = options && options.transaction;
    const user = await User.findByPk(task.user_id, {
        attributes: ['id', 'timezone'],
        transaction,
    });
    if (!user) return;
    const timezone = getSafeTimezone(user.timezone);
    const after = utcToUserDateString(task.due_date, timezone);
    const before = utcToUserDateString(task.previous('due_date'), timezone);
    if (!after || after === before) return;

    const plans = await DailyPlan.findAll({
        where: {
            user_id: task.user_id,
            plan_date: {
                [Op.gte]: getCurrentDateInTimezone(timezone),
                [Op.lt]: after,
            },
        },
        include: [
            {
                model: DailyPlanItem,
                as: 'Items',
                where: { task_id: task.id },
                required: true,
                attributes: ['id'],
            },
        ],
        attributes: ['id'],
        transaction,
    });
    if (plans.length === 0) return;
    await DailyPlanItem.destroy({
        where: {
            task_id: task.id,
            daily_plan_id: plans.map((plan) => plan.id),
        },
        transaction,
    });
}

function install(models) {
    models.Task.addHook('afterUpdate', (task, options) =>
        leavePlans(models, task, options)
    );
}

module.exports = { install };
