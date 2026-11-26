'use strict';

// Every tunable of « Découper en étapes » (docs/13-ai-assistant.md), in one
// place. Order of precedence: the user's own value (ui_settings.breakdown,
// set in Profile or on Android), then CADENCE_BREAKDOWN_* in the server's
// environment, then the defaults below. A value out of bounds is ignored.

const NUMBERS = {
    max_steps: { default: 6, min: 2, max: 15 },
    // 5 is the smallest estimate a task accepts (tasks.estimated_minutes).
    min_step_minutes: { default: 5, min: 5, max: 60 },
    max_step_minutes: { default: 25, min: 5, max: 240 },
    note_chars: { default: 1500, min: 0, max: 10000 },
    max_tokens: { default: 800, min: 200, max: 8000 },
};
const MODEL_MAX = 200;

const envKey = (name) => `CADENCE_BREAKDOWN_${name.toUpperCase()}`;

function readNumber(raw, spec) {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const value = Number(raw);
    if (!Number.isInteger(value)) return undefined;
    if (value < spec.min || value > spec.max) return undefined;
    return value;
}

function readBoolean(raw) {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    return undefined;
}

function readString(raw) {
    if (typeof raw !== 'string') return undefined;
    const value = raw.trim();
    return value.length <= MODEL_MAX ? value : undefined;
}

const READERS = {
    enabled: readBoolean,
    model: readString,
    ...Object.fromEntries(
        Object.entries(NUMBERS).map(([name, spec]) => [
            name,
            (raw) => readNumber(raw, spec),
        ])
    ),
};

function overlay(base, layer, fromEnv) {
    const next = { ...base };
    for (const [name, read] of Object.entries(READERS)) {
        const value = read(fromEnv ? layer[envKey(name)] : layer[name]);
        if (value !== undefined) next[name] = value;
    }
    return next;
}

function builtInDefaults() {
    return {
        enabled: true,
        // '' uses the model of Profile › AI Assistant.
        model: '',
        ...Object.fromEntries(
            Object.entries(NUMBERS).map(([name, spec]) => [name, spec.default])
        ),
    };
}

function serverDefaults(env = process.env) {
    return overlay(builtInDefaults(), env, true);
}

// `uiSettings` is the user's ui_settings column (object or JSON text).
function resolveSettings(uiSettings, env = process.env) {
    let parsed = uiSettings;
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            parsed = {};
        }
    }
    const user =
        parsed && typeof parsed.breakdown === 'object' && parsed.breakdown
            ? parsed.breakdown
            : {};
    const settings = overlay(serverDefaults(env), user, false);
    if (settings.min_step_minutes > settings.max_step_minutes) {
        settings.min_step_minutes = settings.max_step_minutes;
    }
    return settings;
}

// What a client may store: the known fields, checked; anything else dropped.
// Null when a given value is invalid, so the route can refuse it.
function sanitizeUserSettings(input) {
    if (!input || typeof input !== 'object') return null;
    const out = {};
    for (const [name, read] of Object.entries(READERS)) {
        if (!(name in input)) continue;
        const value = read(input[name]);
        if (value === undefined) return null;
        out[name] = value;
    }
    return out;
}

module.exports = {
    NUMBERS,
    serverDefaults,
    resolveSettings,
    sanitizeUserSettings,
};
