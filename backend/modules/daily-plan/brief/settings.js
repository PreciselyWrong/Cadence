'use strict';

// Settings of the daily brief, stored in ui_settings.brief
// (docs/39-daily-brief.md, Settings). Normalizing never throws: a missing or
// invalid value falls back to its default. Validating a client update throws
// so the UI sees the mistake instead of a silent fallback.
const { ValidationError } = require('../../../shared/errors');

const SECTIONS = [
    'verdict',
    'timeline',
    'tonight',
    'moves',
    'anticipate',
    'replies',
    'inbox',
    'resolved',
];
const PRIORITIES = [
    'consequence',
    'blocking',
    'money_deadline',
    'planned_load',
    'long_term',
];
const ALERT_TYPES = [
    'conflict',
    'overload',
    'duplicate',
    'deadline_in_note',
    'postponed',
    'dependency',
    'event_in_work_hours',
];
const WEEKDAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TIME_STEP_MINUTES = 5;
const MAX_CAPACITY_MINUTES = 600;
const MAX_URL_LENGTH = 300;

const isPlainObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

// Parsers return the normalized value, or undefined when it is invalid.
const parseNumber = (min, max, integer) => (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return undefined;
    }
    const rounded = integer ? Math.round(value) : value;
    return Math.min(max, Math.max(min, rounded));
};

const parseBoolean = (value) =>
    typeof value === 'boolean' ? value : undefined;

const parseText =
    (maxLength, { nonEmpty = false } = {}) =>
    (value) => {
        if (typeof value !== 'string') return undefined;
        const trimmed = value.trim().slice(0, maxLength);
        return nonEmpty && trimmed === '' ? undefined : trimmed;
    };

const parseTime = (value) => {
    if (typeof value !== 'string') return undefined;
    const match = TIME_PATTERN.exec(value);
    if (!match) return undefined;
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return minutes % TIME_STEP_MINUTES === 0 ? value : undefined;
};

const minutesOf = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};

const parseChoice = (choices) => (value) =>
    choices.includes(value) ? value : undefined;

const parseDay = (value) =>
    Number.isInteger(value) && value >= 0 && value <= 6 ? value : undefined;

const parseHttpUrl = (value) => {
    if (typeof value !== 'string') return undefined;
    const text = value.trim();
    if (text === '') return '';
    if (text.length > MAX_URL_LENGTH) return undefined;
    try {
        const url = new URL(text);
        return url.protocol === 'http:' || url.protocol === 'https:'
            ? text
            : undefined;
    } catch {
        return undefined;
    }
};

const parseEveningWindow = (value) => {
    if (!isPlainObject(value)) return undefined;
    const start = parseTime(value.start);
    const end = parseTime(value.end);
    const minutes = parseNumber(0, MAX_CAPACITY_MINUTES, true)(value.minutes);
    if (
        start === undefined ||
        end === undefined ||
        minutesOf(start) >= minutesOf(end) ||
        minutes === undefined
    ) {
        return undefined;
    }
    return { start, end, minutes };
};

const parseDictionaryEntry = (value) => {
    if (!isPlainObject(value)) return undefined;
    const from = parseText(80, { nonEmpty: true })(value.from);
    const to = parseText(80, { nonEmpty: true })(value.to);
    return from === undefined || to === undefined ? undefined : { from, to };
};

