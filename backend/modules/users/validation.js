'use strict';

const { PASSWORD_MIN_LENGTH } = require('./userService');

const { ValidationError } = require('../../shared/errors');
const { assertSafeUrl } = require('../url/ssrfGuard');

const VALID_FREQUENCIES = [
    'daily',
    'weekdays',
    'weekly',
    '1h',
    '2h',
    '4h',
    '8h',
    '12h',
];

/**
 * Validate first day of week.
 */
function validateFirstDayOfWeek(value) {
    if (value === undefined) return;
    if (typeof value !== 'number' || value < 0 || value > 6) {
        throw new ValidationError(
            'First day of week must be a number between 0 (Sunday) and 6 (Saturday)',
            'first_day_of_week'
        );
    }
}

/**
 * Validate password.
 */
function validatePassword(password, field = 'password') {
    if (password && password.length < PASSWORD_MIN_LENGTH) {
        throw new ValidationError(
            `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
            field
        );
    }
}

/**
 * Validate task summary frequency.
 */
function validateFrequency(frequency) {
    if (!frequency) {
        throw new ValidationError('Frequency is required.');
    }
    if (!VALID_FREQUENCIES.includes(frequency)) {
        throw new ValidationError('Invalid frequency value.');
    }
    return frequency;
}

/**
 * Validate API key ID.
 */
function validateApiKeyId(id) {
    const tokenId = parseInt(id, 10);
    if (Number.isNaN(tokenId)) {
        throw new ValidationError('Invalid API key id.');
    }
    return tokenId;
}

/**
 * Validate API key name.
 */
function validateApiKeyName(name) {
    if (!name || !name.trim()) {
        throw new ValidationError('API key name is required.');
    }
    return name.trim();
}

/**
 * Validate expires_at date.
 */
function validateExpiresAt(expires_at) {
    if (!expires_at) return null;
    const parsedDate = new Date(expires_at);
    if (Number.isNaN(parsedDate.getTime())) {
        throw new ValidationError('expires_at must be a valid date.');
    }
    return parsedDate;
}

const SIDEBAR_ORDER_MAX_ITEMS = 50;
const SIDEBAR_ORDER_MAX_ID_LENGTH = 64;
const SIDEBAR_WIDTH_MIN_PERCENT = 90;
const SIDEBAR_WIDTH_MAX_PERCENT = 110;

/**
 * Validate sidebar settings.
 */
function validateSidebarSettings(body) {
    const {
        pinnedViewsOrder,
        visibleSections,
        widthPercent,
        linkOrder,
        sectionOrder,
        smartLists,
        rail,
        sectionBadges,
    } = body;
    const result = {};

    for (const [name, value] of [
        ['linkOrder', linkOrder],
        ['sectionOrder', sectionOrder],
    ]) {
        if (value === undefined) continue;
        if (
            !Array.isArray(value) ||
            value.length > SIDEBAR_ORDER_MAX_ITEMS ||
            value.some(
                (id) =>
                    typeof id !== 'string' ||
                    id.length === 0 ||
                    id.length > SIDEBAR_ORDER_MAX_ID_LENGTH
            )
        ) {
            throw new ValidationError(
                `${name} must be an array of at most ${SIDEBAR_ORDER_MAX_ITEMS} non-empty strings`
            );
        }
        result[name] = value;
    }

    if (widthPercent !== undefined) {
        if (
            typeof widthPercent !== 'number' ||
            !Number.isFinite(widthPercent) ||
            widthPercent < SIDEBAR_WIDTH_MIN_PERCENT ||
            widthPercent > SIDEBAR_WIDTH_MAX_PERCENT
        ) {
            throw new ValidationError(
                `widthPercent must be a number between ${SIDEBAR_WIDTH_MIN_PERCENT} and ${SIDEBAR_WIDTH_MAX_PERCENT}`
            );
        }
        result.widthPercent = widthPercent;
    }

    if (pinnedViewsOrder !== undefined) {
        if (!Array.isArray(pinnedViewsOrder)) {
            throw new ValidationError('pinnedViewsOrder must be an array');
        }
        result.pinnedViewsOrder = pinnedViewsOrder;
    }

    if (visibleSections !== undefined) {
        if (
            typeof visibleSections !== 'object' ||
            visibleSections === null ||
            Array.isArray(visibleSections)
        ) {
            throw new ValidationError('visibleSections must be an object');
        }
        for (const value of Object.values(visibleSections)) {
            if (typeof value !== 'boolean') {
                throw new ValidationError(
                    'visibleSections values must be booleans'
                );
            }
        }
        result.visibleSections = visibleSections;
    }

    if (smartLists !== undefined) {
        result.smartLists = sanitizeSmartLists(smartLists);
    }
    if (rail !== undefined) {
        result.rail = sanitizeRail(rail);
    }
    if (sectionBadges !== undefined) {
        result.sectionBadges = sanitizeSectionBadges(sectionBadges);
    }

    return result;
}

// Minimal sidebar: the smart lists, icon rail placement and section count
// badges. Unknown keys are dropped; the client fills in defaults for any
// item missing from the saved list, so a new item still appears.
const MINIMAL_SMART_LIST_KEYS = ['today', 'tomorrow', 'next7', 'inbox'];
const MINIMAL_RAIL_KEYS = [
    'today',
    'inbox',
    'calendar',
    'notes',
    'habits',
    'views',
    'areas',
    'goals',
    'people',
    'insights',
    'review',
    'allTasks',
    'assignedToMe',
    'everyone',
    'boards',
    'templates',
    'access',
];
const MINIMAL_RAIL_PLACES = ['rail', 'more', 'hidden'];
const MINIMAL_SECTION_BADGE_KEYS = ['favorites', 'projects', 'areas', 'tags'];

// Missing flags count as on; anything else is read as a boolean the way the
// feature flags are ('false', '0', 0 and false are off).
const coerceFlag = (value) =>
    value === undefined
        ? true
        : !(
              value === false ||
              value === 'false' ||
              value === '0' ||
              value === 0
          );

const isPlainObject = (value) =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

function sanitizeSmartLists(value) {
    if (!Array.isArray(value) || value.length > SIDEBAR_ORDER_MAX_ITEMS) {
        throw new ValidationError(
            `smartLists must be an array of at most ${SIDEBAR_ORDER_MAX_ITEMS} entries`
        );
    }
    const seen = new Set();
    const result = [];
    for (const entry of value) {
        if (!isPlainObject(entry)) continue;
        const { key } = entry;
        if (!MINIMAL_SMART_LIST_KEYS.includes(key) || seen.has(key)) continue;
        seen.add(key);
        result.push({
            key,
            visible: coerceFlag(entry.visible),
            showCount: coerceFlag(entry.showCount),
        });
    }
    return result;
}

function sanitizeRail(value) {
    if (!Array.isArray(value) || value.length > SIDEBAR_ORDER_MAX_ITEMS) {
        throw new ValidationError(
            `rail must be an array of at most ${SIDEBAR_ORDER_MAX_ITEMS} entries`
        );
    }
    const seen = new Set();
    const result = [];
    for (const entry of value) {
        if (!isPlainObject(entry)) continue;
        const { key, place } = entry;
        if (!MINIMAL_RAIL_KEYS.includes(key) || seen.has(key)) continue;
        if (!MINIMAL_RAIL_PLACES.includes(place)) continue;
        seen.add(key);
        result.push({ key, place });
    }
    return result;
}

function sanitizeSectionBadges(value) {
    if (!isPlainObject(value)) {
        throw new ValidationError('sectionBadges must be an object');
    }
    const result = {};
    for (const key of MINIMAL_SECTION_BADGE_KEYS) {
        if (key in value) result[key] = coerceFlag(value[key]);
    }
    return result;
}

const AI_MODEL_MAX_LENGTH = 200;

// ai_base_url is attacker-controlled: any authenticated user can set it, and
// the server then makes outbound requests to it (backend/modules/ai-assistant
// /service.js). Reuse the same SSRF guard the url-preview module uses rather
// than a bare `new URL()` check, or this becomes a way to reach internal
// services (cloud metadata, other containers) from an authenticated account.
async function validateAiSettings({ ai_base_url, ai_model }) {
    if (
        ai_base_url !== undefined &&
        ai_base_url !== null &&
        ai_base_url !== ''
    ) {
        try {
            await assertSafeUrl(ai_base_url);
        } catch {
            throw new ValidationError(
                'Base URL must be a public http(s) URL on the default port (internal/private/loopback addresses are not allowed)',
                'ai_base_url'
            );
        }
    }
    if (ai_model !== undefined && ai_model !== null) {
        if (typeof ai_model !== 'string') {
            throw new ValidationError('Model must be a string', 'ai_model');
        }
        if (ai_model.length > AI_MODEL_MAX_LENGTH) {
            throw new ValidationError(
                `Model must be ${AI_MODEL_MAX_LENGTH} characters or fewer`,
                'ai_model'
            );
        }
    }
}

module.exports = {
    VALID_FREQUENCIES,
    validateFirstDayOfWeek,
    validatePassword,
    validateFrequency,
    validateApiKeyId,
    validateApiKeyName,
    validateExpiresAt,
    validateSidebarSettings,
    validateAiSettings,
};
