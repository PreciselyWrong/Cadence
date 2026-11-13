'use strict';

// Settings of the triage queue (docs/40-triage.md, Settings). They are stored
// under ui_settings.brief, the key of the retired daily brief, so the values
// saved before 2026-11-12 are kept; the other keys left there are ignored.
// Normalizing never throws: a missing or invalid value falls back to its
// default. Validating a client update throws so the UI sees the mistake.
const dailyPlanRepository = require('../daily-plan/repository');
const { ValidationError } = require('../../shared/errors');

const STORAGE_KEY = 'brief';

// The card types of the rules (core/rules), each one can be turned off.
const ALERT_TYPES = [
    'conflict',
    'event_in_work_hours',
    'duplicate',
    'deadline_in_note',
    'postponed',
];

const isPlainObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const number = (def, min, max, integer) => ({
    def,
    hint: 'a number',
    parse: (value) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return undefined;
        }
        const rounded = integer ? Math.round(value) : value;
        return Math.min(max, Math.max(min, rounded));
    },
});

const bool = (def) => ({
    def,
    hint: 'true or false',
    parse: (value) => (typeof value === 'boolean' ? value : undefined),
});

// A list keeps its valid items, without duplicates, up to `max`.
const list = (parseItem, max) => ({
    def: [],
    hint: 'a list',
    list: true,
    parseItem,
    max,
});

const feedUid = (value) => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim().slice(0, 100);
    return trimmed === '' ? undefined : trimmed;
};

const alertType = (value) => (ALERT_TYPES.includes(value) ? value : undefined);

const SCHEMA = {
    calendarFeedUids: list(feedUid, 50),
    calendarLookaheadDays: number(7, 1, 14, true),
    thresholds: {
        postponements: number(3, 1, 20, true),
        duplicateSimilarity: number(0.8, 0, 1, false),
        closedLookbackDays: number(7, 1, 60, true),
    },
    alerts: { disabled: list(alertType, ALERT_TYPES.length) },
    triage: {
        enabled: bool(false),
        dailyLimit: number(20, 1, 200, true),
    },
};

const isLeaf = (descriptor) => 'def' in descriptor;

function normalizeValue(descriptor, value) {
    if (!isLeaf(descriptor)) {
        const source = isPlainObject(value) ? value : {};
        return Object.fromEntries(
            Object.entries(descriptor).map(([key, child]) => [
                key,
                normalizeValue(child, source[key]),
            ])
        );
    }
    if (descriptor.list) {
        if (!Array.isArray(value)) return [];
        const items = value
            .map(descriptor.parseItem)
            .filter((item) => item !== undefined);
        return [...new Set(items)].slice(0, descriptor.max);
    }
    const parsed = descriptor.parse(value);
    return parsed === undefined ? descriptor.def : parsed;
}

// Walks a client update and throws on the first value that normalization
// would have dropped. Out-of-range numbers are clamped, not rejected.
function validateValue(descriptor, value, path) {
    const fail = () => {
        throw new ValidationError(
            `Invalid triage setting ${path}: expected ${descriptor.hint || 'an object'}`
        );
    };
    if (!isLeaf(descriptor)) {
        if (!isPlainObject(value)) fail();
        for (const key of Object.keys(value)) {
            const childPath = path ? `${path}.${key}` : key;
            if (!Object.hasOwn(descriptor, key)) {
                throw new ValidationError(
                    `Unknown triage setting ${childPath}`
                );
            }
            validateValue(descriptor[key], value[key], childPath);
        }
        return;
    }
    if (descriptor.list) {
        if (!Array.isArray(value)) fail();
        value.forEach((item, index) => {
            if (descriptor.parseItem(item) === undefined) {
                throw new ValidationError(
                    `Invalid triage setting ${path}[${index}]`
                );
            }
        });
        return;
    }
    if (descriptor.parse(value) === undefined) fail();
}

const DEFAULTS = Object.freeze(normalizeValue(SCHEMA, undefined));

function normalizeTriageSettings(saved) {
    return normalizeValue(SCHEMA, saved);
}

const parseUiSettings = (value) => {
    if (typeof value !== 'string') return isPlainObject(value) ? value : {};
    try {
        const parsed = JSON.parse(value);
        return isPlainObject(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

// The normalized settings of a stored ui_settings value (JSON text or an
// object, as the database returns it).
function triageSettingsFromUiSettings(value) {
    return normalizeTriageSettings(parseUiSettings(value)[STORAGE_KEY]);
}

function validateTriageSettingsUpdate(patch) {
    validateValue(SCHEMA, patch, '');
    return patch;
}

// Deep merge for objects; arrays and scalars are replaced.
function mergeInto(target, patch) {
    for (const [key, value] of Object.entries(patch)) {
        target[key] =
            isPlainObject(value) && isPlainObject(target[key])
                ? mergeInto({ ...target[key] }, value)
                : value;
    }
    return target;
}

async function getTriageSettings(user) {
    const uiSettings = await dailyPlanRepository.findUiSettings(user.id);
    return normalizeTriageSettings(uiSettings[STORAGE_KEY]);
}

// Merges the update into what is stored, keeping the keys this module does
// not know (what the retired brief left there).
async function saveTriageSettings(user, patch) {
    validateTriageSettingsUpdate(patch);
    const uiSettings = await dailyPlanRepository.findUiSettings(user.id);
    const stored = isPlainObject(uiSettings[STORAGE_KEY])
        ? structuredClone(uiSettings[STORAGE_KEY])
        : {};
    const merged = mergeInto(stored, patch);
    await dailyPlanRepository.saveUiSettings(user.id, {
        ...uiSettings,
        [STORAGE_KEY]: merged,
    });
    return normalizeTriageSettings(merged);
}

module.exports = {
    ALERT_TYPES,
    DEFAULTS,
    normalizeTriageSettings,
    triageSettingsFromUiSettings,
    validateTriageSettingsUpdate,
    getTriageSettings,
    saveTriageSettings,
};
