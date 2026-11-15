'use strict';

// Agent decision cards (docs/49-agent-decisions.md): proposed by an agent
// over MCP, decided by the user in a deck, applied by code on Hermes side.
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const { getSafeTimezone } = require('../../utils/timezone-utils');
const {
    ConflictError,
    NotFoundError,
    ValidationError,
} = require('../../shared/errors');
const dispatcher = require('../webhooks/dispatcher');
const { logError } = require('../../services/logService');
const repository = require('./repository');
const { scheduleDecisionsReady } = require('./ready');
const {
    KIND_RE,
    STATUSES,
    normalizeProposalBatch,
    normalizeItem,
    validateNote,
    validateReport,
} = require('./core/validate');

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DECIDING_STALE_MS = 5 * 60 * 1000;
const KEY_MAX = 150;
const LATER_HOUR = 8;

const purge = (userId, now = new Date()) =>
    repository.purgeOlderThan(userId, new Date(now - RETENTION_MS));

const serializePublic = (row) => ({
    uid: row.uid,
    kind: row.kind,
    kind_label: row.kind_label,
    key: row.key,
    title: row.title,
    context: row.context ?? null,
    body: row.body ?? null,
    url: row.url ?? null,
    choices: row.choices,
    recommended: row.recommended ?? null,
    reason: row.reason ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
});

const serializeForAgent = (row) => ({
    ...serializePublic(row),
    data: row.data ?? null,
    status: row.status,
    decision: row.decision ?? null,
    note: row.note ?? null,
    later_until: row.later_until ?? null,
    decided_at: row.decided_at ?? null,
    result: row.result ?? null,
});

async function proposeDecisions(user, input) {
    const batch = normalizeProposalBatch(input);
    const counts = {
        created: 0,
        updated: 0,
        reopened: 0,
        already_decided: 0,
        errors: [],
    };
    let notify = false;

    for (const raw of batch.items) {
        let item;
        try {
            item = normalizeItem(raw);
        } catch (error) {
            if (error instanceof ValidationError) {
                counts.errors.push({
                    key: typeof raw?.key === 'string' ? raw.key : '',
                    error: error.message,
                });
                continue;
            }
            throw error;
        }

        // eslint-disable-next-line no-await-in-loop
        const outcome = await upsertItem(
            user.id,
            batch.kind,
            batch.kind_label,
            item
        );
        counts[outcome] += 1;
        if (outcome === 'created' || outcome === 'reopened') {
            notify = true;
        }
    }

    if (notify) scheduleDecisionsReady(user.id);
    return counts;
}

async function upsertItem(userId, kind, kindLabel, item) {
    const existing = await repository.findByKey(userId, kind, item.key);
    if (!existing) {
        try {
            await repository.createCard({
                user_id: userId,
                kind,
                kind_label: kindLabel,
                ...item,
                status: 'pending',
            });
            return 'created';
        } catch (error) {
            if (error.name !== 'SequelizeUniqueConstraintError') throw error;
            return upsertItem(userId, kind, kindLabel, item);
        }
    }
    if (existing.status === 'done' || existing.status === 'deciding') {
        return 'already_decided';
    }
    if (existing.status === 'reviewing') {
        await repository.updateCard(existing, {
            kind_label: kindLabel,
            ...item,
            status: 'pending',
            note: null,
            decision: null,
            decided_at: null,
            later_until: null,
            result: null,
        });
        return 'reopened';
    }
    await repository.updateCard(existing, {
        kind_label: kindLabel,
        ...item,
    });
    return 'updated';
}

async function getPendingDecisions(user, now = new Date()) {
    await purge(user.id, now);
    const rows = await repository.findDue(user.id, now);
    const items = rows.map(serializePublic);
    return { items, count: items.length };
}

async function countDue(userId, now = new Date()) {
    await purge(userId, now);
    return repository.countDue(userId, now);
}

async function listDecisions(user, { kind, status } = {}) {
    const now = new Date();
    await purge(user.id, now);
    if (kind !== undefined && kind !== null) {
        if (typeof kind !== 'string' || !KIND_RE.test(kind)) {
            throw new ValidationError('kind is invalid');
        }
    }
    if (status !== undefined && status !== null) {
        if (typeof status !== 'string' || !STATUSES.has(status)) {
            throw new ValidationError(
                'status must be pending, later, reviewing or done'
            );
        }
    }
    const rows = await repository.findForList(user.id, {
        kind: kind || null,
        status: status || null,
        cutoff: new Date(now - RETENTION_MS),
    });
    return { items: rows.map(serializeForAgent) };
}

function laterUntil(user, value) {
    if (value === undefined || value === null) {
        return moment
            .tz(getSafeTimezone(user.timezone))
            .add(1, 'day')
            .startOf('day')
            .hour(LATER_HOUR)
            .toDate();
    }
    const until = new Date(value);
    if (typeof value !== 'string' || Number.isNaN(+until)) {
        throw new ValidationError('until must be an ISO 8601 date');
    }
    return until;
}

