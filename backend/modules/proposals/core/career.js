'use strict';

// Career proposals (docs/47-proposals.md, Career). The agent builds the whole
// payload; Cadence checks it, keeps what is valid, and maps each decision the
// user takes to the task it creates. Nothing here reads the database.
const moment = require('moment-timezone');
const { ValidationError } = require('../../../shared/errors');
const { cleanText } = require('./text');

const HEADLINE_MAX = 60;
const SUBTITLE_MAX = 160;
const LIMITS = { stats: 4, followups: 10, offers: 15, tasks: 8 };
const DECISION_NOTE_MAX = 140;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SOURCES = new Set(['jobseeka', 'agent']);
const MAIL_HOST = 'mail.google.com';
const URL_MAX = 2048;
const FOLLOWUP_DUE_OFFSET_DAYS = 3;

const OPS = {
    offer: ['apply', 'skip', 'later'],
    followup: ['done', 'later', 'task'],
    task: ['create', 'skip'],
};
// A final operation settles the item; `later` leaves it open.
const FINAL_OPS = new Set(['apply', 'skip', 'done', 'task', 'create']);
// Final operations that create a Cadence task.
const CREATING = new Set(['offer:apply', 'followup:task', 'task:create']);

const isObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const dayOf = (value) => {
    if (typeof value !== 'string') return null;
    const day = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    return moment(day, 'YYYY-MM-DD', true).isValid() ? day : null;
};

const textOf = (value, max) => cleanText(value, max) || null;

// An https address, on one host only when asked. Anything else is null.
function httpsUrl(value, host) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text || text.length > URL_MAX) return null;
    try {
        const url = new URL(text);
        if (url.protocol !== 'https:') return null;
        if (host && url.hostname !== host) return null;
        return url.href;
    } catch {
        return null;
    }
}

const idOf = (entry) =>
    typeof entry.id === 'string' && ID.test(entry.id) ? entry.id : null;

// The valid entries of a list, in order: no repeated id, at most `max`.
function entriesOf(raw, max, read) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (const entry of raw) {
        if (out.length >= max) break;
        const item = isObject(entry) ? read(entry) : null;
        if (!item) continue;
        if (item.id !== undefined) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
        }
        out.push(item);
    }
    return out;
}

const readStat = (entry) => {
    const label = cleanText(entry.label, 20);
    const value = cleanText(entry.value, 12);
    return label && value ? { label, value } : null;
};

const readFollowup = (entry) => {
    const id = idOf(entry);
    const title = cleanText(entry.title, 120);
    if (!id || !title) return null;
    return {
        id,
        title,
        company: textOf(entry.company, 120),
        applied_at: dayOf(entry.applied_at),
        note: textOf(entry.note, DECISION_NOTE_MAX),
        draft_url: httpsUrl(entry.draft_url, MAIL_HOST),
        source_url: httpsUrl(entry.source_url),
    };
};

const readOffer = (entry) => {
    const id = idOf(entry);
    const title = cleanText(entry.title, 120);
    const company = cleanText(entry.company, 120);
    const url = httpsUrl(entry.url);
    const fit = cleanText(entry.fit, 200);
    if (!id || !title || !company || !url || !fit) return null;
    return {
        id,
        title,
        company,
        url,
        fit,
        location: textOf(entry.location, 120),
        rate: textOf(entry.rate, 60),
        expires: dayOf(entry.expires),
        source: SOURCES.has(entry.source) ? entry.source : null,
    };
};

const readTask = (entry) => {
    const id = idOf(entry);
    const name = cleanText(entry.name, 200);
    if (!id || !name) return null;
    return {
        id,
        name,
        note: textOf(entry.note, 500),
        due_date: dayOf(entry.due_date),
    };
};

// The checked payload, kept as the proposal's facts and answer. Throws a
// ValidationError when there is no headline or nothing valid to propose.
function validateCareer(raw) {
    if (!isObject(raw)) throw new ValidationError('payload must be an object');
    const headline = cleanText(raw.headline, HEADLINE_MAX);
    if (!headline) throw new ValidationError('headline is required');
    const answer = {
        headline,
        subtitle: textOf(raw.subtitle, SUBTITLE_MAX),
        stats: entriesOf(raw.stats, LIMITS.stats, readStat),
        followups: entriesOf(raw.followups, LIMITS.followups, readFollowup),
        offers: entriesOf(raw.offers, LIMITS.offers, readOffer),
        tasks: entriesOf(raw.tasks, LIMITS.tasks, readTask),
    };
    if (
        !answer.followups.length &&
        !answer.offers.length &&
        !answer.tasks.length
    ) {
        throw new ValidationError('nothing valid to propose');
    }
    return answer;
}

