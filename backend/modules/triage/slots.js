'use strict';

// A slot an agent proposes for related links: the only planning an AI may
// suggest. It waits in the triage queue; only the user's tap creates the task
// and places it in the day's plan (docs/40-triage.md).
const crypto = require('crypto');
const { NotFoundError, ValidationError } = require('../../shared/errors');
const links = require('../links/service');
const dailyPlanService = require('../daily-plan/service');
const { toolsFor } = require('./actions');
const repository = require('./repository');

const PREFIX = 'slot:';
const TITLE_MAX = 255;
const REASON_MAX = 200;
const LINKS_MAX = 20;
const DEFAULT_DURATION = 60;
const MINUTES_IN_DAY = 1440;
const FINGERPRINT = 'slot';

const isDay = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && !Number.isNaN(Date.parse(value));

const inRange = (value, min, max) =>
    Number.isInteger(value) && value >= min && value <= max;

async function proposeSlot(user, input = {}) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!title || title.length > TITLE_MAX) {
        throw new ValidationError('title is required');
    }
    if (!reason || reason.length > REASON_MAX) {
        throw new ValidationError('reason is required, in one short sentence');
    }
    if (!isDay(input.date)) {
        throw new ValidationError('date must be YYYY-MM-DD');
    }
    const startMinute = input.start_minute ?? null;
    if (startMinute !== null && !inRange(startMinute, 0, 1439)) {
        throw new ValidationError('start_minute must be within the day');
    }
    const duration = input.duration_minutes ?? DEFAULT_DURATION;
    if (!inRange(duration, 5, 720)) {
        throw new ValidationError('duration_minutes must be 5 to 720');
    }
    if (startMinute !== null && startMinute + duration > MINUTES_IN_DAY) {
        throw new ValidationError('the slot must end within the day');
    }
    const uids = Array.isArray(input.link_uids) ? input.link_uids : [];
    if (uids.length === 0 || uids.length > LINKS_MAX) {
        throw new ValidationError(`link_uids must hold 1 to ${LINKS_MAX} uids`);
    }
    const found = await Promise.all(uids.map((uid) => links.get(user.id, uid)));
    const id = crypto.randomUUID();
    await repository.save(user.id, `${PREFIX}${id}`, {
        fingerprint: FINGERPRINT,
        state: 'pending',
        proposal: {
            action: 'accept_slot',
            reason,
            payload: {
                slot_id: id,
                title,
                date: input.date,
                start_minute: startMinute,
                duration_minutes: duration,
                links: found.map((link) => ({
                    uid: link.uid,
                    title: link.title || link.url,
                    url: link.url,
                })),
            },
        },
    });
    return { slot_id: id, state: 'pending' };
}

// Slots still waiting, today or later, as queue items.
function slotItems(rows, today) {
    return rows
        .filter(
            (row) =>
                row.task_uid.startsWith(PREFIX) &&
                row.state === 'pending' &&
                row.proposal?.payload?.date >= today
        )
        .map((row) => ({
            key: row.task_uid,
            type: 'link_slot',
            source: 'agent',
            task_uid: null,
            action: 'accept_slot',
            payload: row.proposal.payload,
            reason: row.proposal.reason,
            details: row.proposal.payload.links.map((link) => link.title),
            question: null,
        }));
}

const findSlot = async (user, id) => {
    const row = await repository.findOne(user.id, `${PREFIX}${id}`);
    if (!row) throw new NotFoundError('Slot not found');
    return row;
};

// The same answer sent again after a lost reply is already done: only the
// opposite answer to a settled slot is refused.
function settledAs(row, id, state) {
    if (row.state === state) return { slot_id: id, state };
    if (row.state !== 'pending') throw new NotFoundError('Slot not found');
    return null;
}

// The task keeps the addresses, so the links stay one tap away from it.
async function acceptSlot(user, id) {
    const row = await findSlot(user, id);
    const settled = settledAs(row, id, 'applied');
    if (settled) return settled;
    const slot = row.proposal.payload;
    const note = slot.links
        .map((link) => `${link.title}\n${link.url}`)
        .join('\n\n');
    const run = toolsFor(user);
    const answer = await run('create_task', {
        name: slot.title,
        note,
        due_date: slot.date,
    });
    const created = JSON.parse(answer.content[0].text);
    const taskUid = created.task?.uid ?? created.uid;

    try {
        await dailyPlanService.applyPlanOps(user, slot.date, [
            {
                op: 'slot',
                task_uid: taskUid,
                start_minute: slot.start_minute,
                duration_minutes: slot.duration_minutes,
            },
        ]);
    } catch (error) {
        // The slot stays open: each new try would otherwise leave a task behind.
        await run('delete_task', { id: taskUid });
        throw error;
    }
    await row.update({ state: 'applied' });
    return { slot_id: id, state: 'applied', task_uid: taskUid };
}

async function refuseSlot(user, id) {
    const row = await findSlot(user, id);
    const settled = settledAs(row, id, 'kept');
    if (settled) return settled;
    await row.update({ state: 'kept' });
    return { slot_id: id, state: 'kept' };
}

module.exports = { proposeSlot, slotItems, acceptSlot, refuseSlot, PREFIX };
