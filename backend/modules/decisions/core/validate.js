'use strict';

// Pure validation and cleaning for agent decision cards (docs/49-agent-decisions.md).
const { ValidationError } = require('../../../shared/errors');
const { clean } = require('../../triage/core/mail');

const KIND_RE = /^[a-z][a-z0-9_]{0,31}$/;
const KEY_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const CHOICE_ID_RE = /^[a-z][a-z0-9_]{0,23}$/;
const ERROR_CODE_RE = /^[a-z_]{1,40}$/;

const RESERVED_CHOICE_IDS = new Set(['note', 'later']);
const TONES = new Set(['primary', 'danger']);
const STATUSES = new Set(['pending', 'later', 'reviewing', 'done']);

const MAX_ITEMS = 30;
const KIND_LABEL_MAX = 40;
const TITLE_MAX = 120;
const CONTEXT_MAX = 280;
const BODY_MAX = 1500;
const URL_MAX = 2000;
const CHOICE_LABEL_MAX = 30;
const MIN_CHOICES = 2;
const MAX_CHOICES = 5;
const REASON_MAX = 140;
const DATA_MAX_BYTES = 2048;
const NOTE_MAX = 500;

function requiredText(value, field, max, { lines = false } = {}) {
    if (typeof value !== 'string') {
        throw new ValidationError(`${field} is required`);
    }
    const text = clean(value, null, { lines });
    if (!text || text.length > max) {
        throw new ValidationError(`${field} must be 1 to ${max} characters`);
    }
    return text;
}

function optionalText(value, field, max, { lines = false } = {}) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
        throw new ValidationError(`${field} must be a string`);
    }
    const text = clean(value, null, { lines });
    if (!text) return null;
    if (text.length > max) {
        throw new ValidationError(`${field} must be at most ${max} characters`);
    }
    return text;
}

function httpsUrl(value, field = 'url') {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length > URL_MAX) {
        throw new ValidationError(
            `${field} must be an https:// URL (max ${URL_MAX} chars)`
        );
    }
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new ValidationError(`${field} must be a valid https:// URL`);
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        throw new ValidationError(`${field} must be an https:// URL`);
    }
    return parsed.toString();
}

function normalizeChoices(value) {
    if (
        !Array.isArray(value) ||
        value.length < MIN_CHOICES ||
        value.length > MAX_CHOICES
    ) {
        throw new ValidationError(
            `choices must have ${MIN_CHOICES} to ${MAX_CHOICES} items`
        );
    }
    const seen = new Set();
    return value.map((choice, index) => {
        if (!choice || typeof choice !== 'object' || Array.isArray(choice)) {
            throw new ValidationError(`choices[${index}] must be an object`);
        }
        const { id, label, tone } = choice;
        if (typeof id !== 'string' || !CHOICE_ID_RE.test(id)) {
            throw new ValidationError(`choices[${index}].id is invalid`);
        }
        if (RESERVED_CHOICE_IDS.has(id)) {
            throw new ValidationError(
                `choices[${index}].id cannot be "note" or "later"`
            );
        }
        if (seen.has(id)) {
            throw new ValidationError(`duplicate choice id: ${id}`);
        }
        seen.add(id);
        const cleanLabel = requiredText(
            label,
            `choices[${index}].label`,
            CHOICE_LABEL_MAX
        );
        const entry = { id, label: cleanLabel };
        if (tone !== undefined && tone !== null) {
            if (!TONES.has(tone)) {
                throw new ValidationError(
                    `choices[${index}].tone must be primary or danger`
                );
            }
            entry.tone = tone;
        }
        return entry;
    });
}

function normalizeData(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new ValidationError('data must be a JSON object');
    }
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > DATA_MAX_BYTES) {
        throw new ValidationError(
            `data must be at most ${DATA_MAX_BYTES} bytes serialized`
        );
    }
    return JSON.parse(serialized);
}

function normalizeProposalBatch(input = {}) {
    if (typeof input.kind !== 'string' || !KIND_RE.test(input.kind)) {
        throw new ValidationError('kind is invalid');
    }
    const kindLabel = requiredText(
        input.kind_label,
        'kind_label',
        KIND_LABEL_MAX
    );
    if (
        !Array.isArray(input.items) ||
        input.items.length === 0 ||
        input.items.length > MAX_ITEMS
    ) {
        throw new ValidationError(
            `items must be an array of 1 to ${MAX_ITEMS} cards`
        );
    }
    return { kind: input.kind, kind_label: kindLabel, items: input.items };
}

function normalizeItem(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new ValidationError('item must be an object');
    }
    if (typeof item.key !== 'string' || !KEY_RE.test(item.key)) {
        throw new ValidationError('key is invalid');
    }
    const title = requiredText(item.title, 'title', TITLE_MAX);
    const context = optionalText(item.context, 'context', CONTEXT_MAX);
    const body = optionalText(item.body, 'body', BODY_MAX, { lines: true });
    const url = httpsUrl(item.url, 'url');
    const choices = normalizeChoices(item.choices);

    let recommended = null;
    if (item.recommended !== undefined && item.recommended !== null) {
        if (
            typeof item.recommended !== 'string' ||
            !choices.some((c) => c.id === item.recommended)
        ) {
            throw new ValidationError('recommended must match a choice id');
        }
        recommended = item.recommended;
    }

    const reason = optionalText(item.reason, 'reason', REASON_MAX);
    const data = normalizeData(item.data);

    return {
        key: item.key,
        title,
        context,
        body,
        url,
        choices,
        recommended,
        reason,
        data,
    };
}

function validateNote(value) {
    return requiredText(value, 'note', NOTE_MAX, { lines: true });
}

function validateReport(input = {}) {
    if (typeof input.kind !== 'string' || !KIND_RE.test(input.kind)) {
        throw new ValidationError('kind is invalid');
    }
    if (typeof input.key !== 'string' || !KEY_RE.test(input.key)) {
        throw new ValidationError('key is invalid');
    }
    if (typeof input.ok !== 'boolean') {
        throw new ValidationError('ok must be a boolean');
    }
    let error = null;
    if (input.error !== undefined && input.error !== null) {
        if (input.ok) {
            throw new ValidationError('error is only allowed when ok is false');
        }
        if (
            typeof input.error !== 'string' ||
            !ERROR_CODE_RE.test(input.error)
        ) {
            throw new ValidationError('error must match ^[a-z_]{1,40}$');
        }
        error = input.error;
    }
    const url = httpsUrl(input.url, 'url');
    return {
        kind: input.kind,
        key: input.key,
        ok: input.ok,
        error,
        url,
    };
}

module.exports = {
    KIND_RE,
    KEY_RE,
    STATUSES,
    normalizeProposalBatch,
    normalizeItem,
    validateNote,
    validateReport,
};
