'use strict';

const { logError } = require('../../services/logService');

// Runs one item's sync step. A failing item is logged and counted instead of
// stopping the run; a failed pull keeps the sync token so it is retried.
async function guard(ctx, phase, fn) {
    try {
        await fn();
    } catch (error) {
        if (error.name === 'GoogleAuthRevokedError') throw error;
        if (phase === 'pull') ctx.pullFailed = true;
        ctx.itemErrors = ctx.itemErrors || [];
        ctx.itemErrors.push(error.message);
        logError(`Google sync (${phase}) skipped an item:`, error);
    }
}

module.exports = { guard };