const outcomeOf = (row, extra = {}) => ({
    uid: row.uid,
    status: row.status,
    decision: row.decision,
    later_until: row.later_until ?? null,
    note: row.note ?? null,
    result: row.result ?? null,
    ...extra,
});

const isStale = (row, now) =>
    row.status === 'deciding' && now - row.updated_at > DECIDING_STALE_MS;

function settledAnswer(row, decision, key) {
    if (key && row.decide_key === key) {
        return outcomeOf(row, { replayed: true });
    }
    if (row.status === 'done' && row.decision === decision) {
        return outcomeOf(row, { replayed: true });
    }
    throw new ConflictError('Déjà traité ailleurs.');
}

async function announce(userId, row) {
    try {
        await dispatcher.emit(userId, 'decision.made', {
            text: `Decision made: ${row.decision} (${row.title})`,
            data: {
                decision: {
                    uid: row.uid,
                    kind: row.kind,
                    key: row.key,
                    decision: row.decision,
                    note: row.note ?? null,
                },
            },
        });
    } catch (error) {
        logError({ error, decisionUid: row.uid }, 'Decision event failed');
    }
}

async function decide(
    user,
    uid,
    { decision, note, until, idempotency_key: key } = {}
) {
    if (typeof decision !== 'string' || !decision) {
        throw new ValidationError('decision is required');
    }
    if (
        key !== undefined &&
        (typeof key !== 'string' || !key || key.length > KEY_MAX)
    ) {
        throw new ValidationError('idempotency_key is not valid');
    }

    const row = await repository.findByUid(user.id, uid);
    if (!row) throw new NotFoundError('Decision card not found');

    const now = new Date();
    const open = ['pending', 'later'].includes(row.status);
    if ((key && row.decide_key === key) || (!open && !isStale(row, now))) {
        return settledAnswer(row, decision, key);
    }

    const isChoice =
        decision !== 'later' &&
        decision !== 'note' &&
        Array.isArray(row.choices) &&
        row.choices.some((c) => c.id === decision);

    if (decision !== 'later' && decision !== 'note' && !isChoice) {
        throw new ValidationError(
            'decision is not a valid choice for this card'
        );
    }

    const before = {
        status: open ? row.status : 'pending',
        decide_key: row.decide_key,
    };
    const [taken] = await repository.updateWhere(
        { status: 'deciding' },
        {
            id: row.id,
            status: row.status,
            ...(open
                ? {}
                : {
                      updated_at: {
                          [Op.lt]: new Date(now - DECIDING_STALE_MS),
                      },
                  }),
        }
    );
    if (taken !== 1) {
        await row.reload();
        return settledAnswer(row, decision, key);
    }

    const changes = { decision, decide_key: key ?? before.decide_key };
    try {
        if (decision === 'later') {
            changes.status = 'later';
            changes.later_until = laterUntil(user, until);
        } else if (decision === 'note') {
            changes.status = 'reviewing';
            changes.note = { text: validateNote(note) };
            changes.decided_at = new Date();
            changes.later_until = null;
        } else {
            changes.status = 'done';
            changes.decided_at = new Date();
            changes.later_until = null;
            changes.result = { state: 'requested' };
        }
        await repository.updateWhere(changes, { id: row.id });
    } catch (error) {
        await repository.updateWhere(before, {
            id: row.id,
            status: 'deciding',
        });
        throw error;
    }

    await row.reload();
    await announce(user.id, row);
    return outcomeOf(row);
}

const sameResult = (a, b) =>
    a.state === b.state &&
    (a.error ?? null) === (b.error ?? null) &&
    (a.url ?? null) === (b.url ?? null);

async function reportDecision(user, input = {}) {
    const { kind, key, ok, error, url } = validateReport(input);
    const row = await repository.findByKey(user.id, kind, key);
    if (!row) throw new NotFoundError('Decision card not found');
    if (row.status !== 'done') {
        throw new ConflictError('Decision card is not decided');
    }
    const nextResult = {
        state: ok ? 'done' : 'failed',
        ...(error ? { error } : {}),
        ...(url ? { url } : {}),
    };
    if (
        row.result &&
        (row.result.state === 'done' || row.result.state === 'failed')
    ) {
        if (sameResult(row.result, nextResult)) {
            return { uid: row.uid, result: row.result };
        }
        throw new ConflictError('Result already recorded');
    }
    await repository.updateCard(row, { result: nextResult });
    return { uid: row.uid, result: nextResult };
}

module.exports = {
    proposeDecisions,
    getPendingDecisions,
    countDue,
    listDecisions,
    decide,
    reportDecision,
};
