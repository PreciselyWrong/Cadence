'use strict';

// Every tunable of automatic classification (docs/41-auto-classify.md), in
// one place. Order of precedence: the user's own value (ui_settings.classify,
// set in Profile or on Android), then CADENCE_CLASSIFY_* in the server's
// environment, then the defaults below. A value out of bounds is ignored, so
// a bad setting never stops the worker.

// Tags that carry a state, not a subject: never placed by the classifier.
const STATE_TAGS = [
    'someday',
    'today',
    'ticktick',
    'urgent',
    '🔎focus_mois',
    '🔍focus_trimestre',
];

const NUMBERS = {
    batch_size: { default: 12, min: 1, max: 50, integer: true },
    grace_seconds: { default: 90, min: 0, max: 3600, integer: true },
    max_attempts: { default: 5, min: 1, max: 20, integer: true },
    context_cache_minutes: { default: 30, min: 0, max: 1440, integer: true },
    suggestion_ttl_days: { default: 7, min: 1, max: 365, integer: true },
    // 0: no limit.
    daily_suggestion_limit: { default: 0, min: 0, max: 1000, integer: true },
    log_retention_days: { default: 180, min: 1, max: 3650, integer: true },
    max_tags: { default: 3, min: 0, max: 10, integer: true },
    max_tokens: { default: 2000, min: 200, max: 16000, integer: true },
};

const THRESHOLDS = {
    project: 0.8,
    tags: 0.8,
    duration: 0.6,
    priority: 0.8,
    // Below the write threshold and at least this sure: the user is asked.
    ask: 0.4,
};

const MODES = ['write', 'dry_run'];
const EFFORTS = ['', 'minimal', 'low', 'medium', 'high'];
const MODEL_MAX = 200;
const TAG_MAX = 255;

const envKey = (name) => `CADENCE_CLASSIFY_${name.toUpperCase()}`;

function readNumber(raw, spec) {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value)) return undefined;
    if (spec.integer && !Number.isInteger(value)) return undefined;
    if (value < spec.min || value > spec.max) return undefined;
    return value;
}

function readThreshold(raw) {
    return readNumber(raw, { min: 0, max: 1 });
}

function readBoolean(raw) {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    return undefined;
}

function readString(raw, max) {
    if (typeof raw !== 'string') return undefined;
    const value = raw.trim();
    return value.length <= max ? value : undefined;
}

function readTagList(raw) {
    const list =
        typeof raw === 'string'
            ? raw.split(',')
            : Array.isArray(raw)
              ? raw
              : undefined;
    if (!list) return undefined;
    const tags = list
        .filter((tag) => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter((tag) => tag && tag.length <= TAG_MAX);
    return [...new Set(tags)];
}

// One layer (environment or user) read over the previous one.
function overlay(base, layer, fromEnv) {
    const get = (name) => (fromEnv ? layer[envKey(name)] : layer[name]);
    const next = {
        ...base,
        thresholds: { ...base.thresholds },
    };
    const enabled = readBoolean(get('enabled'));
    if (enabled !== undefined) next.enabled = enabled;
    const notify = readBoolean(get('notify'));
    if (notify !== undefined) next.notify = notify;
    const mode = get('mode');
    if (MODES.includes(mode)) next.mode = mode;
    const model = readString(get('model'), MODEL_MAX);
    if (model !== undefined) next.model = model;
    const effort = get('reasoning_effort');
    if (EFFORTS.includes(effort)) next.reasoning_effort = effort;
    for (const [name, spec] of Object.entries(NUMBERS)) {
        const value = readNumber(get(name), spec);
        if (value !== undefined) next[name] = value;
    }
    const thresholds = fromEnv ? null : layer.thresholds;
    for (const name of Object.keys(THRESHOLDS)) {
        const raw = fromEnv
            ? layer[envKey(`threshold_${name}`)]
            : thresholds?.[name];
        const value = readThreshold(raw);
        if (value !== undefined) next.thresholds[name] = value;
    }
    const excluded = readTagList(get('excluded_tags'));
    if (excluded !== undefined) next.excluded_tags = excluded;
    return next;
}

function builtInDefaults() {
    return {
        enabled: true,
        mode: 'write',
        notify: true,
        // '' uses the model of Profile › AI Assistant.
        model: '',
        // '' sends no reasoning_effort (an OpenAI-compatible endpoint that
        // does not know it, such as Anthropic's, ignores it anyway).
        reasoning_effort: '',
        ...Object.fromEntries(
            Object.entries(NUMBERS).map(([name, spec]) => [name, spec.default])
        ),
        thresholds: { ...THRESHOLDS },
        excluded_tags: [...STATE_TAGS],
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
        parsed && typeof parsed.classify === 'object' && parsed.classify
            ? parsed.classify
            : {};
    const settings = overlay(serverDefaults(env), user, false);
    // A threshold to ask above the threshold to write would never ask.
    for (const name of ['project', 'tags']) {
        if (settings.thresholds.ask > settings.thresholds[name]) {
            settings.thresholds.ask = settings.thresholds[name];
        }
    }
    return settings;
}

// What a client may store: the same fields, checked; anything else dropped.
// Answers null when a given value is invalid, so the route can refuse it.
function sanitizeUserSettings(input) {
    if (!input || typeof input !== 'object') return null;
    const out = {};
    const checks = [
        ['enabled', (v) => readBoolean(v)],
        ['notify', (v) => readBoolean(v)],
        ['mode', (v) => (MODES.includes(v) ? v : undefined)],
        ['model', (v) => readString(v, MODEL_MAX)],
        ['reasoning_effort', (v) => (EFFORTS.includes(v) ? v : undefined)],
        ['excluded_tags', (v) => readTagList(v)],
        ...Object.entries(NUMBERS).map(([name, spec]) => [
            name,
            (v) => readNumber(v, spec),
        ]),
    ];
    for (const [name, read] of checks) {
        if (!(name in input)) continue;
        const value = read(input[name]);
        if (value === undefined) return null;
        out[name] = value;
    }
    if ('thresholds' in input) {
        if (!input.thresholds || typeof input.thresholds !== 'object') {
            return null;
        }
        out.thresholds = {};
        for (const [name, raw] of Object.entries(input.thresholds)) {
            if (!(name in THRESHOLDS)) return null;
            const value = readThreshold(raw);
            if (value === undefined) return null;
            out.thresholds[name] = value;
        }
    }
    return out;
}

module.exports = {
    STATE_TAGS,
    NUMBERS,
    THRESHOLDS,
    MODES,
    EFFORTS,
    serverDefaults,
    resolveSettings,
    sanitizeUserSettings,
};