// Field descriptors. `def` is the default. A leaf is normalized leniently
// (invalid falls back to def) and validated strictly (invalid throws).
const field = {
    bool: (def) => ({
        kind: 'leaf',
        def,
        parse: parseBoolean,
        hint: 'true or false',
    }),
    number: (def, min, max, integer) => ({
        kind: 'leaf',
        def,
        parse: parseNumber(min, max, integer),
        hint: 'a number',
    }),
    text: (def, maxLength, options) => ({
        kind: 'leaf',
        def,
        parse: parseText(maxLength, options),
        hint: 'a string',
    }),
    time: (def) => ({
        kind: 'leaf',
        def,
        parse: parseTime,
        hint: 'HH:mm, in 5-minute steps',
    }),
    url: (def) => ({
        kind: 'leaf',
        def,
        parse: parseHttpUrl,
        hint: 'an empty string or an http(s) URL',
    }),
    list: (
        def,
        parseItem,
        { max = Infinity, sort = false, minOne = false } = {}
    ) => ({
        kind: 'list',
        def,
        parseItem,
        max,
        sort,
        minOne,
        hint: 'a list',
    }),
    map: (parseValue, hint) => ({
        kind: 'map',
        def: {},
        parseValue,
        hint: `an object keyed by weekday 0 to 6, with ${hint}`,
    }),
    object: (shape) => ({ kind: 'object', shape, hint: 'an object' }),
};

