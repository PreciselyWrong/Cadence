'use strict';

const { ENTITIES } = require('../schema');

// Deleting a habit deletes everything that hangs from it, row by row, so the
// sync journal writes a tombstone for each one and other devices can cascade.
// The database cascade alone would leave them silent.
async function destroyHabit(habit, userId) {
    const models = require('../../../../models');
    return models.sequelize.transaction(async (transaction) => {
        const children = Object.values(ENTITIES)
            .filter((def) => def.refs.habit_uid)
            .reverse();
        for (const def of children) {
            const rows = await models[def.model].findAll({
                where: { habit_id: habit.id, user_id: userId },
                transaction,
            });
            for (const row of rows) await row.destroy({ transaction });
        }
        await habit.destroy({ transaction });
    });
}

// A habit of a deleted group falls back to the always-available group
// (a null group), and the change is journaled like any other edit.
async function destroyGroup(group, userId) {
    const { sequelize, Habit } = require('../../../../models');
    return sequelize.transaction(async (transaction) => {
        const habits = await Habit.findAll({
            where: { group_id: group.id, user_id: userId },
            transaction,
        });
        for (const habit of habits) {
            habit.set('group_id', null);
            await habit.save({ transaction });
        }
        await group.destroy({ transaction });
    });
}

module.exports = { destroyHabit, destroyGroup };
