'use strict';

const { Op } = require('sequelize');
const { ENTITIES } = require('./registry');
const { serializeRow } = require('./serialize');
const hlc = require('./hlc');

const models = () => require('../../models');

// Entities whose lost value can be pushed again as a fresh edit. Habit rows
// are left out, as on Android: their writes follow the habit engine's rules.
const REAPPLICABLE = new Set([
    'task',
    'project',
    'area',
    'goal',
    'tag',
    'note',
    'inbox_item',
    'link',
]);

const NAME_MAX = 120;

function nameOf(row) {
    const text = row.name ?? row.title ?? row.content ?? row.url ?? null;
    return typeof text === 'string' && text.trim()
        ? text.trim().slice(0, NAME_MAX)
        : null;
}

function referencedEntity(entity, field) {
    const def = ENTITIES[entity];
    return def.refs[field]?.entity ?? def.lists?.[field]?.entity ?? null;
}

// The names of the rows a reference or a list points at, by uid.
async function labelOf(entity, field, value) {
    const target = referencedEntity(entity, field);
    if (!target || value === null || value === undefined) return undefined;
    const uids = Array.isArray(value) ? value : [value];
    if (uids.length === 0) return undefined;
    const rows = await models()[ENTITIES[target].model].findAll({
        where: { uid: uids },
    });
    const byUid = new Map(rows.map((r) => [r.uid, nameOf(r) ?? r.uid]));
    return uids.map((uid) => byUid.get(uid) ?? uid).join(', ');
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function findRow(entity, userId, uid) {
    return models()[ENTITIES[entity].model].findOne({
        where: { uid, user_id: userId },
    });
}

// A conflict is still open while its row exists and holds another value
// than the one that lost.
async function describeConflict(conflict) {
    if (!ENTITIES[conflict.entity]) return null;
    const row = await findRow(conflict.entity, conflict.user_id, conflict.uid);
    if (!row) return null;
    const data = await serializeRow(conflict.entity, row);
    const current = data[conflict.field];
    if (same(current, conflict.losing_value)) return null;
    const side = async (value) => {
        const label = await labelOf(conflict.entity, conflict.field, value);
        return label === undefined ? { value } : { value, label };
    };
    return {
        id: conflict.id,
        entity: conflict.entity,
        uid: conflict.uid,
        field: conflict.field,
        name: nameOf(row),
        created_at: conflict.created_at,
        lost: await side(conflict.losing_value),
        current: await side(current),
        can_keep_lost: REAPPLICABLE.has(conflict.entity),
    };
}

async function listConflicts(userId) {
    const rows = await models().SyncConflict.findAll({
        where: { user_id: userId },
        order: [['created_at', 'DESC']],
    });
    // Only the latest loss of a field is worth a choice.
    const seen = new Set();
    const open = [];
    for (const row of rows) {
        const key = `${row.entity}:${row.uid}:${row.field}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const described = await describeConflict(row);
        if (described) open.push(described);
    }
    return open;
}

function findConflict(userId, id) {
    return models().SyncConflict.findOne({ where: { id, user_id: userId } });
}

// Every recorded loss of the same field is settled by one choice.
function dropConflictsOfField(conflict) {
    return models().SyncConflict.destroy({
        where: {
            user_id: conflict.user_id,
            entity: conflict.entity,
            uid: conflict.uid,
            field: conflict.field,
        },
    });
}

// The lost value goes back in as a push stamped with the server clock, so it
// wins the merge, passes the same checks a device write does and is pulled
// by every device.
async function lostValueOp(conflict) {
    const row = await findRow(conflict.entity, conflict.user_id, conflict.uid);
    if (row) Object.values(row.field_clocks || {}).forEach(hlc.observe);
    return {
        op_id: `conflict:${conflict.id}:${Date.now()}`,
        entity: conflict.entity,
        uid: conflict.uid,
        action: 'upsert',
        fields: {
            [conflict.field]: {
                value: conflict.losing_value ?? null,
                hlc: hlc.now(),
            },
        },
    };
}

function listDevices(userId) {
    return models().ApiToken.findAll({
        where: {
            user_id: userId,
            revoked_at: null,
            last_used_at: { [Op.ne]: null },
            [Op.or]: [
                { expires_at: null },
                { expires_at: { [Op.gt]: new Date() } },
            ],
        },
        attributes: ['id', 'name', 'last_used_at'],
        order: [['last_used_at', 'DESC']],
    });
}

async function lastChangeAt(userId) {
    const last = await models().SyncChange.findOne({
        where: { user_id: userId },
        order: [['id', 'DESC']],
        attributes: ['created_at'],
    });
    return last?.created_at ?? null;
}

module.exports = {
    REAPPLICABLE,
    listConflicts,
    findConflict,
    dropConflictsOfField,
    lostValueOp,
    listDevices,
    lastChangeAt,
};
