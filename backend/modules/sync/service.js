'use strict';

const { Op } = require('sequelize');
const {
    SCHEMA_VERSION,
    ENTITIES,
    listsOf,
    serverFieldsOf,
} = require('./registry');
const { serializeRow } = require('./serialize');
const hlc = require('./hlc');
const { runWithOp } = require('./context');
const { applyOccurrence } = require('./occurrences');
const { runExclusive } = require('./rowMutex');
const { purgedThrough } = require('./compaction');
const { withRowLock } = require('../../utils/db-dialect');
const todoMdSync = require('../todo-md/syncHook');

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
            'journal_compaction',
        ],
        entities: Object.entries(ENTITIES).map(([name, def]) => ({
            name,
            version: def.version,
            // 'user': the uid is unique per user (default habit groups).
            uid_scope: def.uidScope ?? 'global',
            fields: def.fields,
            server_fields: serverFieldsOf(name),
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

// Thrown inside the row transaction so that a refused write rolls back.
class Refusal extends Error {
    constructor(reason) {
        super(reason);
        this.reason = reason;
    }
}

// Another process created the row between the read and the insert.
class CreateRaceLost extends Error {}

// Never below the compaction watermark: a journal compacted down to nothing
// must still hand out a cursor its pulls accept.
async function latestCursor(userId) {
    const max = await models().SyncChange.max('id', {
        where: { user_id: userId },
    });
    return Math.max(max || 0, await purgedThrough(userId));
}

async function pull(userId, cursor, limit) {
    // Entries below the watermark may include dropped tombstones.
    if (cursor < (await purgedThrough(userId))) {
        return { schema_version: SCHEMA_VERSION, reset_required: true };
    }
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

async function resolveRefs(def, userId, fields, transaction) {
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
            transaction,
        });
        if (!target) return { error: `invalid_reference:${key}` };
        columns[key] = target.id;
    }
    return { columns };
}

async function resolveLists(def, userId, fields, transaction) {
    const ids = {};
    for (const [key, list] of Object.entries(def.lists || {})) {
        if (!(key in fields)) continue;
        const uids = [...new Set(fields[key].value)];
        const found = await models()[ENTITIES[list.entity].model].findAll({
            where: { uid: uids, user_id: userId },
            attributes: ['id'],
            transaction,
        });
        if (found.length !== uids.length) {
            return { error: `invalid_reference:${key}` };
        }
        ids[key] = found.map((r) => r.id);
    }
    return { ids };
}

async function writeLists(def, row, lists, transaction) {
    const { sequelize } = models();
    for (const [key, ids] of Object.entries(lists)) {
        const list = def.lists[key];
        const Through = sequelize.models[list.through];
        await Through.destroy({
            where: { [list.key]: row.id },
            syncApplied: true,
            transaction,
        });
        if (ids.length > 0) {
            await Through.bulkCreate(
                ids.map((id) => ({ [list.key]: row.id, [list.otherKey]: id })),
                { syncApplied: true, transaction }
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

async function wasDeleted(userId, entity, uid, transaction) {
    const last = await models().SyncChange.findOne({
        where: { user_id: userId, entity, uid },
        order: [['id', 'DESC']],
        attributes: ['op'],
        transaction,
    });
    return last?.op === 'delete';
}

// A uid is unique across users, except for entities with `uidScope: 'user'`
// (the default habit groups share fixed ids between users).
function findByUid(def, userId, uid, { transaction, lock } = {}) {
    return models()[def.model].findOne({
        where: def.uidScope === 'user' ? { uid, user_id: userId } : { uid },
        ...(transaction ? { transaction } : {}),
        ...(lock ? { lock } : {}),
    });
}

// Same key for every op on one row; null for an op too malformed to name one.
function rowKey(userId, op) {
    const def = op && ENTITIES[op.entity];
    if (!def || typeof op.uid !== 'string') return null;
    return def.uidScope === 'user'
        ? `${op.entity}:${userId}:${op.uid}`
        : `${op.entity}:${op.uid}`;
}

async function refuseUpsert(userId, op, row, transaction) {
    if (row && row.user_id !== userId) return rejected('forbidden');
    // Delete wins: an edit made offline to a row removed elsewhere must
    // not bring it back.
    if (!row && (await wasDeleted(userId, op.entity, op.uid, transaction))) {
        return rejected('deleted');
    }
    return null;
}

async function applyUpsert(userId, op) {
    const def = ENTITIES[op.entity];
    const invalid = validateFields(def, op.fields);
    if (invalid) return rejected(invalid);

    const row = await findByUid(def, userId, op.uid);
    const refused = await refuseUpsert(userId, op, row);
    if (refused) return refused;

    // Rows mirrored from a TODO.md file answer to the file, not to the merge.
    // The file write happens outside any transaction, so before the row
    // lock: inside it, its own write to the row would wait on that lock.
    const fromFile = await todoMdSync.intercept(userId, op, row);
    if (fromFile) return fromFile;

    // A create that lost the race to another process is merged again, onto
    // the row that process made.
    let merged;
    try {
        merged = await mergeLocked(userId, op, false);
    } catch (error) {
        if (!(error instanceof CreateRaceLost)) throw error;
        merged = await mergeLocked(userId, op, true);
    }
    if (merged instanceof Refusal) return rejected(merged.reason);

    // After the commit: the task event it writes references the row.
    if (def.afterApply) await def.afterApply(merged.applied);
    return merged.outcome;
}

function mergeLocked(userId, op, lastTry) {
    return withRowLock(models().sequelize, (lock) =>
        mergeUpsert(userId, op, lock, lastTry)
    ).catch((error) => {
        if (error instanceof Refusal) return error;
        throw error;
    });
}

// Reads the row under the lock, merges the pushed fields by clock and writes
// it back, all in `transaction` when the dialect gives one.
async function mergeUpsert(userId, op, { transaction, lock }, lastTry) {
    const def = ENTITIES[op.entity];
    const Model = models()[def.model];
    const row = await findByUid(def, userId, op.uid, { transaction, lock });
    // Checked again: the row may have gone, or come, since the first read.
    const refused = await refuseUpsert(userId, op, row, transaction);
    if (refused) throw new Refusal(refused.reason);

    const refs = await resolveRefs(def, userId, op.fields, transaction);
    if (refs.error) throw new Refusal(refs.error);
    const lists = await resolveLists(def, userId, op.fields, transaction);
    if (lists.error) throw new Refusal(lists.error);

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
        if (invalidValue) throw new Refusal(invalidValue);
    }
    if (def.prepareValues) def.prepareValues(row, values);

    const previous = row && def.afterApply ? row.toJSON() : null;
    const writeOptions = { syncApplied: true, transaction };
    let target = row;
    try {
        if (!target) {
            target = await Model.create(
                {
                    ...values,
                    uid: op.uid,
                    user_id: userId,
                    field_clocks: clocks,
                },
                writeOptions
            );
        } else if (Object.keys(values).length > 0) {
            target.set({ ...values, field_clocks: clocks });
            await target.save(writeOptions);
        } else if (Object.keys(listValues).length > 0) {
            // Only a list changed: its clock still has to be stored.
            target.set('field_clocks', clocks);
            await target.save(writeOptions);
        }
        await writeLists(def, target, listValues, transaction);
    } catch (error) {
        if (
            !row &&
            !lastTry &&
            error.name === 'SequelizeUniqueConstraintError'
        ) {
            throw new CreateRaceLost();
        }
        if (error.name && error.name.startsWith('Sequelize')) {
            throw new Refusal('invalid_value');
        }
        throw error;
    }

    const applied = { row: target, previous, values, clocks, userId };
    if (rejectedFields.length === 0) {
        return { outcome: { status: 'applied' }, applied };
    }

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
        })),
        { transaction }
    );
    return {
        outcome: { status: 'conflict', rejected_fields: rejectedFields },
        applied,
    };
}

