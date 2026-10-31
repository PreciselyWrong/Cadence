'use strict';

const { Op } = require('sequelize');
const models = require('../../../models');
const { ENTITIES } = require('./schema');

// Data access of the Cadence habits. Every query is scoped to the owner.

const modelOf = (entity) => models[ENTITIES[entity].model];

async function findHabit(userId, uid) {
    return models.Habit.findOne({ where: { uid, user_id: userId } });
}

// uids are unique across users: a clash with someone else is a conflict.
async function findAnyByUid(entity, uid) {
    return modelOf(entity).findOne({ where: { uid } });
}

async function listHabits(userId, { archived } = {}) {
    const where = { user_id: userId };
    if (archived !== undefined) where.archived = archived;
    return models.Habit.findAll({
        where,
        order: [
            ['sort_order', 'ASC'],
            ['id', 'ASC'],
        ],
    });
}

async function listGroups(userId) {
    return models.HabitGroup.findAll({
        where: { user_id: userId },
        order: [
            ['sort_order', 'ASC'],
            ['id', 'ASC'],
        ],
    });
}

async function findGroup(userId, uid) {
    return models.HabitGroup.findOne({ where: { uid, user_id: userId } });
}

// All rows of one entity for several habits, oldest first.
async function childrenOf(entity, userId, habitIds, extraWhere = {}) {
    if (habitIds.length === 0) return [];
    return modelOf(entity).findAll({
        where: {
            user_id: userId,
            habit_id: { [Op.in]: habitIds },
            ...extraWhere,
        },
        order: [['id', 'ASC']],
    });
}

async function findChild(entity, userId, habit, uid) {
    return modelOf(entity).findOne({
        where: { uid, user_id: userId, habit_id: habit.id },
    });
}

async function listChildren(entity, userId, habit, where = {}, order = null) {
    return modelOf(entity).findAll({
        where: { user_id: userId, habit_id: habit.id, ...where },
        order: order ?? [['id', 'ASC']],
    });
}

module.exports = {
    modelOf,
    findHabit,
    findAnyByUid,
    listHabits,
    listGroups,
    findGroup,
    childrenOf,
    findChild,
    listChildren,
};
