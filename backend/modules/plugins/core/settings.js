'use strict';

const MAX_STRING_LENGTH = 2000;

// Values with the manifest defaults filled in; a secret nobody set is null.
function withDefaults(schema, stored) {
    const source = stored || {};
    const values = {};
    for (const field of schema) {
        if (source[field.key] !== undefined && source[field.key] !== null) {
            values[field.key] = source[field.key];
        } else if (field.default !== undefined) {
            values[field.key] = field.default;
        } else {
            values[field.key] = field.type === 'boolean' ? false : null;
        }
    }
    return values;
}

function validateValue(field, value) {
    switch (field.type) {
        case 'string':
        case 'secret':
            if (typeof value !== 'string') return `${field.label} must be text`;
            if (value.length > MAX_STRING_LENGTH) {
                return `${field.label} is too long`;
            }
            return null;
        case 'boolean':
            return typeof value === 'boolean'
                ? null
                : `${field.label} must be true or false`;
        case 'number':
            return typeof value === 'number' && Number.isFinite(value)
                ? null
                : `${field.label} must be a number`;
        case 'select':
            return field.options.includes(value)
                ? null
                : `${field.label} must be one of: ${field.options.join(', ')}`;
        default:
            return `${field.label} has an unknown type`;
    }
}

// Merges an update into the stored values. Keys the manifest does not
// declare are dropped. A secret left out (or sent as an empty string) keeps
// its value; `null` clears any field. `missing` lists required fields that
// are still empty afterwards, for the caller to refuse turning the plugin on.
function applySettingsUpdate(schema, current, input) {
    const values = { ...(current || {}) };
    const update = input && typeof input === 'object' ? input : {};

    for (const field of schema) {
        if (!(field.key in update)) continue;
        const value = update[field.key];
        if (value === null) {
            delete values[field.key];
            continue;
        }
        if (field.type === 'secret' && value === '') continue;
        const error = validateValue(field, value);
        if (error) return { ok: false, error };
        values[field.key] = value;
    }

    const filled = withDefaults(schema, values);
    const missing = schema
        .filter(
            (field) =>
                field.required &&
                (filled[field.key] === null || filled[field.key] === '')
        )
        .map((field) => field.key);

    return { ok: true, values, missing };
}

module.exports = { withDefaults, applySettingsUpdate };
