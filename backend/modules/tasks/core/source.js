'use strict';

const { ValidationError } = require('../../../shared/errors');

// Where a task came from. A task with no source (plain web creation) has none.
// A task mirrored from TODO.md is marked by its source_key, not by this list.
const TASK_SOURCES = [
    'gmail',
    'telegram',
    'mcp',
    'android',
    'desktop',
    'link',
    'todo_md',
    'web',
];

const SOURCE_URL_MAX_LENGTH = 2048;

// undefined: the caller did not send it. null or blank: no source.
function parseTaskSource(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const source = typeof value === 'string' ? value.trim() : '';
    if (!TASK_SOURCES.includes(source)) {
        throw new ValidationError(
            `source must be one of: ${TASK_SOURCES.join(', ')}`
        );
    }
    return source;
}

// Only web pages: the badge opens the link outside the app.
function parseTaskSourceUrl(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const url = typeof value === 'string' ? value.trim() : '';
    if (!url || url.length > SOURCE_URL_MAX_LENGTH || !isWebUrl(url)) {
        throw new ValidationError(
            'source_url must be an http or https address'
        );
    }
    return url;
}

function isWebUrl(value) {
    try {
        const { protocol } = new URL(value);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

// What a task inherits when an inbox item is turned into it: the item's
// origin when that is a task origin, and the item's text when the item is
// just a web address.
function sourceFromInboxItem(item) {
    const content =
        typeof item?.content === 'string' ? item.content.trim() : '';
    const sourceUrl =
        content && !/\s/.test(content) && isWebUrl(content) ? content : null;
    const origin = TASK_SOURCES.includes(item?.source) ? item.source : null;
    return {
        source: origin ?? (sourceUrl ? 'link' : null),
        source_url: sourceUrl,
    };
}

module.exports = {
    TASK_SOURCES,
    parseTaskSource,
    parseTaskSourceUrl,
    sourceFromInboxItem,
};
