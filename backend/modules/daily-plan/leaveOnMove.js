'use strict';

const { Op } = require('sequelize');
const {
    getSafeTimezone,
    getCurrentDateInTimezone,
    utcToUserDateString,
} = require('../../utils/timezone-utils');

// A planned task whose due date moves past the planned day leaves that day's
// plan, as Today's Tomorrow / Next week chips do, on every write path (the
// Calendar page, the task pane, sync, MCP) because it runs as a model hook.
// Only today and later days change: a past plan is the record of that day.
// A task already due after the planned day was planned early on purpose and
// stays. Recurring tasks are left alone: completing one moves the same row
// on to its next due date, and the plan shows that day's occurrence as done.

// True when a due date on or before the day (or none) became a later one.
// Same rule as `movedPastDay` in frontend/components/DailyPlan/TodayPage.tsx.
const movedPastDay = (before, after, day) => {
    const later = (date) => !!date && date > day;
    return !later(before) && later(after);
};

// Done and archived tasks keep their place: the plan records them as done.
const CLOSED_STATUSES = [2, 3];

const isRecurring = (task) =>
    !!task.recurrence_type && task.recurrence_type !== 'none';

async function leavePlans(models, task, options) {
    if (
        !task.changed('due_date') ||
        isRecurring(task) ||
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
    const before = utcToUserDateString(task.previous('due_date'), timezone);
    const after = utcToUserDateString(task.due_date, timezone);
    if (!after) return;

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
        attributes: ['id', 'plan_date'],
        transaction,
    });
    const leaving = plans.filter((plan) =>
        movedPastDay(before, after, String(plan.plan_date).slice(0, 10))
    );
    if (leaving.length === 0) return;
    await DailyPlanItem.destroy({
        where: {
            task_id: task.id,
            daily_plan_id: leaving.map((plan) => plan.id),
        },
        transaction,
    });
}

function install(models) {
    models.Task.addHook('afterUpdate', (task, options) =>
        leavePlans(models, task, options)
    );
}

module.exports = { install, movedPastDay };
