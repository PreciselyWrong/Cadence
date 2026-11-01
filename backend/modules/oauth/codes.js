'use strict';

const crypto = require('crypto');

// Authorization codes live in memory for one minute and are spent on first
// use. A restart between consent and exchange only means signing in again;
// the server runs as a single process (docs/38-remote-mcp.md).

const CODE_TTL_MS = 60 * 1000;
const MAX_PENDING = 1000;
const pending = new Map();

function sweep(now) {
    for (const [code, grant] of pending) {
        if (grant.expiresAt <= now) pending.delete(code);
    }
}

function issueCode(grant) {
    const now = Date.now();
    sweep(now);
    if (pending.size >= MAX_PENDING) {
        pending.delete(pending.keys().next().value);
    }
    const code = crypto.randomBytes(32).toString('base64url');
    pending.set(code, { ...grant, expiresAt: now + CODE_TTL_MS });
    return code;
}

// Returns the grant once, then forgets it, whatever the caller does next.
function consumeCode(code) {
    if (typeof code !== 'string') return null;
    const grant = pending.get(code);
    if (!grant) return null;
    pending.delete(code);
    return grant.expiresAt > Date.now() ? grant : null;
}

module.exports = { issueCode, consumeCode };
