'use strict';

// Week-end proposals (docs/48-weekend.md): the agent pushes one ready payload
// through propose_weekend; the user picks per slot and sends the choices with
// « Valider ». Accepted outings are created by capgw, which reports each event
// back. Nothing reaches the calendar from here.
const { ConflictError, ValidationError } = require('../../shared/errors');
const dispatcher = require('../webhooks/dispatcher');
const { logError } = require('../../services/logService');
const repository = require('./repository');
const {
    checkWeekendRequest,
    validateWeekend,
    checkWeekendDecisions,
    recordDecisions,
    carryDecisions,
    isComplete,
    checkEventReport,
    reportEvent,
} = require('./core/weekend');

const sameDays = (a = [], b = []) =>
    a.length === b.length && a.every((day, i) => day === b[i]);

// The user's request for chosen days: a pending proposal the agent fills with
// propose_weekend. The same days asked again keep the pending request; other
// days replace it. `requestAgent` tells the agent (proposal.requested).
async function requestWeekend(user, rawDates, today, requestAgent) {
    const dates = checkWeekendRequest(rawDates, today);
    const pending = await repository.findPending(user.id, 'weekend');
    if (pending && sameDays(pending.facts?.request?.dates, dates)) {
        return { row: pending, created: false };
    }
    if (pending) await pending.update({ status: 'dismissed' });
    const row = await repository.create({
        user_id: user.id,
        kind: 'weekend',
        status: 'pending',
        facts: { request: { dates } },
    });
    await requestAgent(row);
    return { row, created: true };
}

// A new weekend proposal fills the pending request if there is one, else it is
// a new row; either way it replaces the ready one. Its final decisions carry
// over to the slots of the same id, so an outing already decided is not asked
// again.
async function proposeWeekend(user, input) {
    const answer = validateWeekend(input);
    const replaced = await repository.findReady(user.id, 'weekend');
    const decisions = replaced
        ? carryDecisions(replaced.facts?.decisions ?? [], answer)
        : [];
    await repository.dismissReady(user.id, 'weekend');
    const pending = await repository.findPending(user.id, 'weekend');
    const fields = { status: 'ready', answer, error: null };
    const row = pending
        ? await pending.update({
              ...fields,
              facts: { ...answer, request: pending.facts?.request, decisions },
          })
        : await repository.create({
              ...fields,
              user_id: user.id,
              kind: 'weekend',
              facts: { ...answer, decisions },
          });
    await repository.notify({
        userId: user.id,
        type: 'proposal',
        title: answer.headline,
        message: answer.subtitle ?? undefined,
        level: 'success',
        data: { proposal_uid: row.uid, kind: 'weekend' },
        sources: ['desktop', 'mobile'],
    });
    return { uid: row.uid, status: row.status };
}

async function announce(userId, uid, decisions) {
    try {
        await dispatcher.emit(userId, 'proposal.decided', {
            text: `Weekend decided: ${decisions.length}`,
            data: { uid, kind: 'weekend', decisions },
        });
    } catch (error) {
        logError({ error, proposalUid: uid }, 'Proposal decision event failed');
    }
}

// The user's choices for the slots. The proposal is applied once every slot
// with an activity is settled; an open « other » request keeps it ready.
async function applyWeekend(user, row, body = {}) {
    if (row.status !== 'ready') {
        throw new ConflictError('Proposal has no answer to apply');
    }
    if (!Array.isArray(body.decisions)) {
        throw new ValidationError('decisions must be a list');
    }
    const previous = row.facts.decisions ?? [];
    const checked = checkWeekendDecisions(row.answer, body.decisions, previous);
    const decisions = recordDecisions(previous, checked);
    const status = isComplete(row.answer, decisions) ? 'applied' : 'ready';
    await row.update({ status, facts: { ...row.facts, decisions } });
    if (checked.length > 0) {
        await announce(user.id, row.uid, checked);
    }
    return {
        uid: row.uid,
        status,
        results: checked.map(({ slot_id, op }) => ({
            slot_id,
            op,
            state: 'applied',
        })),
    };
}

// capgw's report of a calendar event: created (with its link) or failed. The
// proposal may already be applied, since the events come after the choices.
async function reportWeekendEvent(row, body = {}) {
    if (!['ready', 'applied'].includes(row.status)) {
        throw new ConflictError('Proposal has no answer to report on');
    }
    const report = checkEventReport(body);
    const decisions = reportEvent(row.facts.decisions ?? [], report);
    await row.update({ facts: { ...row.facts, decisions } });
}

module.exports = {
    requestWeekend,
    proposeWeekend,
    applyWeekend,
    reportWeekendEvent,
};
