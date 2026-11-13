'use strict';

// What an agent may put on a mail card (docs/43-mail-triage.md). Everything
// comes from a mail, so it is untrusted text: control characters go, lengths
// are capped, and the only address kept must open Gmail.
const moment = require('moment-timezone');
const { ValidationError } = require('../../../shared/errors');

const SUMMARY_MAX = 200;
const EXCERPT_MAX = 280;
// The start of the mail, read in the card (contract v2).
const MAIL_EXCERPT_MAX = 1500;
const DRAFT_MAX = 4000;
const NOTE_MAX = 500;
const CODE = /^[a-z][a-z_]{0,39}$/;
// The decisions an agent may offer (contract v2). `reply` is not offered: it
// only comes from a card proposed with the old suggestion.
const OPTIONS = new Set([
    'draft',
    'task',
    'event',
    'later',
    'archive',
    'dismiss',
]);
const MAX_OPTIONS = 5;
const MIN_OPTIONS = 2;
const KINDS = new Set(['task', 'reply', 'read', 'event']);
const ACCOUNT = /^[A-Za-z0-9_.-]{1,64}$/;
const THREAD = /^[A-Za-z0-9_-]{1,128}$/;
const ADDRESS = /^[^\s@<>]+@[^\s@<>]+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
const BREAKS = /[\r\n\t]+/g;
// Characters that reorder or hide text, so a sender cannot spoof a card.
const INVISIBLE = /[\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

function clean(value, max, { lines = false } = {}) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') return null;
    let text = lines
        ? value.replace(/\r\n?/g, '\n').replace(/\t/g, ' ')
        : value.replace(BREAKS, ' ');
    text = text.replace(CONTROL, '').replace(INVISIBLE, '').trim();
    if (!text) return null;
    return max ? text.slice(0, max) : text;
}

function gmailUrl(value, field = 'gmail_url') {
    const refused = () =>
        new ValidationError(`${field} must open mail.google.com`);
    let url;
    try {
        url = new URL(value);
    } catch {
        throw refused();
    }
    if (
        typeof value !== 'string' ||
        url.protocol !== 'https:' ||
        url.hostname !== 'mail.google.com' ||
        url.username ||
        url.password ||
        url.port ||
        value.length > 2048
    ) {
        throw refused();
    }
    return url.toString();
}

function suggestion(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object' || !KINDS.has(value.kind)) {
        throw new ValidationError(
            'suggestion.kind must be task, reply, read or event'
        );
    }
    const result = { kind: value.kind };
    const name = clean(value.task_name, 255);
    if (name) result.task_name = name;
    if (value.due_date !== undefined && value.due_date !== null) {
        if (!isDay(value.due_date)) {
            throw new ValidationError('suggestion.due_date must be YYYY-MM-DD');
        }
        result.due_date = value.due_date;
    }
    const project = clean(value.project_uid, 64);
    if (project) result.project_uid = project;
    if (value.kind === 'event') {
        result.event = eventFields(value.event ?? {}, 'suggestion.event');
    }
    return result;
}

// The decisions the card offers, in the order the agent gave them.
function optionList(value) {
    if (
        !Array.isArray(value) ||
        value.length < MIN_OPTIONS ||
        value.length > MAX_OPTIONS
    ) {
        throw new ValidationError(
            `options must list ${MIN_OPTIONS} to ${MAX_OPTIONS} decisions`
        );
    }
    const seen = new Set();
    for (const option of value) {
        if (!OPTIONS.has(option)) {
            throw new ValidationError(
                `options must be among ${[...OPTIONS].join(', ')}`
            );
        }
        if (seen.has(option)) {
            throw new ValidationError(`option ${option} is listed twice`);
        }
        seen.add(option);
    }
    return [...value];
}

// Without options, the card offers what its old suggestion called for.
function legacyChoice(suggested) {
    const kind = suggested?.kind;
    if (kind === 'reply') {
        return {
            options: ['reply', 'task', 'later', 'dismiss'],
            recommended: 'reply',
        };
    }
    if (kind === 'event') {
        return {
            options: ['event', 'task', 'later', 'dismiss'],
            recommended: 'event',
        };
    }
    if (kind === 'read') {
        return {
            options: ['dismiss', 'task', 'later'],
            recommended: 'dismiss',
        };
    }
    return { options: ['task', 'later', 'dismiss'], recommended: 'task' };
}

function choice(input, suggested) {
    const given = input.options !== undefined && input.options !== null;
    const { options, recommended: fallback } = given
        ? { options: optionList(input.options), recommended: null }
        : legacyChoice(suggested);
    const recommended = input.recommended ?? fallback;
    if (recommended !== null && !options.includes(recommended)) {
        throw new ValidationError('recommended must be one of the options');
    }
    return { options, recommended };
}

