'use strict';

// The brief's memory of what was shown and what the user did with it
// (docs/39-daily-brief.md, Memory). Writes only brief_proposals rows: never a
// task, an event or a mail. The engine reads them through listForEngine.
const { Op } = require('sequelize');
const { BriefProposal } = require('../../../models');
const { ConflictError, ValidationError } = require('../../../shared/errors');
const { ALERT_TYPES, normalizeBriefSettings } = require('./settings');
const dailyPlanRepository = require('../repository');
const briefRepository = require('./repository');

const KINDS = ['move', 'tonight', 'anticipate', 'question', 'mail', 'feedback'];
// "pending" is set by the brief itself, never by the client.
const CLIENT_DECISIONS = ['accepted', 'refused', 'ignored'];
const VOTES = ['useful', 'noise'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PROPOSAL_JSON = 4096;
const MAX_REASON = 500;
const MAX_KEY = 150;
const MAX_REF = 255;

const isPlainObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const text = (value, max, name) => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ValidationError(`${name} is required`);
    }
    const trimmed = value.trim();
    if (trimmed.length > max) {
        throw new ValidationError(`${name} is too long`);
    }
    return trimmed;
};

// The shape the engine reads (rules/moves.js, rules/contexts.js).
function toEngine(row) {
    return {
        uid: row.uid,
        kind: row.kind,
        target_type: row.target_type,
        target_ref: row.target_ref,
        fingerprint: row.fingerprint,
        proposal: row.proposal ?? null,
        decision: row.decision,
        reason: row.reason ?? null,
        brief_date: String(row.brief_date).slice(0, 10),
        decided_at: row.decided_at
            ? new Date(row.decided_at).toISOString()
            : null,
    };
}

function validateProposal(kind, decision, proposal) {
    if (proposal === null || proposal === undefined) return null;
    if (!isPlainObject(proposal)) {
        throw new ValidationError('proposal must be an object');
    }
    if (JSON.stringify(proposal).length > MAX_PROPOSAL_JSON) {
        throw new ValidationError('proposal is too large');
    }
    if (kind === 'feedback') {
        // `brief` is the single feedback on the whole screen, not an alert type.
        if (
            proposal.card_type !== 'brief' &&
            !ALERT_TYPES.includes(proposal.card_type)
        ) {
            throw new ValidationError('feedback needs a known card_type');
        }
        if (!VOTES.includes(proposal.vote)) {
            throw new ValidationError('feedback vote is useful or noise');
        }
    }
    if (kind === 'move' && decision === 'refused') {
        if (!DATE_PATTERN.test(proposal.to ?? '')) {
            throw new ValidationError('a refused move needs its target day');
        }
    }
    return proposal;
}

function validateDecisionInput(input) {
    if (!KINDS.includes(input.kind)) {
        throw new ValidationError(`kind is one of ${KINDS.join(', ')}`);
    }
    if (!CLIENT_DECISIONS.includes(input.decision)) {
        throw new ValidationError(
            `decision is one of ${CLIENT_DECISIONS.join(', ')}`
        );
    }
    const target_type = text(input.target_type, 16, 'target_type');
    const target_ref = text(input.target_ref, MAX_REF, 'target_ref');
    const idempotency_key = text(
        input.idempotency_key,
        MAX_KEY,
        'idempotency_key'
    );
    const fingerprint =
        input.fingerprint === undefined || input.fingerprint === null
            ? null
            : text(input.fingerprint, MAX_REF, 'fingerprint');
    const reason =
        input.reason === undefined || input.reason === null
            ? null
            : text(input.reason, MAX_REASON, 'reason');
    const proposal = validateProposal(
        input.kind,
        input.decision,
        input.proposal
    );
    return {
        kind: input.kind,
        decision: input.decision,
        target_type,
        target_ref,
        idempotency_key,
        fingerprint,
        reason,
        proposal,
    };
}

async function findByKey(key) {
    return BriefProposal.findOne({ where: { idempotency_key: key } });
}

