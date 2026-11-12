'use strict';

// What an agent may put on a mail card (docs/43-mail-triage.md). Everything
// comes from a mail, so it is untrusted text: control characters go, lengths
// are capped, and the only address kept must open Gmail.
const moment = require('moment-timezone');
const { ValidationError } = require('../../../shared/errors');

const SUMMARY_MAX = 200;
const EXCERPT_MAX = 280;
const KINDS = new Set(['task', 'reply', 'read']);
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

function gmailUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new ValidationError('gmail_url must open mail.google.com');
    }
    if (
        url.protocol !== 'https:' ||
        url.hostname !== 'mail.google.com' ||
        url.username ||
        url.password ||
        url.port ||
        value.length > 2048
    ) {
        throw new ValidationError('gmail_url must open mail.google.com');
    }
    return url.toString();
}

function suggestion(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object' || !KINDS.has(value.kind)) {
        throw new ValidationError(
            'suggestion.kind must be task, reply or read'
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
    return {
        ...key,
        from_name: clean(input.from_name, 255),
        from_address: address,
        subject: clean(input.subject, 500),
        received_at: receivedAt,
        summary,
        suggestion: suggestion(input.suggestion),
        draft_excerpt: clean(input.draft_excerpt, EXCERPT_MAX, { lines: true }),
        gmail_url: gmailUrl(input.gmail_url),
    };
}

module.exports = { normalizeProposal, threadKey, clean, isDay };
