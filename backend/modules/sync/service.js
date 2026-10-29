'use strict';

const { Op } = require('sequelize');
const { SCHEMA_VERSION, ENTITIES, listsOf } = require('./registry');
const { serializeRow } = require('./serialize');
const hlc = require('./hlc');
const { runWithOp } = require('./context');
const { applyOccurrence } = require('./occurrences');

const UID_FORMAT = /^[A-Za-z0-9_-]{8,64}$/;
const OP_ID_FORMAT = /^[A-Za-z0-9_.:-]{1,100}$/;
const PAGE_MAX = 1000;

const models = () => require('../../models');

function describe() {
    return {
        schema_version: SCHEMA_VERSION,
        capabilities: [
            'field_merge',
            'tombstones',
            'snapshot',
            'op_echo',
            'occurrence_ops',
        ],
        entities: Object.entries(ENTITIES).map(([name, def]) => ({
            name,
            version: def.version,
            fields: def.fields,
            refs: Object.fromEntries(
                Object.entries(def.refs).map(([key, ref]) => [key, ref.entity])
            ),
            lists: Object.fromEntries(
                Object.entries(listsOf(name)).map(([key, list]) => [
                    key,
                    list.entity,
                ])
            ),
        })),
    };
}

const rejected = (reason) => ({ status: 'rejected', reason });

async function latestCursor(userId) {
    const max = await models().SyncChange.max('id', {
        where: { user_id: userId },
    });
    return max || 0;
}

async function pull(userId, cursor, limit) {
    const rows = await models().SyncChange.findAll({
        where: { user_id: userId, id: { [Op.gt]: cursor } },
        order: [['id', 'ASC']],
        limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
        schema_version: SCHEMA_VERSION,
        cursor: page.length ? page[page.length - 1].id : cursor,
        has_more: rows.length > limit,
        changes: page.map((c) => ({
            seq: c.id,
            entity: c.entity,
            uid: c.uid,
            op: c.op,
            data: c.data,
            op_id: c.op_id,
        })),
    };
}

// The cursor is read before the rows: a write landing during the snapshot
// is then pulled again afterwards rather than lost.
async function snapshot(userId, entity, after, limit, startCursor = null) {
    const def = ENTITIES[entity];
    // Later pages carry the first page's cursor back, so a row edited
    // between pages is pulled again instead of skipped.
    const cursor = startCursor ?? (await latestCursor(userId));
    const rows = await models()[def.model].findAll({
        where: { user_id: userId, id: { [Op.gt]: after } },
        order: [['id', 'ASC']],
        limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
        schema_version: SCHEMA_VERSION,
        entity,
        cursor,
        next: rows.length > limit ? page[page.length - 1].id : null,
        rows: await Promise.all(page.map((r) => serializeRow(entity, r))),
    };
}

async function resolveRefs(def, userId, fields) {
    const columns = {};
    for (const [key, ref] of Object.entries(def.refs)) {
        if (!(key in fields)) continue;
        const uid = fields[key].value;
        if (uid === null) {
            columns[key] = null;
            continue;
        }
        const target = await models()[ENTITIES[ref.entity].model].findOne({
            where: { uid, user_id: userId },
            attributes: ['id'],
        });
        if (!target) return { error: `invalid_reference:${key}` };
        columns[key] = target.id;
    }
    return { columns };
}

async function resolveLists(def, userId, fields) {
    const ids = {};
    for (const [key, list] of Object.entries(def.lists || {})) {
        if (!(key in fields)) continue;
        const uids = [...new Set(fields[key].value)];
        const found = await models()[ENTITIES[list.entity].model].findAll({
            where: { uid: uids, user_id: userId },
            attributes: ['id'],
        });
        if (found.length !== uids.length) {
            return { error: `invalid_reference:${key}` };
        }
        ids[key] = found.map((r) => r.id);
    }
    return { ids };
}

async function writeLists(def, row, lists) {
    const { sequelize } = models();
    for (const [key, ids] of Object.entries(lists)) {
        const list = def.lists[key];
        const Through = sequelize.models[list.through];
        await Through.destroy({
            where: { [list.key]: row.id },
            syncApplied: true,
        });
        if (ids.length > 0) {
            await Through.bulkCreate(
                ids.map((id) => ({ [list.key]: row.id, [list.otherKey]: id })),
                { syncApplied: true }
            );
        }
    }
}

function validateFields(def, fields) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        return 'invalid_fields';
    }
    const lists = def.lists || {};
    for (const [key, entry] of Object.entries(fields)) {
        if (
            !def.fields.includes(key) &&
            !(key in def.refs) &&
            !(key in lists)
        ) {
            return `unknown_field:${key}`;
        }
        if (
            key in def.refs &&
            !(typeof entry?.value === 'string' || entry?.value === null)
        ) {
            return `invalid_reference:${key}`;
        }
        if (
            key in lists &&
            !(
                Array.isArray(entry?.value) &&
                entry.value.every((u) => typeof u === 'string')
            )
        ) {
            return `invalid_list:${key}`;
        }
        if (!entry || !hlc.isAcceptable(entry.hlc)) {
            return `invalid_clock:${key}`;
        }
    }
    return null;
}

async function wasDeleted(userId, entity, uid) {
    const last = await models().SyncChange.findOne({
        where: { user_id: userId, entity, uid },
        order: [['id', 'DESC']],
        attributes: ['op'],
    });
    return last?.op === 'delete';
}