// Records what the user decided. Idempotent on idempotency_key: the same key
// returns the row already stored, never a second one.
async function recordDecision(user, input, { now = new Date() } = {}) {
    if (!DATE_PATTERN.test(input.brief_date ?? '')) {
        throw new ValidationError('brief_date must be YYYY-MM-DD');
    }
    const clean = validateDecisionInput(input);
    const existing = await findByKey(clean.idempotency_key);
    if (existing) {
        if (existing.user_id !== user.id) {
            throw new ConflictError('idempotency_key is already used');
        }
        return toEngine(existing);
    }
    // The proposal shown as pending becomes decided, so one proposal keeps one row.
    const shown = clean.fingerprint
        ? await BriefProposal.findOne({
              where: {
                  user_id: user.id,
                  brief_date: input.brief_date,
                  kind: clean.kind,
                  fingerprint: clean.fingerprint,
                  decision: 'pending',
              },
          })
        : null;
    if (shown) {
        await shown.update({ ...clean, decided_at: now });
        return toEngine(shown);
    }
    try {
        const row = await BriefProposal.create({
            user_id: user.id,
            brief_date: input.brief_date,
            ...clean,
            decided_at: now,
        });
        return toEngine(row);
    } catch (error) {
        // Two identical requests at once: the second one finds the first row.
        if (error.name !== 'SequelizeUniqueConstraintError') throw error;
        const winner = await findByKey(clean.idempotency_key);
        if (!winner || winner.user_id !== user.id) {
            throw new ConflictError('idempotency_key is already used');
        }
        return toEngine(winner);
    }
}

// Records the proposals a brief shows, as pending, so that a later brief can
// mark the ones left without a decision as ignored. A proposal already
// recorded for that day (a regenerated brief) keeps its decision.
async function recordShown(user, briefDate, brief) {
    const shown = [
        ...(brief.moves || []).map((move) => ({
            kind: 'move',
            target_type: 'task',
            target_ref: move.task_uid,
            fingerprint: move.proposal_key,
            proposal: { from: move.from, to: move.to },
        })),
        ...(brief.anticipate || []).map((card) => ({
            kind: 'anticipate',
            target_type: 'card',
            target_ref: card.key.slice(0, MAX_REF),
            fingerprint: card.key.slice(0, MAX_REF),
            proposal: {
                card_type: card.type,
                task_uids: card.task_uids,
                event_refs: card.event_refs,
            },
        })),
    ];
    for (const item of shown) {
        const found = await BriefProposal.findOne({
            where: {
                user_id: user.id,
                brief_date: briefDate,
                kind: item.kind,
                fingerprint: item.fingerprint,
            },
            attributes: ['id'],
        });
        if (!found) {
            await BriefProposal.create({
                user_id: user.id,
                brief_date: briefDate,
                ...item,
                decision: 'pending',
                decided_at: null,
            });
        }
    }
}

// A proposal shown in an earlier brief and still without a decision is
// ignored: the next brief no longer repeats it identically.
async function markIgnored(user, date, { now = new Date() } = {}) {
    await BriefProposal.update(
        { decision: 'ignored', decided_at: now },
        {
            where: {
                user_id: user.id,
                decision: 'pending',
                brief_date: { [Op.lt]: date },
            },
        }
    );
}

// Decisions of the last `since` day(s) (a YYYY-MM-DD), in the engine's shape.
async function listForEngine(user, since) {
    const rows = await BriefProposal.findAll({
        where: {
            user_id: user.id,
            brief_date: { [Op.gte]: since },
        },
        order: [['id', 'ASC']],
    });
    return rows.map(toEngine);
}

// { [card_type]: { useful, noise } } from the user's feedback.
async function noiseStats(user) {
    const rows = await BriefProposal.findAll({
        where: { user_id: user.id, kind: 'feedback' },
        attributes: ['proposal'],
    });
    const stats = {};
    for (const row of rows) {
        const { card_type: cardType, vote } = row.proposal || {};
        if (!cardType || !VOTES.includes(vote)) continue;
        stats[cardType] ??= { useful: 0, noise: 0 };
        stats[cardType][vote] += 1;
    }
    return stats;
}

// Deletes each user's decisions older than settings.retention.decisionsDays.
async function purgeDecisions(now = new Date()) {
    const users = await briefRepository.findAllUsersForBriefJob();
    let deleted = 0;
    for (const user of users) {
        const settings = normalizeBriefSettings(
            (await dailyPlanRepository.findUiSettings(user.id)).brief
        );
        const cutoff = new Date(
            now.getTime() - settings.retention.decisionsDays * 86400000
        );
        deleted += await BriefProposal.destroy({
            where: { user_id: user.id, created_at: { [Op.lt]: cutoff } },
        });
    }
    return { deleted };
}

module.exports = {
    KINDS,
    CLIENT_DECISIONS,
    recordDecision,
    recordShown,
    markIgnored,
    listForEngine,
    noiseStats,
    purgeDecisions,
    toEngine,
};