// The prepared Gmail draft, only with the draft option: its body is the
// agent's own text, kept for the agent that creates the draft.
function draftFields(value, options) {
    const offered = options.includes('draft');
    if (!offered) {
        if (value === undefined || value === null) return null;
        throw new ValidationError('draft needs the draft option');
    }
    if (
        value === null ||
        typeof value !== 'object' ||
        typeof value.body !== 'string'
    ) {
        throw new ValidationError(
            'draft.body is required with the draft option'
        );
    }
    if (value.body.length > DRAFT_MAX) {
        throw new ValidationError(
            `draft.body is at most ${DRAFT_MAX} characters`
        );
    }
    const body = clean(value.body, null, { lines: true });
    if (!body)
        throw new ValidationError(
            'draft.body is required with the draft option'
        );
    return { body };
}

// A start is a day (all-day event) or an ISO 8601 time with its offset.
const TIME =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const isTime = (value) =>
    typeof value === 'string' &&
    TIME.test(value) &&
    !Number.isNaN(+new Date(value));

// An appointment to put in the calendar (docs/43-mail-triage.md): a title, a
// start, an optional end of the same kind and after it, a place.
function eventFields(value, field) {
    if (value === null || typeof value !== 'object') {
        throw new ValidationError(`${field} must be an object`);
    }
    const allDay = isDay(value.start);
    if (!allDay && !isTime(value.start)) {
        throw new ValidationError(
            `${field}.start must be YYYY-MM-DD or an ISO 8601 time with offset`
        );
    }
    let end = null;
    if (value.end !== undefined && value.end !== null) {
        const sameKind = allDay ? isDay(value.end) : isTime(value.end);
        const after = allDay
            ? value.end >= value.start
            : new Date(value.end) > new Date(value.start);
        if (!sameKind || !after) {
            throw new ValidationError(
                `${field}.end must be of the same kind as start and after it`
            );
        }
        end = value.end;
    }
    const result = {
        title: clean(value.title, 255),
        start: value.start,
        end,
        all_day: allDay,
    };
    const location = clean(value.location, 255);
    if (location) result.location = location;
    return result;
}

// Strict: 2026-02-31 does not roll over to March.
const isDay = (value) =>
    typeof value === 'string' &&
    DAY.test(value) &&
    moment(value, 'YYYY-MM-DD', true).isValid();

function threadKey(input = {}) {
    if (typeof input.account !== 'string' || !ACCOUNT.test(input.account)) {
        throw new ValidationError('account must be the key of a Gmail account');
    }
    if (typeof input.thread_id !== 'string' || !THREAD.test(input.thread_id)) {
        throw new ValidationError('thread_id must be a Gmail thread id');
    }
    return { account: input.account, thread_id: input.thread_id };
}

// The text of the user's note to the agent, one to 500 characters.
function noteText(value) {
    const text =
        typeof value === 'string' && value.length <= NOTE_MAX
            ? clean(value, null, { lines: true })
            : null;
    if (!text) {
        throw new ValidationError(
            `payload.text is 1 to ${NOTE_MAX} characters`
        );
    }
    return text;
}

// The error code of a failed Gmail action: a short lowercase code, not text.
function actionCode(value) {
    if (typeof value !== 'string' || !CODE.test(value)) {
        throw new ValidationError(
            'error must be a short code: lowercase letters and underscores'
        );
    }
    return value;
}

// The card fields of a proposal, or a ValidationError naming the bad field.
function normalizeProposal(input = {}) {
    const key = threadKey(input);
    const summary = clean(input.summary);
    if (!summary || summary.length > SUMMARY_MAX) {
        throw new ValidationError(
            `summary is required, at most ${SUMMARY_MAX} characters`
        );
    }
    const receivedAt = new Date(input.received_at);
    if (typeof input.received_at !== 'string' || Number.isNaN(+receivedAt)) {
        throw new ValidationError('received_at must be an ISO 8601 date');
    }
    const address = clean(input.from_address, 320);
    if (address && !ADDRESS.test(address)) {
        throw new ValidationError('from_address is not an address');
    }
    if (typeof input.gmail_url !== 'string') {
        throw new ValidationError('gmail_url must open mail.google.com');
    }
    const card = suggestion(input.suggestion);
    const { options, recommended } = choice(input, card);
    return {
        ...key,
        from_name: clean(input.from_name, 255),
        from_address: address,
        subject: clean(input.subject, 500),
        received_at: receivedAt,
        summary,
        suggestion: card,
        draft_excerpt: clean(input.draft_excerpt, EXCERPT_MAX, { lines: true }),
        gmail_url: gmailUrl(input.gmail_url),
        options,
        recommended,
        draft: draftFields(input.draft, options),
        excerpt: excerptFields(input.excerpt),
    };
}

function excerptFields(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length > MAIL_EXCERPT_MAX) {
        throw new ValidationError(
            `excerpt is at most ${MAIL_EXCERPT_MAX} characters`
        );
    }
    return clean(value, null, { lines: true });
}

module.exports = {
    normalizeProposal,
    threadKey,
    clean,
    isDay,
    eventFields,
    gmailUrl,
    noteText,
    actionCode,
};
