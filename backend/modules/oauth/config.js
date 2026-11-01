'use strict';

// Settings of the built-in OAuth authorization server for remote MCP
// connectors (docs/38-remote-mcp.md). Read from the environment on every
// call: tests swap process.env, and nothing here is costly.

const DEFAULT_REDIRECT_URIS = [
    'https://claude.ai/api/mcp/auth_callback',
    // Anthropic announced the callback may move to claude.com.
    'https://claude.com/api/mcp/auth_callback',
];
const DEFAULT_TOKEN_DAYS = 30;
const MAX_TOKEN_DAYS = 365;

// The public origin the connector is reached at, e.g.
// https://cadence.nicolab.ch. Every URL in the metadata is built from it,
// never from Host or X-Forwarded-Host, which a client can set. Unset (or
// not an https origin, except localhost) means the server is off.
function publicBase() {
    const raw = (process.env.TUDUDI_PUBLIC_MCP_URL || '').trim();
    if (!raw) return null;
    let url;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
        return null;
    }
    return url.origin;
}

const isEnabled = () => publicBase() !== null;

const resourceUrl = () => `${publicBase()}/mcp`;

function allowedRedirectUris() {
    const raw = process.env.TUDUDI_MCP_OAUTH_REDIRECT_URIS;
    if (raw === undefined || raw.trim() === '') return DEFAULT_REDIRECT_URIS;
    return raw
        .split(',')
        .map((uri) => uri.trim())
        .filter(Boolean);
}

// The accounts allowed to grant a connector, as lowercase emails, or null
// when TUDUDI_MCP_OAUTH_ALLOWED_EMAILS is unset: then only admins may.
function allowedConsentEmails() {
    const raw = process.env.TUDUDI_MCP_OAUTH_ALLOWED_EMAILS;
    if (raw === undefined || raw.trim() === '') return null;
    return raw
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}

function tokenLifetimeSeconds() {
    const days = parseInt(process.env.TUDUDI_MCP_OAUTH_TOKEN_DAYS, 10);
    const valid = Number.isInteger(days) && days >= 1 && days <= MAX_TOKEN_DAYS;
    return (valid ? days : DEFAULT_TOKEN_DAYS) * 24 * 3600;
}

module.exports = {
    DEFAULT_REDIRECT_URIS,
    publicBase,
    isEnabled,
    resourceUrl,
    allowedRedirectUris,
    allowedConsentEmails,
    tokenLifetimeSeconds,
};
