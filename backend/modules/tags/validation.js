'use strict';

const { ValidationError } = require('../../shared/errors');

// A tag name is a path: `perso/sport/course`. `/` separates namespaces and is
// allowed; every other character listed here is rejected inside a segment.
const INVALID_CHARS = /[#%&{}\\<>*?$!'"@+`|=]/;
const MAX_SEGMENT_LENGTH = 50;
const MAX_LENGTH = 200;

/**
 * Validates and normalizes a tag name (a `/`-separated path).
 * Each segment is trimmed, then the path is rejoined, so ' a / b ' becomes 'a/b'.
 * @param {string} name - The tag name to validate
 * @returns {string} - The normalized tag name
 * @throws {ValidationError} - If validation fails
 */
function validateTagName(name) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new ValidationError('Tag name is required');
    }

    const segments = name.split('/').map((segment) => segment.trim());

    if (segments.some((segment) => segment.length === 0)) {
        throw new ValidationError(
            'Tag name cannot be empty, and a path cannot start, end or contain an empty segment around "/"'
        );
    }

    for (const segment of segments) {
        if (segment.length > MAX_SEGMENT_LENGTH) {
            throw new ValidationError(
                `Tag name must be ${MAX_SEGMENT_LENGTH} characters or less`
            );
        }
        if (INVALID_CHARS.test(segment)) {
            throw new ValidationError(
                'Tag name contains invalid characters. Please avoid: # % & { } \\ < > * ? $ ! \' " @ + ` | ='
            );
        }
    }

    const normalized = segments.join('/');

    if (normalized.length > MAX_LENGTH) {
        throw new ValidationError(
            `Tag name must be ${MAX_LENGTH} characters or less`
        );
    }

    return normalized;
}

module.exports = {
    validateTagName,
};
