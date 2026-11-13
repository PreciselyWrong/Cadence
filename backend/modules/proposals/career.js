'use strict';

// Career proposals (docs/47-proposals.md, Career): the agent pushes one ready
// payload through propose_career; the user applies its offers, follow-ups and
// tasks in parts. Each decision creates its task through the MCP tools and is
// reported to the agent as proposal.decided.
const moment = require('moment-timezone');
const { ConflictError, ValidationError } = require('../../shared/errors');
const { getSafeTimezone } = require('../../utils/timezone-utils');
const { toolsFor } = require('../triage/actions');
const dispatcher = require('../webhooks/dispatcher');
const { logError } = require('../../services/logService');
const repository = require('./repository');
const {
    validateCareer,
    checkCareerDecisions,
    isComplete,
    isFinal,
    createsTask,
    taskFor,
} = require('./core/career');

const keyOf = (decision) => `${decision.kind}:${decision.id}`;

// A new career proposal replaces the ready one, so the user only has the
// latest payload to decide.
async function proposeCareer(user, input) {
    const answer = validateCareer(input);
    await repository.dismissReady(user.id, 'career');
    const row = await repository.create({
        user_id: user.id,
        kind: 'career',
        status: 'ready',
        facts: { ...answer, decisions: [] },
        answer,
    });
    await repository.notify({
        userId: user.id,
        type: 'proposal',
        title: answer.headline,
        message: answer.subtitle ?? undefined,
        level: 'success',
        data: { proposal_uid: row.uid, kind: 'career', status: 'ready' },
        sources: ['desktop', 'mobile'],
    });
    return { uid: row.uid, status: row.status };
}

// The parameters go through the create_task tool, which holds the write rules.
async function createTaskFor(user, answer, decision, today) {
    const created = JSON.parse(
        (await toolsFor(user)('create_task', taskFor(answer, decision, today)))
            .content[0].text
    );
    return created.task?.uid ?? created.uid;
}

// The decisions the user sent. A final decision is not taken twice: an item
// already settled answers already_decided. A later keeps the item open. One
// failed task is reported and the others still run.
async function applyDecisions(user, row, decisions) {
    const today = moment
        .tz(getSafeTimezone(user.timezone))
        .format('YYYY-MM-DD');
    const kept = new Map(
        (row.facts.decisions ?? []).map((decision) => [
            keyOf(decision),
            decision,
        ])
    );
    const results = [];
    const recorded = [];
    for (const decision of decisions) {
        const key = keyOf(decision);
        const previous = kept.get(key);
        const result = { kind: decision.kind, id: decision.id };
        if (previous && isFinal(previous)) {
            results.push({ ...result, state: 'already_decided' });
            continue;
        }
        try {
            const taskUid = createsTask(decision)
                ? await createTaskFor(user, row.answer, decision, today)
                : undefined;
            const stored = taskUid
                ? { ...decision, task_uid: taskUid }
                : decision;
            kept.set(key, stored);
            recorded.push(stored);
            results.push({
                ...result,
                state: 'applied',
                ...(taskUid && { task_uid: taskUid }),
            });
        } catch (error) {
            logError(
                {
                    error,
                    proposalUid: row.uid,
                    kind: decision.kind,
                    id: decision.id,
                },
                'Career decision failed'
            );
            results.push({ ...result, state: 'failed', error: error.message });
        }
    }
    return { results, recorded, decisions: [...kept.values()] };
}

async function announce(userId, uid, decisions) {
    try {
        await dispatcher.emit(userId, 'proposal.decided', {
            text: `Career decided: ${decisions.length}`,
            data: { uid, kind: 'career', decisions },
        });
    } catch (error) {
        logError({ error, proposalUid: uid }, 'Proposal decision event failed');
    }
}

async function applyCareer(user, row, body = {}) {
    if (row.status !== 'ready') {
        throw new ConflictError('Proposal has no answer to apply');
    }
    if (!Array.isArray(body.decisions)) {
        throw new ValidationError('decisions must be a list');
    }
    const decisions = checkCareerDecisions(row.answer, body.decisions);
    const applied = await applyDecisions(user, row, decisions);
    const status = isComplete(row.answer, applied.decisions)
        ? 'applied'
        : 'ready';
    await row.update({
        status,
        facts: { ...row.facts, decisions: applied.decisions },
    });
    if (applied.recorded.length > 0) {
        await announce(user.id, row.uid, applied.recorded);
    }
    return { uid: row.uid, status, results: applied.results };
}

module.exports = { proposeCareer, applyCareer };
