'use strict';

const { Op } = require('sequelize');
const { Note, Task, Person } = require('../../models');
const { ciLike } = require('../../utils/db-dialect');
const {
    ownershipOrPermissionWhere,
} = require('../../services/permissionsService');
const { CLOSED_STATUSES } = require('../projects/nextAction');

const MAX_CANDIDATES = 300;

const SOURCES = {
    note: { model: Note, title: 'title', text: 'content', extra: {} },
    // Habit tasks are kept out of every task list.
    task: {
        model: Task,
        title: 'name',
        text: 'note',
        extra: { habit_mode: { [Op.not]: true } },
    },
};

async function findTarget(type, uid) {
    if (type === 'note') {
        const note = await Note.findOne({
            where: { uid },
            attributes: ['uid', 'title'],
            raw: true,
        });
        return note && { type, uid: note.uid, title: note.title };
    }
    if (type === 'task') {
        const task = await Task.findOne({
            where: { uid },
            attributes: ['uid', 'name'],
            raw: true,
        });
        return task && { type, uid: task.uid, title: task.name };
    }
    if (type === 'person') {
        const person = await Person.findOne({
            where: { uid },
            attributes: ['uid', 'name'],
            raw: true,
        });
        return person && { type, uid: person.uid, title: null };
    }
    return null;
}

// Readable notes or tasks whose text contains one of `fragments`: a cheap
// first pass; the parser then keeps only real links.
async function findCandidates(userId, sourceType, fragments) {
    const source = SOURCES[sourceType];
    const access = await ownershipOrPermissionWhere(sourceType, userId);
    const rows = await source.model.findAll({
        where: {
            [Op.and]: [
                access,
                source.extra,
                {
                    [Op.or]: fragments.map((fragment) => ({
                        [source.text]: ciLike(`%${fragment}%`),
                    })),
                },
            ],
        },
        attributes: ['uid', source.title, source.text, 'updated_at'],
        order: [['updated_at', 'DESC']],
        limit: MAX_CANDIDATES,
        raw: true,
    });
    return rows.map((row) => ({
        type: sourceType,
        uid: row.uid,
        title: row[source.title] || '',
        text: row[source.text] || '',
        updated_at: row.updated_at,
    }));
}

// Readable tasks named one of `names` (any case), open ones first.
async function findTasksByName(userId, names) {
    const access = await ownershipOrPermissionWhere('task', userId);
    const rows = await Task.findAll({
        where: {
            [Op.and]: [
                access,
                SOURCES.task.extra,
                { [Op.or]: names.map((name) => ({ name: ciLike(name) })) },
            ],
        },
        attributes: ['uid', 'name', 'status', 'updated_at'],
        order: [['updated_at', 'DESC']],
        limit: MAX_CANDIDATES,
        raw: true,
    });
    const open = (row) => !CLOSED_STATUSES.includes(row.status);
    return rows.sort((a, b) => Number(open(b)) - Number(open(a)));
}

module.exports = { findTarget, findCandidates, findTasksByName };
