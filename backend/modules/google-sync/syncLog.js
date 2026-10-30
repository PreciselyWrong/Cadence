'use strict';

const { Op } = require('sequelize');
const { GoogleSyncLog } = require('../../models');

// Entries kept per user; older ones are dropped.
const KEEP = 50;
const KINDS = ['info', 'conflict', 'error'];

// Collects a run's entries; they are written once the run ends.
function collector() {
    const entries = [];
    const add = (kind, message, taskUid = null) => {
        if (!KINDS.includes(kind)) return;
        entries.push({
            kind,
            message: String(message || '').slice(0, 1000),
            task_uid: taskUid || null,
            at: new Date(),
        });
    };
    add.entries = entries;
    return add;
}

async function write(userId, entries) {
    if (!entries.length) return;
    // Only the last KEEP of a run matter.
    for (const entry of entries.slice(-KEEP)) {
        await GoogleSyncLog.create({
            user_id: userId,
            kind: entry.kind,
            message: entry.message,
            task_uid: entry.task_uid,
            created_at: entry.at,
            updated_at: entry.at,
        });
    }
    const old = await GoogleSyncLog.findAll({
        where: { user_id: userId },
        attributes: ['id'],
        order: [
            ['created_at', 'DESC'],
            ['id', 'DESC'],
        ],
        offset: KEEP,
    });
    if (old.length) {
        await GoogleSyncLog.destroy({
            where: { id: { [Op.in]: old.map((row) => row.id) } },
        });
    }
}

async function list(userId) {
    const rows = await GoogleSyncLog.findAll({
        where: { user_id: userId },
        order: [
            ['created_at', 'DESC'],
            ['id', 'DESC'],
        ],
        limit: KEEP,
    });
    return rows.map((row) => ({
        created_at: row.created_at,
        kind: row.kind,
        message: row.message,
        task_uid: row.task_uid,
    }));
}

async function clear(userId) {
    await GoogleSyncLog.destroy({ where: { user_id: userId } });
}

module.exports = { collector, write, list, clear, KEEP };