const dedupe = (items) => {
    const seen = new Set();
    return items.filter((item) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const defaultOf = (descriptor) => {
    if (descriptor.kind === 'object') {
        return Object.fromEntries(
            Object.entries(descriptor.shape).map(([key, child]) => [
                key,
                defaultOf(child),
            ])
        );
    }
    return structuredClone(descriptor.def);
};

const normalizeValue = (descriptor, value) => {
    if (descriptor.kind === 'object') {
        const source = isPlainObject(value) ? value : {};
        return Object.fromEntries(
            Object.entries(descriptor.shape).map(([key, child]) => [
                key,
                normalizeValue(child, source[key]),
            ])
        );
    }
    if (descriptor.kind === 'map') {
        if (!isPlainObject(value)) return {};
        const result = {};
        for (const key of WEEKDAY_KEYS) {
            const parsed = Object.hasOwn(value, key)
                ? descriptor.parseValue(value[key])
                : undefined;
            if (parsed !== undefined) result[key] = parsed;
        }
        return result;
    }
    if (descriptor.kind === 'list') {
        if (!Array.isArray(value)) return structuredClone(descriptor.def);
        let items = dedupe(
            value.map(descriptor.parseItem).filter((item) => item !== undefined)
        ).slice(0, descriptor.max);
        if (descriptor.sort) items = items.sort((a, b) => a - b);
        if (descriptor.minOne && items.length === 0) {
            return structuredClone(descriptor.def);
        }
        return items;
    }
    const parsed = descriptor.parse(value);
    return parsed === undefined ? structuredClone(descriptor.def) : parsed;
};

// Walks a client update and throws on the first value that normalization
// would have dropped. Out-of-range numbers are clamped, not rejected.
function validateValue(descriptor, value, path) {
    const fail = () => {
        throw new ValidationError(
            `Invalid brief setting ${path}: expected ${descriptor.hint}`
        );
    };

    if (descriptor.kind === 'object') {
        if (!isPlainObject(value)) fail();
        for (const key of Object.keys(value)) {
            const childPath = path ? `${path}.${key}` : key;
            if (!Object.hasOwn(descriptor.shape, key)) {
                throw new ValidationError(`Unknown brief setting ${childPath}`);
            }
            validateValue(descriptor.shape[key], value[key], childPath);
        }
        return;
    }
    if (descriptor.kind === 'map') {
        if (!isPlainObject(value)) fail();
        for (const [key, entry] of Object.entries(value)) {
            if (!WEEKDAY_KEYS.includes(key)) {
                throw new ValidationError(
                    `Invalid brief setting ${path}: weekday keys are 0 to 6`
                );
            }
            // null removes that weekday when the update is merged.
            if (entry !== null && descriptor.parseValue(entry) === undefined) {
                throw new ValidationError(
                    `Invalid brief setting ${path}.${key}: expected ${descriptor.hint}`
                );
            }
        }
        return;
    }
    if (descriptor.kind === 'list') {
        if (!Array.isArray(value)) fail();
        value.forEach((item, index) => {
            if (descriptor.parseItem(item) === undefined) {
                throw new ValidationError(
                    `Invalid brief setting ${path}[${index}]: expected ${descriptor.hint}`
                );
            }
        });
        return;
    }
    if (descriptor.parse(value) === undefined) fail();
}

const SCHEMA = field.object({
    enabled: field.bool(false),
    time: field.time('07:00'),
    days: field.list([], parseDay, { sort: true }),
    sections: field.list(SECTIONS, parseChoice(SECTIONS)),
    timelineDays: field.number(3, 1, 7, true),
    calendarFeedUids: field.list([], parseText(100, { nonEmpty: true }), {
        max: 50,
    }),
    calendarLookaheadDays: field.number(7, 1, 14, true),
    priorities: field.list(PRIORITIES, parseChoice(PRIORITIES), {
        minOne: true,
    }),
    thresholds: field.object({
        postponements: field.number(3, 1, 20, true),
        duplicateSimilarity: field.number(0.8, 0, 1, false),
        maxMoves: field.number(3, 0, 10, true),
        maxTonight: field.number(3, 0, 10, true),
        closedLookbackDays: field.number(7, 1, 60, true),
    }),
    capacity: field.object({
        evening: field.map(parseEveningWindow, 'start, end and minutes'),
        dayNotes: field.map(parseText(120, { nonEmpty: true }), 'a short text'),
    }),
    retention: field.object({
        decisionsDays: field.number(90, 1, 365, true),
        audioDays: field.number(7, 1, 90, true),
    }),
    alerts: field.object({
        disabled: field.list([], parseChoice(ALERT_TYPES)),
        noise: field.object({
            minVotes: field.number(3, 1, 50, true),
            ratio: field.number(0.7, 0, 1, false),
        }),
    }),
    writing: field.object({
        tone: field.text('neutral', 40),
        signature: field.text('', 200),
        instructions: field.text('', 2000),
    }),
    llm: field.object({
        enabled: field.bool(false),
    }),
    voice: field.object({
        enabled: field.bool(false),
        piperUrl: field.url(''),
        voice: field.text('', 100),
        speed: field.number(1, 0.5, 2, false),
        dictionary: field.list([], parseDictionaryEntry, { max: 200 }),
    }),
    mail: field.object({
        enabled: field.bool(false),
        accounts: field.list([], parseText(100, { nonEmpty: true }), {
            max: 50,
        }),
        excludedAccounts: field.list([], parseText(100, { nonEmpty: true }), {
            max: 50,
        }),
        replyWindowDays: field.number(14, 1, 60, true),
    }),
    options: field.object({
        eveningWrapUp: field.bool(false),
        telegram: field.bool(false),
        sonos: field.bool(false),
        weekly: field.bool(false),
    }),
});

const DEFAULTS = Object.freeze(defaultOf(SCHEMA));

function normalizeBriefSettings(saved) {
    return normalizeValue(SCHEMA, saved);
}

// Throws ValidationError for a patch the UI should not have sent.
function validateBriefSettingsUpdate(patch) {
    if (!isPlainObject(patch)) {
        throw new ValidationError('Send the brief settings as an object');
    }
    validateValue(SCHEMA, patch, '');
    return patch;
}

// Deep merge for objects; arrays and scalars are replaced. A null entry
// removes that key (drops one weekday's evening window or note).
function mergeInto(target, patch) {
    for (const [key, value] of Object.entries(patch)) {
        if (value === null) {
            delete target[key];
        } else if (isPlainObject(value) && isPlainObject(target[key])) {
            target[key] = mergeInto({ ...target[key] }, value);
        } else {
            target[key] = value;
        }
    }
    return target;
}

function mergeBriefSettings(current, patch) {
    return mergeInto(
        structuredClone(isPlainObject(current) ? current : {}),
        patch
    );
}

module.exports = {
    DEFAULTS,
    SECTIONS,
    PRIORITIES,
    ALERT_TYPES,
    normalizeBriefSettings,
    validateBriefSettingsUpdate,
    mergeBriefSettings,
};
