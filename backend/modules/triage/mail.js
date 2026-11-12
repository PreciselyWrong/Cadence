'use strict';

// Mail cards in « À trier » (docs/43-mail-triage.md): an agent proposes the
// threads that ask something of the user, one card per thread; the user
// decides. Cadence stores no message body and never sends.
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const { MailItem } = require('../../models');
const { getSafeTimezone } = require('../../utils/timezone-utils');
const {
    ConflictError,
    NotFoundError,
    ValidationError,
} = require('../../shared/errors');
const { normalizeProposal, threadKey, clean, isDay } = require('./core/mail');
const gateway = require('./mailGateway');

const DECISIONS = new Set(['task', 'reply', 'later', 'dismiss']);
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const KEY_MAX = 150;
const LIST_MAX = 100;
const LATER_HOUR = 8;
// A decision under way holds the card; one left behind by a crash frees it.
const DECIDING_STALE_MS = 5 * 60 * 1000;

const CARD_FIELDS = [
    'from_name',
    'from_address',
    'subject',
    'received_at',
    'summary',
    'suggestion',
    'draft_excerpt',
    'gmail_url',
];
const REOPEN = {
    status: 'pending',
    later_until: null,
    decision: null,
    decided_at: null,
    task_uid: null,
    archived_at: null,
};

const pick = (card) =>
    Object.fromEntries(CARD_FIELDS.map((field) => [field, card[field]]));

const findThread = (userId, key) =>
    MailItem.findOne({ where: { user_id: userId, ...key } });

// Decided cards are kept 30 days, so the agent sees what was settled.
const purge = (userId, now = new Date()) =>
    MailItem.destroy({
        where: {
            user_id: userId,
            status: 'done',
            decided_at: { [Op.lt]: new Date(now - RETENTION_MS) },
        },
    });

// A newer message updates a waiting card or reopens a settled one; an older
// or equal one changes nothing.
async function proposeMail(user, input) {
    const card = normalizeProposal(input);
    const key = { account: card.account, thread_id: card.thread_id };
    const row = await findThread(user.id, key);
    if (!row) {
        try {
            const created = await MailItem.create({
                user_id: user.id,
                ...key,
                ...pick(card),
                status: 'pending',
            });
            return { mail_uid: created.uid, status: created.status };
        } catch (error) {
            if (error.name !== 'SequelizeUniqueConstraintError') throw error;
            return proposeMail(user, input);
        }
    }
    const newer = card.received_at > row.received_at;
    if (row.status === 'pending' && card.received_at >= row.received_at) {
        await row.update(pick(card));
    } else if (row.status === 'later' && newer) {
        await row.update({ ...pick(card), ...REOPEN });
    } else if (row.status === 'done' && card.received_at > row.decided_at) {
        await row.update({ ...pick(card), ...REOPEN });
    }
    return { mail_uid: row.uid, status: row.status };
}

async function resolveMail(user, input) {
    const row = await findThread(user.id, threadKey(input));
    if (!row) throw new NotFoundError('Mail card not found');
    if (row.status !== 'done') {
        await row.update({
            status: 'done',
            decision: 'resolved',
            decided_at: new Date(),
            later_until: null,
        });
    }
    return { mail_uid: row.uid, status: row.status };
}

async function listCards(user) {
    await purge(user.id);
    const rows = await MailItem.findAll({
        where: { user_id: user.id },
        order: [['received_at', 'DESC']],
        limit: LIST_MAX,
    });
    return {
        cards: rows.map((row) => ({
            mail_uid: row.uid,
            account: row.account,
            thread_id: row.thread_id,
            from_address: row.from_address,
            subject: row.subject,
            received_at: row.received_at,
            status: row.status,
            later_until: row.later_until,
            decision: row.decision,
            decided_at: row.decided_at,
        })),
    };
}

async function queueItems(userId, now = new Date()) {
    await purge(userId, now);
    const rows = await MailItem.findAll({
        where: {
            user_id: userId,
            [Op.or]: [
                { status: 'pending' },
                { status: 'later', later_until: { [Op.lte]: now } },
            ],
        },
        order: [['received_at', 'DESC']],
    });
    return rows.map((row) => ({
        key: `mail:${row.uid}`,
        type: 'mail',
        source: 'mail',
        task_uid: null,
        action: 'decide_mail',
        payload: {
            mail_uid: row.uid,
            account: row.account,
            ...pick(row),
        },
        reason: row.summary,
        details: [],
        question: null,
    }));
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
        throw new ValidationError('payload.until must be an ISO 8601 date');
    }
    return until;
}

