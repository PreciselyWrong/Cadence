'use strict';

const oauthConfig = require('./config');

/**
 * Serves the OAuth 2.0 Protected Resource Metadata document (RFC 9728).
 *
 * Registered at /.well-known/oauth-protected-resource (and its /mcp
 * suffixed form) before requireAuth. With TUDUDI_PUBLIC_MCP_URL set, the
 * resource is the public MCP endpoint and Cadence's own authorization server
 * issues its tokens (docs/38-remote-mcp.md). Otherwise it is only active
 * when OIDC_ENABLED=true, OIDC_ISSUER_URL and BASE_URL are set.
 */
function handleProtectedResource(req, res) {
    if (oauthConfig.isEnabled()) {
        return res.json({
            resource: oauthConfig.resourceUrl(),
            authorization_servers: [oauthConfig.publicBase()],
            scopes_supported: ['mcp'],
            bearer_methods_supported: ['header'],
        });
    }

    const issuerUrl = process.env.OIDC_ISSUER_URL?.replace(/\/$/, ''); // trim trailing slash
    if (
        !issuerUrl ||
        (process.env.OIDC_ENABLED || '').toLowerCase() !== 'true'
    ) {
        return res.status(404).end();
    }

    const resource = process.env.BASE_URL?.replace(/\/$/, ''); // trim trailing slash
    if (!resource) {
        return res.status(404).end();
    }

    return res.json({
        resource,
        authorization_servers: [issuerUrl],
        scopes_supported: ['openid', 'email', 'profile'],
    });
}

module.exports = { handleProtectedResource };
