'use strict';

// The optional Friday routine: one recurring weekly task whose note links to
// /review. Never created on its own and it sets no reminder, so nothing
// pings the user. A weekly recurring task of the user's whose note links to
// /review counts as the routine, whoever made it.
const { Op } = require('sequelize');
const { Task } = require('../../models');
const { buildTaskAttributes } = require('../tasks/core/builders');
const { getSafeTimezone } = require('../../utils/timezone-utils');

const FRIDAY = 5;
const DEFAULT_NAME = 'Weekly review';
const MAX_NAME_LENGTH = 255;
const NOTE = '[/review](/review)';

const CLOSED = [Task.STATUS.DONE, Task.STATUS.ARCHIVED, Task.STATUS.CANCELLED];

function findRoutine(userId) {
    return Task.findOne({
        where: {
            user_id: userId,
            recurrence_type: 'weekly',
            recurring_parent_id: null,
            status: { [Op.notIn]: CLOSED },
            note: { [Op.like]: '%/review%' },
        },
        attributes: ['uid', 'name'],
    });
}

async function exists(user) {
    return { exists: Boolean(await findRoutine(user.id)) };
}

// Creates the routine unless one exists. `name` is the title in the user's
// language, chosen by the client.
async function ensure(user, name) {
    const existing = await findRoutine(user.id);
    if (existing) {
        return {
            created: false,
            task: { uid: existing.uid, name: existing.name },
        };
    }

    const title =
        typeof name === 'string' && name.trim()
            ? name.trim().slice(0, MAX_NAME_LENGTH)
            : DEFAULT_NAME;
    const attributes = buildTaskAttributes(
        {
            name: title,
            note: NOTE,
            recurrence_type: 'weekly',
            recurrence_interval: 1,
            recurrence_weekday: FRIDAY,
            recurrence_weekdays: [FRIDAY],
        },
        user.id,
        getSafeTimezone(user.timezone)
    );
    const task = await Task.create({ ...attributes, user_id: user.id });
    return { created: true, task: { uid: task.uid, name: task.name } };
}

module.exports = { exists, ensure };