// The task carries the summary and the Gmail address, so the mail stays one
// tap away from it.
async function createTask(user, row, payload) {
    const { toolsFor } = require('./actions');
    const suggested = row.suggestion ?? {};
    const name =
        clean(payload.name, 255) ??
        suggested.task_name ??
        row.subject ??
        row.summary;
    const dueDate = payload.due_date ?? suggested.due_date;
    if (dueDate !== undefined && dueDate !== null && !isDay(dueDate)) {
        throw new ValidationError('payload.due_date must be YYYY-MM-DD');
    }
    const params = {
        name,
        note: `${row.summary}\n\n${row.gmail_url}`,
        source: 'gmail',
        source_url: row.gmail_url,
    };
    if (dueDate) params.due_date = dueDate;
    // create_task checks the rights on the project, by uid.
    const projectUid = clean(payload.project_uid, 64) ?? suggested.project_uid;
    if (projectUid) params.project_id = projectUid;
    const answer = await toolsFor(user)('create_task', params);
    const created = JSON.parse(answer.content[0].text);
    return created.task?.uid ?? created.uid;
}

const outcome = (row, extra = {}) => ({
    mail_uid: row.uid,
    state: row.status,
    decision: row.decision,
    task_uid: row.task_uid ?? null,
    ...extra,
});

const isStale = (row, now) =>
    row.status === 'deciding' && now - row.updated_at > DECIDING_STALE_MS;

// What an order meets on a card it cannot take: done if the same order or
// the same decision already went through, a conflict otherwise.
function settledAnswer(row, decision, key) {
    if (key && row.decide_key === key) return outcome(row, { replayed: true });
    if (row.status === 'done' && row.decision === decision) {
        return outcome(row, { replayed: true });
    }
    if (row.status === 'done') {
        throw new ConflictError(`Mail card already settled: ${row.decision}`);
    }
    throw new ConflictError('Mail card is being decided elsewhere');
}

// The same order sent again (same key, or the same decision on a settled
// card) is answered as done; any other order on a settled or busy card is a
// 409. The card is taken (status `deciding`) before the work, so two orders
// never both run; the last key stays on the card, even when a new message
// reopens it, so an old order resent later is still recognized.
async function decide(
    user,
    uid,
    { decision, payload = {}, archive = false, idempotency_key: key } = {}
) {
    if (!DECISIONS.has(decision)) {
        throw new ValidationError(
            `decision must be one of ${[...DECISIONS].join(', ')}`
        );
    }
    if (
        key !== undefined &&
        (typeof key !== 'string' || !key || key.length > KEY_MAX)
    ) {
        throw new ValidationError('idempotency_key is not valid');
    }
    if (payload === null || typeof payload !== 'object') {
        throw new ValidationError('payload must be an object');
    }
    if (archive !== true && archive !== false) {
        throw new ValidationError('archive must be true or false');
    }
    if (archive && decision === 'later') {
        throw new ValidationError('a card put off is not archived');
    }
    if (archive && !gateway.configured()) {
        throw new ValidationError('Gmail archiving is not set up');
    }

    const row = await MailItem.findOne({ where: { user_id: user.id, uid } });
    if (!row) throw new NotFoundError('Mail card not found');
    const now = new Date();
    const open = ['pending', 'later'].includes(row.status);
    if ((key && row.decide_key === key) || (!open && !isStale(row, now))) {
        return settledAnswer(row, decision, key);
    }

    const before = {
        status: open ? row.status : 'pending',
        decide_key: row.decide_key,
    };
    const [taken] = await MailItem.update(
        { status: 'deciding' },
        {
            where: {
                id: row.id,
                status: row.status,
                ...(open
                    ? {}
                    : {
                          updated_at: {
                              [Op.lt]: new Date(now - DECIDING_STALE_MS),
                          },
                      }),
            },
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
            changes.later_until = laterUntil(user, payload.until);
        } else {
            if (decision === 'task') {
                changes.task_uid = await createTask(user, row, payload);
            }
            changes.status = 'done';
            changes.decided_at = new Date();
            changes.later_until = null;
        }
    } catch (error) {
        await MailItem.update(before, {
            where: { id: row.id, status: 'deciding' },
        });
        throw error;
    }
    await MailItem.update(changes, { where: { id: row.id } });
    await row.reload();

    if (!archive) return outcome(row);
    const archived = await gateway.archiveThread(row.account, row.thread_id);
    if (archived) await row.update({ archived_at: new Date() });
    return outcome(row, { archived });
}

module.exports = {
    proposeMail,
    resolveMail,
    listCards,
    queueItems,
    decide,
    archiveAvailable: gateway.configured,
};
