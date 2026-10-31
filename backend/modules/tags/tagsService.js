'use strict';

const { validateTagName: validatePath } = require('./validation');

/**
 * Returns `{valid: true, name}` or `{valid: false, error}` for the callers that
 * report per-item errors (tasks, notes, projects, templates, onboarding, MCP).
 * The rules live in validation.js; this only adapts the return shape.
 */
function validateTagName(name) {
    try {
        return { valid: true, name: validatePath(name) };
    } catch (error) {
        return { valid: false, error: error.message };
    }
}

module.exports = {
    validateTagName,
};
