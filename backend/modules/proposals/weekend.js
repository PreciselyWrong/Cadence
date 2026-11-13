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
    validateWeekend,
    checkWeekendDecisions,
    recordDecisions,
    carryDecisions,
    isComplete,
    checkEventReport,
    reportEvent,
} = require('./core/weekend');

// A new weekend proposal replaces the ready one. Its final decisions carry over
// to the slots of the same id, so an outing already decided is not asked again.
async function proposeWeekend(user, input) {
    const answer = validateWeekend(input);
    const replaced = await repository.findReady(user.id, 'weekend');
    const decisions = replaced
        ? carryDecisions(replaced.facts?.decisions ?? [], answer)
        : [];
    await repository.dismissReady(user.id, 'weekend');
    const row = await repository.create({
        user_id: user.id,
        kind: 'weekend',
        status: 'ready',
        facts: { ...answer, decisions },
        answer,
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

module.exports = { proposeWeekend, applyWeekend, reportWeekendEvent };