async function applyUpsert(userId, op) {
    const def = ENTITIES[op.entity];
    const invalid = validateFields(def, op.fields);
    if (invalid) return rejected(invalid);

    const Model = models()[def.model];
    const row = await Model.findOne({ where: { uid: op.uid } });
    if (row && row.user_id !== userId) return rejected('forbidden');
    // Delete wins: an edit made offline to a row removed elsewhere must
    // not bring it back.
    if (!row && (await wasDeleted(userId, op.entity, op.uid))) {
        return rejected('deleted');
    }

    const refs = await resolveRefs(def, userId, op.fields);
    if (refs.error) return rejected(refs.error);
    const lists = await resolveLists(def, userId, op.fields);
    if (lists.error) return rejected(lists.error);

    const clocks = { ...(row?.field_clocks || {}) };
    const values = {};
    const listValues = {};
    const rejectedFields = [];
    for (const [key, entry] of Object.entries(op.fields)) {
        const current = clocks[key];
        // `>=` keeps a replay of the same op idempotent.
        if (row && current && entry.hlc < current) {
            rejectedFields.push(key);
            continue;
        }
        clocks[key] = entry.hlc;
        hlc.observe(entry.hlc);
        if (key in lists.ids) {
            listValues[key] = lists.ids[key];
            continue;
        }
        const column = def.refs[key]?.column ?? key;
        values[column] = key in def.refs ? refs.columns[key] : entry.value;
    }

    if (def.validate) {
        const invalidValue = await def.validate(row, values, userId);
        if (invalidValue) return rejected(invalidValue);
    }

    try {
        let target = row;
        if (!target) {
            target = await Model.create(
                {
                    ...values,
                    uid: op.uid,
                    user_id: userId,
                    field_clocks: clocks,
                },
                { syncApplied: true }
            );
        } else if (Object.keys(values).length > 0) {
            target.set({ ...values, field_clocks: clocks });
            await target.save({ syncApplied: true });
        } else if (Object.keys(listValues).length > 0) {
            // Only a list changed: its clock still has to be stored.
            target.set('field_clocks', clocks);
            await target.save({ syncApplied: true });
        }
        await writeLists(def, target, listValues);
    } catch (error) {
        if (error.name && error.name.startsWith('Sequelize')) {
            return rejected('invalid_value');
        }
        throw error;
    }

    if (rejectedFields.length === 0) return { status: 'applied' };

    await models().SyncConflict.bulkCreate(
        rejectedFields.map((field) => ({
            user_id: userId,
            entity: op.entity,
            uid: op.uid,
            field,
            losing_value: op.fields[field].value ?? null,
            losing_hlc: op.fields[field].hlc,
            winning_hlc: row.field_clocks[field],
            op_id: op.op_id,
        }))
    );
    return { status: 'conflict', rejected_fields: rejectedFields };
}

async function applyDelete(userId, op) {
    if (!hlc.isAcceptable(op.hlc)) return rejected('invalid_clock');
    const def = ENTITIES[op.entity];
    const row = await models()[def.model].findOne({ where: { uid: op.uid } });
    if (!row) return { status: 'applied' };
    if (row.user_id !== userId) return rejected('forbidden');
    hlc.observe(op.hlc);
    if (def.destroy) await def.destroy(row);
    else await row.destroy();
    return { status: 'applied' };
}

async function applyOp(userId, op) {
    if (!op || typeof op !== 'object') return rejected('invalid_op');
    if (!ENTITIES[op.entity]) return rejected('unknown_entity');
    if (typeof op.uid !== 'string' || !UID_FORMAT.test(op.uid)) {
        return rejected('invalid_uid');
    }
    if (op.action === 'upsert') return applyUpsert(userId, op);
    if (op.action === 'delete') return applyDelete(userId, op);
    if (
        op.entity === 'task' &&
        (op.action === 'complete_occurrence' || op.action === 'skip_occurrence')
    ) {
        return applyOccurrence(userId, op);
    }
    return rejected('unknown_action');
}

// Operations apply one after the other, in the order the device made them;
// one bad op is answered as rejected without stopping the batch.
async function push(userId, ops) {
    const { SyncOp } = models();
    const results = [];
    for (const op of ops) {
        const opId = op && op.op_id;
        if (typeof opId !== 'string' || !OP_ID_FORMAT.test(opId)) {
            results.push({ op_id: opId ?? null, ...rejected('invalid_op_id') });
            continue;
        }
        const seen = await SyncOp.findOne({
            where: { user_id: userId, op_id: opId },
        });
        if (seen) {
            results.push(seen.result);
            continue;
        }
        const outcome = await runWithOp(opId, () => applyOp(userId, op));
        const result = { op_id: opId, ...outcome };
        try {
            await SyncOp.create({ user_id: userId, op_id: opId, result });
        } catch (error) {
            // The same op raced in from a parallel request: answer as that
            // request did.
            if (error.name !== 'SequelizeUniqueConstraintError') throw error;
            const winner = await SyncOp.findOne({
                where: { user_id: userId, op_id: opId },
            });
            results.push(winner.result);
            continue;
        }
        results.push(result);
    }
    return { schema_version: SCHEMA_VERSION, results };
}

module.exports = { describe, pull, snapshot, push, PAGE_MAX };
