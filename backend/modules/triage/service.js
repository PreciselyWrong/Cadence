'use strict';

// The "À trier" queue (docs/40-triage.md): what the rules deduce and what the
// assistant proposed, each at most once per task, minus what the user already
// settled for the current state of the task.
const moment = require('moment-timezone');
const { getSafeTimezone } = require('../../utils/timezone-utils');
const { NotFoundError, ValidationError } = require('../../shared/errors');
const briefService = require('../daily-plan/brief/service');
const { collectInput } = require('../daily-plan/brief/collect');
const repository = require('./repository');
const { ruleItems } = require('./core/items');
const { taskFingerprint } = require('./core/fingerprint');
const { applyAction } = require('./actions');
const autoClassify = require('../auto-classify/service');
const mail = require('./mail');

const SETTLED = new Set(['kept', 'applied']);
const NOTE_PREVIEW = 300;
const KEY_MAX = 150;

async function readInput(user) {
    const settings = await briefService.getBriefSettings(user);
    const now = new Date();
    const today = moment
        .tz(now, getSafeTimezone(user.timezone))
        .format('YYYY-MM-DD');
    const input = await collectInput(user, settings, {
        today,
        now,
        allOpen: true,
    });
    return { input, settings };
}

function serializeTask(task) {
    return {
        uid: task.uid,
        name: task.name,
        note: task.note ? task.note.slice(0, NOTE_PREVIEW) : null,
        status: task.status,
        due_date: task.due_date,
        project_name: task.project_name,
        tags: task.tags,
        recurring: task.recurring,
        fingerprint: taskFingerprint(task),
    };
}

// `rows` are the stored decisions and proposals of the user.
function buildQueue(input, settings, rows) {
    const byUid = new Map(input.tasks.map((task) => [task.uid, task]));
    const rowOf = new Map(rows.map((row) => [row.task_uid, row]));
    const current = (uid) => {
        const row = rowOf.get(uid);
        const task = byUid.get(uid);
        return row && task && row.fingerprint === taskFingerprint(task)
            ? row
            : null;
    };

    const items = ruleItems(input, settings).filter((item) => {
        if (!item.task_uid) return true;
        return (
            byUid.has(item.task_uid) &&
            !SETTLED.has(current(item.task_uid)?.state)
        );
    });
    const taken = new Set(items.map((item) => item.task_uid));

    for (const task of input.tasks) {
        if (taken.has(task.uid) || task.file_backed) continue;
        const row = current(task.uid);
        if (row?.state === 'pending' && row.proposal) {
            items.push({
                key: `assistant:${task.uid}`,
                type: 'assistant',
                source: 'assistant',
                task_uid: task.uid,
                action: row.proposal.action,
                payload: row.proposal.payload ?? null,
                reason: row.proposal.reason,
                details: [],
                question: null,
            });
        }
    }

    const tasks = {};
    for (const item of items) {
        if (item.task_uid)
            tasks[item.task_uid] = serializeTask(byUid.get(item.task_uid));
    }
    return { items, tasks, count: items.length };
}

// The classifier's cards (modules/auto-classify) follow the rest.
async function getQueue(user) {
    const { input, settings } = await readInput(user);
    const queue = buildQueue(
        input,
        settings,
        await repository.findAllForUser(user.id)
    );
    const byUid = new Map(input.tasks.map((task) => [task.uid, task]));
    queue.items.push(...(await mail.queueItems(user.id)));
    for (const item of await autoClassify.queueItems(user)) {
        queue.items.push(item);
        const task = item.task_uid && byUid.get(item.task_uid);
        if (task) queue.tasks[task.uid] = serializeTask(task);
    }
    return {
        ...queue,
        count: queue.items.length,
        mail_archive: mail.archiveAvailable(),
    };
}

async function findOpenTask(user, taskUid) {
    if (typeof taskUid !== 'string' || !taskUid) {
        throw new ValidationError('task_uid is required');
    }
    const { input } = await readInput(user);
    const task = input.tasks.find((candidate) => candidate.uid === taskUid);
    if (!task) throw new NotFoundError('Task not found');
    return task;
}

// "Keep as it is": the task leaves the queue until it changes.
async function keep(user, taskUid) {
    const task = await findOpenTask(user, taskUid);
    await repository.save(user.id, taskUid, {
        fingerprint: taskFingerprint(task),
        state: 'kept',
        proposal: null,
    });
    return { task_uid: taskUid, state: 'kept' };
}

// Runs what the user validated, possibly corrected. The same idempotency key
// does nothing twice: a call sent again after a lost answer is not a new order.
// The key is taken before the work, so a resend arriving during it is caught;
// a crash in between leaves the order undone, and its proposal still queued.
async function apply(
    user,
    { task_uid: taskUid, action, payload, idempotency_key: key }
) {
    if (
        key !== undefined &&
        (typeof key !== 'string' || key.length > KEY_MAX)
    ) {
        throw new ValidationError('idempotency_key is not valid');
    }
    const replayed = { task_uid: taskUid, state: 'applied', replayed: true };
    const row = await repository.findOne(user.id, taskUid);
    if (key && row?.apply_key === key) return replayed;

    const task = await findOpenTask(user, taskUid);
    const reserved =
        !key ||
        (await repository.reserveKey(user.id, taskUid, key, {
            fingerprint: taskFingerprint(task),
            state: 'none',
            proposal: null,
        }));
    if (!reserved) return replayed;
    try {
        await applyAction(user, task, action, payload);
    } catch (error) {
        if (key) await repository.releaseKey(user.id, taskUid);
        throw error;
    }

    const after = await readInput(user);
    const changed = after.input.tasks.find((t) => t.uid === taskUid);
    await repository.save(user.id, taskUid, {
        fingerprint: taskFingerprint(changed ?? task),
        state: 'applied',
        proposal: null,
        apply_key: key ?? null,
    });
    return { task_uid: taskUid, state: 'applied' };
}

module.exports = { getQueue, buildQueue, keep, apply };
