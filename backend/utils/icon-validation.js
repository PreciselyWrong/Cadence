'use strict';

const { ValidationError } = require('../shared/errors');

// Kebab-case ids such as `home` or `smoke-free`, matching the shared icon set.
const ICON_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_LENGTH = 40;

/**
 * Normalizes an icon id: null, undefined and '' clear it (null).
 * Any other value must be a valid id, otherwise a ValidationError is thrown.
 */
function normalizeIcon(icon) {
    if (icon === null || icon === undefined || icon === '') return null;
    if (
        typeof icon !== 'string' ||
        icon.length > MAX_LENGTH ||
        !ICON_ID.test(icon)
    ) {
        throw new ValidationError('Invalid icon');
    }
    return icon;
}

module.exports = { normalizeIcon, ICON_ID, MAX_LENGTH };
