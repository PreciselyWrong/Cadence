'use strict';

// Pure rules for writing a day plan as a list of operations, and the ETag
// that tells a client whether its copy of the plan is still current. No
// database access here: the service reads the lists under lock and stores
// what this module returns.

const crypto = require('crypto');
const moment = require('moment-timezone');
const { ValidationError } = require('../../shared/errors');

const MAX_OPS = 100;
const DEFAULT_DURATION = 30;
const OP_NAMES = [
    'add',
    'remove',
    'slot',
    'unslot',
    'resize',
    'reorder',
    'move',
];

// A write sent with an If-Match that no longer matches the plan. The service
// attaches the current plan so the client can show it without another read.
class PlanChangedError extends Error {
    constructor() {
        super('The day plan changed since it was read');
        this.name = 'PlanChangedError';
        this.plan = null;
    }
}

// Short, stable fingerprint of the ordered items. Clients compare it with
// If-Match; it moves whenever a task, its time or its length moves.
function planEtag(items) {
    const payload = JSON.stringify(
        items.map((item) => [
            item.task_uid,
            item.start_minute,
            item.duration_minutes,
        ])
    );
    return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

// Adds the fingerprint to a plan response, the shape GET returns.
function withEtag(payload) {
    return { ...payload, etag: planEtag(payload.plan?.items || []) };
}

function isUidOrNull(value) {
    return value === undefined || value === null || typeof value === 'string';
}

function isPlanDate(value) {
    return (
        typeof value === 'string' && moment(value, 'YYYY-MM-DD', true).isValid()
    );
}

function parseOp(raw, planDate) {
    if (!raw || typeof raw !== 'object' || !OP_NAMES.includes(raw.op)) {
        throw new ValidationError(
            `Each op must be one of ${OP_NAMES.join(', ')}`
        );
    }
    if (typeof raw.task_uid !== 'string' || !raw.task_uid) {
        throw new ValidationError('Each op needs a task_uid');
    }
    if (!isUidOrNull(raw.before_uid)) {
        throw new ValidationError('before_uid must be a task uid or null');
    }
    if (raw.op === 'slot' && (raw.start_minute ?? null) === null) {
        throw new ValidationError('A slot op needs a start_minute');
    }
    if (raw.op === 'resize' && (raw.duration_minutes ?? null) === null) {
        throw new ValidationError('A resize op needs a duration_minutes');
    }
    if (raw.op === 'move') {
        if (!isPlanDate(raw.to_date) || raw.to_date === planDate) {
            throw new ValidationError(
                'A move op needs a to_date (YYYY-MM-DD) other than this day'
            );
        }
    }
    return raw;
}

// Checks the shape of the whole batch; values inside the day (ranges,
// overlaps, existence of tasks) are checked against the plan later.
function parseOps(ops, planDate) {
    if (!Array.isArray(ops) || ops.length === 0 || ops.length > MAX_OPS) {
        throw new ValidationError(
            `ops must be a list of 1 to ${MAX_OPS} operations`
        );
    }
    return ops.map((raw) => parseOp(raw, planDate));
}

function findIndex(list, uid) {
    return list.findIndex((line) => line.task_uid === uid);
}

function insertLine(list, line, beforeUid) {
    if (beforeUid === undefined || beforeUid === null) {
        list.push(line);
        return;
    }
    const index = findIndex(list, beforeUid);
    if (index < 0) {
        throw new ValidationError("before_uid is not on this day's plan");
    }
    list.splice(index, 0, line);
}

// add and slot: a line already planned keeps its place and takes the fields
// the op gives; a new line is appended, or put before before_uid.
function upsertLine(list, task, op) {
    const index = findIndex(list, task.uid);
    if (index >= 0) {
        const line = list[index];
        if (op.start_minute !== undefined) {
            line.start_minute = op.start_minute ?? null;
        }
        if (op.duration_minutes !== undefined && op.duration_minutes !== null) {
            line.duration_minutes = op.duration_minutes;
        }
        return;
    }
    insertLine(
        list,
        {
            task_id: task.id,
            task_uid: task.uid,
            start_minute: op.start_minute ?? null,
            duration_minutes:
                op.duration_minutes ??
                task.estimated_minutes ??
                DEFAULT_DURATION,
        },
        op.before_uid
    );
}

function updateLine(list, uid, change) {
    const index = findIndex(list, uid);
    if (index >= 0) change(list[index]);
}

// Applies the ops in order to copies of the day lists. `days` maps each
// date to its lines (task_id, task_uid, start_minute, duration_minutes);
// `tasks` maps every task uid the ops name to its task row. Returns the new
// lists for every date in `days`; the input is not changed.
function applyOps(days, ops, { planDate, tasks }) {
    const next = new Map();
    for (const [date, lines] of days) {
        next.set(
            date,
            lines.map((line) => ({ ...line }))
        );
    }

    for (const op of ops) {
        const list = next.get(planDate);
        const task = tasks.get(op.task_uid);
        switch (op.op) {
            case 'add':
            case 'slot':
                upsertLine(list, task, op);
                break;
            case 'remove': {
                const index = findIndex(list, op.task_uid);
                if (index >= 0) list.splice(index, 1);
                break;
            }
            case 'unslot':
                updateLine(list, op.task_uid, (line) => {
                    line.start_minute = null;
                });
                break;
            case 'resize':
                updateLine(list, op.task_uid, (line) => {
                    line.duration_minutes = op.duration_minutes;
                });
                break;
            case 'reorder': {
                const index = findIndex(list, op.task_uid);
                if (index < 0) break;
                const [line] = list.splice(index, 1);
                insertLine(list, line, op.before_uid);
                break;
            }
            case 'move': {
                const target = next.get(op.to_date);
                const index = findIndex(list, op.task_uid);
                const line =
                    index >= 0
                        ? list.splice(index, 1)[0]
                        : {
                              task_id: task.id,
                              task_uid: task.uid,
                              start_minute: null,
                              duration_minutes:
                                  task.estimated_minutes ?? DEFAULT_DURATION,
                          };
                if (!target.some((other) => other.task_uid === task.uid)) {
                    target.push({ ...line, start_minute: null });
                }
                break;
            }
            default:
                throw new ValidationError(`Unknown op ${op.op}`);
        }
    }

    return next;
}

module.exports = {
    DEFAULT_DURATION,
    MAX_OPS,
    PlanChangedError,
    planEtag,
    withEtag,
    parseOps,
    applyOps,
};
