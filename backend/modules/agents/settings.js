'use strict';

// Settings of the Hermes agent connector, stored in ui_settings.agents.
// The API key is not here: it lives encrypted in users.agent_api_key.
//
// Two entry points share one set of field validators:
// - normalizeAgentSettings: tolerant, for stored values (a bad field falls
//   back to its default, the rest is kept);
// - validateAgentSettings: strict, for writes (throws ValidationError).

const { ValidationError } = require('../../shared/errors');
const { isLinkLocalIp } = require('../url/ssrfGuard');

const PROFILE_KEYS = ['mail', 'drafting'];
const PROFILE_NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const RULE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const RULE_MODES = ['propose', 'off'];
const MAX_BASE_URL_LENGTH = 300;
const MIN_TIMEOUT_SECONDS = 10;
const MAX_TIMEOUT_SECONDS = 600;
const MAX_TRIAGE_RULES = 50;
const METADATA_HOSTNAMES = new Set([
    'metadata',
    'metadata.google.internal',
    'metadata.goog',
]);

const DEFAULT_TIMEOUT_SECONDS = 120;

// Cloud metadata names and link-local addresses: never a service Cadence calls.
function isLinkLocalOrMetadataHost(host) {
    return METADATA_HOSTNAMES.has(host) || isLinkLocalIp(host);
}

function defaultSettings() {
    return {
        baseUrl: '',
        timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
        profiles: { mail: '', drafting: '' },
        triageRules: [],
    };
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalid(message) {
    return new ValidationError(message);
}

function cleanString(value, max, label) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') throw invalid(`${label} must be a string`);
    const trimmed = value.trim();
    if (trimmed.length > max) {
        throw invalid(`${label} must be at most ${max} characters`);
    }
    return trimmed;
}

function validateBaseUrl(value) {
    const raw = cleanString(value, MAX_BASE_URL_LENGTH, 'baseUrl').replace(
        /\/+$/,
        ''
    );
    if (raw === '') return '';

    let url;
    try {
        url = new URL(raw);
    } catch {
        throw invalid('baseUrl must be an absolute http(s) URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw invalid('baseUrl must use http or https');
    }
    if (url.username || url.password) {
        throw invalid('baseUrl must not contain credentials');
    }
    if (url.search || url.hash) {
        throw invalid('baseUrl must not contain a query or a fragment');
    }

    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (isLinkLocalOrMetadataHost(host)) {
        throw invalid(
            'baseUrl must not point to a link-local or metadata host'
        );
    }

    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function validateTimeoutSeconds(value) {
    if (value === undefined) return DEFAULT_TIMEOUT_SECONDS;
    const seconds = typeof value === 'string' ? Number(value) : value;
    if (
        !Number.isInteger(seconds) ||
        seconds < MIN_TIMEOUT_SECONDS ||
        seconds > MAX_TIMEOUT_SECONDS
    ) {
        throw invalid(
            `timeoutSeconds must be an integer from ${MIN_TIMEOUT_SECONDS} to ${MAX_TIMEOUT_SECONDS}`
        );
    }
    return seconds;
}

function validateProfiles(value) {
    const defaults = defaultSettings().profiles;
    if (value === undefined) return defaults;
    if (!isPlainObject(value)) throw invalid('profiles must be an object');

    const unknown = Object.keys(value).filter(
        (key) => !PROFILE_KEYS.includes(key)
    );
    if (unknown.length > 0) {
        throw invalid(`Unknown profile key: ${unknown[0]}`);
    }

    const profiles = { ...defaults };
    for (const key of PROFILE_KEYS) {
        if (value[key] === undefined || value[key] === null) continue;
        if (typeof value[key] !== 'string') {
            throw invalid(`profiles.${key} must be a string`);
        }
        const name = value[key].trim();
        if (name !== '' && !PROFILE_NAME.test(name)) {
            throw invalid(`profiles.${key} is not a valid profile name`);
        }
        profiles[key] = name;
    }
    return profiles;
}

function validateTriageRule(raw, index) {
    if (!isPlainObject(raw)) {
        throw invalid(`triageRules[${index}] must be an object`);
    }
    if (typeof raw.id !== 'string' || !RULE_ID.test(raw.id)) {
        throw invalid(`triageRules[${index}].id is required`);
    }
    if (!RULE_MODES.includes(raw.mode)) {
        throw invalid(`triageRules[${index}].mode must be propose or off`);
    }
    const match = raw.match === undefined ? {} : raw.match;
    if (!isPlainObject(match)) {
        throw invalid(`triageRules[${index}].match must be an object`);
    }
    return {
        id: raw.id,
        match: {
            from: cleanString(match.from, 200, 'match.from'),
            label: cleanString(match.label, 100, 'match.label'),
            type: cleanString(match.type, 40, 'match.type'),
        },
        instruction: cleanString(raw.instruction, 500, 'instruction'),
        mode: raw.mode,
    };
}

function validateTriageRules(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw invalid('triageRules must be an array');
    if (value.length > MAX_TRIAGE_RULES) {
        throw invalid(
            `triageRules must have at most ${MAX_TRIAGE_RULES} items`
        );
    }
    return value.map(validateTriageRule);
}

const FIELD_VALIDATORS = {
    baseUrl: validateBaseUrl,
    timeoutSeconds: validateTimeoutSeconds,
    profiles: validateProfiles,
    triageRules: validateTriageRules,
};

// Stored values: each field is validated alone and falls back to its default.
function normalizeAgentSettings(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const settings = defaultSettings();
    for (const [field, validate] of Object.entries(FIELD_VALIDATORS)) {
        if (source[field] === undefined) continue;
        try {
            settings[field] = validate(source[field]);
        } catch {
            // Keep the default: a bad stored value must not break reads.
        }
    }
    return settings;
}

// Writes: the whole merged settings object, unknown keys refused.
function validateAgentSettings(input) {
    if (!isPlainObject(input)) throw invalid('Settings must be an object');
    const unknown = Object.keys(input).filter(
        (key) => !(key in FIELD_VALIDATORS)
    );
    if (unknown.length > 0) {
        throw invalid(`Unknown setting: ${unknown[0]}`);
    }
    const settings = {};
    for (const [field, validate] of Object.entries(FIELD_VALIDATORS)) {
        settings[field] = validate(input[field]);
    }
    return settings;
}

module.exports = {
    DEFAULT_TIMEOUT_SECONDS,
    isLinkLocalOrMetadataHost,
    MAX_TRIAGE_RULES,
    defaultSettings,
    normalizeAgentSettings,
    validateAgentSettings,
    validateBaseUrl,
    validateProfiles,
    validateTriageRules,
};