async function applyDelete(userId, op) {
    if (!hlc.isAcceptable(op.hlc)) return rejected('invalid_clock');
    const def = ENTITIES[op.entity];
    const row = await findByUid(def, userId, op.uid);
    if (!row) return { status: 'applied' };
    if (row.user_id !== userId) return rejected('forbidden');
    const fromFile = await todoMdSync.intercept(userId, op, row);
    if (fromFile) return fromFile;
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
// one bad op is answered as rejected without stopping the batch. Ops on the
// same row from parallel pushes wait for each other.
async function push(userId, ops) {
    const results = [];
    for (const op of ops) {
        const opId = op && op.op_id;
        if (typeof opId !== 'string' || !OP_ID_FORMAT.test(opId)) {
            results.push({ op_id: opId ?? null, ...rejected('invalid_op_id') });
            continue;
        }
        results.push(
            await runExclusive(rowKey(userId, op), () =>
                pushOne(userId, op, opId)
            )
        );
    }
    return { schema_version: SCHEMA_VERSION, results };
}

async function pushOne(userId, op, opId) {
    const { SyncOp } = models();
    const seen = await SyncOp.findOne({
        where: { user_id: userId, op_id: opId },
    });
    if (seen) return seen.result;

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
        return winner.result;
    }
    return result;
}

module.exports = { describe, pull, snapshot, push, PAGE_MAX };
