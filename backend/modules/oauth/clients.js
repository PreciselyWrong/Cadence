'use strict';

const crypto = require('crypto');
const { getConfig } = require('../../config/config');
const { allowedRedirectUris } = require('./config');

// Dynamic Client Registration (RFC 7591) without a table: the client_id
// carries the registered metadata, signed with a key derived from the
// session secret, so a client survives restarts as long as
// TUDUDI_SESSION_SECRET does and cannot be forged or altered. Clients are
// public (PKCE, no secret), as the MCP authorization spec expects.

const CLIENT_PREFIX = 'mcp_';
const MAX_REDIRECT_URIS = 5;
const MAX_NAME_LENGTH = 100;

class RegistrationError extends Error {
    constructor(error, description) {
        super(description);
        this.error = error;
    }
}

const signingKey = () =>
    crypto
        .createHmac('sha256', getConfig().secret)
        .update('cadence-mcp-oauth-client-v1')
        .digest();

const sign = (payload) =>
    crypto.createHmac('sha256', signingKey()).update(payload).digest();

function cleanName(value) {
    if (typeof value !== 'string') return 'MCP client';
    // eslint-disable-next-line no-control-regex
    const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return name.slice(0, MAX_NAME_LENGTH) || 'MCP client';
}

function registerClient(body = {}) {
    const uris = body.redirect_uris;
    if (
        !Array.isArray(uris) ||
        uris.length === 0 ||
        uris.length > MAX_REDIRECT_URIS ||
        uris.some((uri) => typeof uri !== 'string')
    ) {
        throw new RegistrationError(
            'invalid_redirect_uri',
            'redirect_uris must list 1 to 5 URIs'
        );
    }
    const allowed = allowedRedirectUris();
    const refused = uris.filter((uri) => !allowed.includes(uri));
    if (refused.length > 0) {
        throw new RegistrationError(
            'invalid_redirect_uri',
            'redirect_uris contains a URI this server does not accept'
        );
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const metadata = {
        v: 1,
        n: cleanName(body.client_name),
        r: [...new Set(uris)],
        t: issuedAt,
        // Each registration is its own client, even with the same metadata.
        j: crypto.randomBytes(9).toString('base64url'),
    };
    const payload = Buffer.from(JSON.stringify(metadata)).toString('base64url');
    const clientId = `${CLIENT_PREFIX}${payload}.${sign(payload).toString(
        'base64url'
    )}`;

    return {
        client_id: clientId,
        client_id_issued_at: issuedAt,
        client_name: metadata.n,
        redirect_uris: metadata.r,
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
    };
}

// The client's registered name and redirect URIs, or null when the id is
// not one this server signed.
function readClient(clientId) {
    if (typeof clientId !== 'string' || !clientId.startsWith(CLIENT_PREFIX)) {
        return null;
    }
    const [payload, signature, extra] = clientId
        .slice(CLIENT_PREFIX.length)
        .split('.');
    if (!payload || !signature || extra !== undefined) return null;

    const expected = sign(payload);
    const given = Buffer.from(signature, 'base64url');
    if (
        given.length !== expected.length ||
        !crypto.timingSafeEqual(given, expected)
    ) {
        return null;
    }
    try {
        const metadata = JSON.parse(
            Buffer.from(payload, 'base64url').toString('utf8')
        );
        if (metadata.v !== 1 || !Array.isArray(metadata.r)) return null;
        return { clientId, name: metadata.n, redirectUris: metadata.r };
    } catch {
        return null;
    }
}

// A redirect URI is usable when the client registered it and the server
// still accepts it, so narrowing the allowlist retires older clients.
const acceptsRedirect = (client, redirectUri) =>
    typeof redirectUri === 'string' &&
    client.redirectUris.includes(redirectUri) &&
    allowedRedirectUris().includes(redirectUri);

module.exports = {
    RegistrationError,
    registerClient,
    readClient,
    acceptsRedirect,
};