const keyOf = (kind, id) => `${kind}:${id}`;

// The items a decision can name, by kind and id.
function itemsOf(answer) {
    return [
        ...answer.offers.map((item) => ['offer', item]),
        ...answer.followups.map((item) => ['followup', item]),
        ...answer.tasks.map((item) => ['task', item]),
    ].map(([kind, item]) => [keyOf(kind, item.id), { kind, item }]);
}

// The decisions the user sent, checked against the proposal: each names an
// item of the answer with an operation its kind allows.
function checkCareerDecisions(answer, raw) {
    if (!Array.isArray(raw)) {
        throw new ValidationError('decisions must be a list');
    }
    const items = new Map(itemsOf(answer));
    return raw.map((entry) => {
        const found = isObject(entry)
            ? items.get(keyOf(entry.kind, entry.id))
            : undefined;
        if (!found) {
            throw new ValidationError('decision names an unknown item');
        }
        if (!OPS[entry.kind].includes(entry.op)) {
            throw new ValidationError(
                `op ${entry.op} is not allowed for ${entry.kind}`
            );
        }
        const decision = { kind: entry.kind, id: entry.id, op: entry.op };
        const note = textOf(entry.note, DECISION_NOTE_MAX);
        if (note) decision.note = note;
        if (entry.due_date !== undefined) {
            const due = dayOf(entry.due_date);
            if (!due) throw new ValidationError('due_date must be YYYY-MM-DD');
            decision.due_date = due;
        }
        return decision;
    });
}

const isFinal = (decision) => FINAL_OPS.has(decision.op);
const createsTask = (decision) =>
    CREATING.has(`${decision.kind}:${decision.op}`);

// Each item of the answer with its operation, or null when undecided.
function withDecisions(answer, decisions = []) {
    const byKey = new Map(
        decisions.map((decision) => [
            keyOf(decision.kind, decision.id),
            decision,
        ])
    );
    const mark = (kind) => (item) => ({
        ...item,
        decision: byKey.get(keyOf(kind, item.id))?.op ?? null,
    });
    return {
        ...answer,
        offers: answer.offers.map(mark('offer')),
        followups: answer.followups.map(mark('followup')),
        tasks: answer.tasks.map(mark('task')),
    };
}

// True when every item of the answer has a final decision.
function isComplete(answer, decisions) {
    const settled = new Set(
        decisions
            .filter(isFinal)
            .map((decision) => keyOf(decision.kind, decision.id))
    );
    return itemsOf(answer).every(([key]) => settled.has(key));
}

const addDays = (day, count) =>
    moment(day, 'YYYY-MM-DD').add(count, 'days').format('YYYY-MM-DD');

// The parameters of the Cadence task a decision creates. `today` is the day in
// the user's timezone.
function taskFor(answer, decision, today) {
    let task;
    if (decision.kind === 'offer') {
        const offer = answer.offers.find((item) => item.id === decision.id);
        task = {
            name: cleanText(
                `Postuler : ${offer.title} — ${offer.company}`,
                200
            ),
            note: [offer.fit, offer.location, offer.rate]
                .filter(Boolean)
                .join('\n'),
            due_date:
                offer.expires && offer.expires >= today
                    ? offer.expires
                    : addDays(today, FOLLOWUP_DUE_OFFSET_DAYS),
            source_url: offer.url,
        };
    } else if (decision.kind === 'followup') {
        const followup = answer.followups.find(
            (item) => item.id === decision.id
        );
        task = {
            name: cleanText(
                `Relancer ${followup.company ?? followup.title}`,
                200
            ),
            note: [followup.title, followup.draft_url]
                .filter(Boolean)
                .join('\n'),
            due_date: today,
            source_url: followup.source_url,
        };
    } else {
        const item = answer.tasks.find((entry) => entry.id === decision.id);
        task = {
            name: item.name,
            note: item.note,
            due_date: decision.due_date ?? item.due_date,
        };
    }
    return Object.fromEntries(
        Object.entries({ ...task, source: 'mcp' }).filter(
            ([, value]) => value !== undefined && value !== null && value !== ''
        )
    );
}

module.exports = {
    validateCareer,
    checkCareerDecisions,
    withDecisions,
    isComplete,
    isFinal,
    createsTask,
    taskFor,
};
