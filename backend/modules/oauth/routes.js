'use strict';

const express = require('express');
const { handleProtectedResource } = require('./protectedResource');
const authorizationServer = require('./authorizationServer');
const {
    oauthLimiter,
    oauthTokenLimiter,
    loginEmailLimiter,
} = require('../../middleware/rateLimiter');

const { logger } = require('../../services/logService');
const oauthConfig = require('./config');

// Misconfigurations that would otherwise only show up as a connector that
// cannot connect.
if (process.env.TUDUDI_PUBLIC_MCP_URL && !oauthConfig.isEnabled()) {
    logger.error(
        { event: 'oauth.config_invalid' },
        'TUDUDI_PUBLIC_MCP_URL is not an https origin; remote MCP OAuth is off'
    );
}
if (oauthConfig.isEnabled() && !process.env.TUDUDI_SESSION_SECRET) {
    logger.error(
        { event: 'oauth.config_invalid' },
        'TUDUDI_SESSION_SECRET is unset; remote MCP clients break on every restart'
    );
}

const router = express.Router();

router.get('/.well-known/oauth-protected-resource', handleProtectedResource);
router.get(
    '/.well-known/oauth-protected-resource/mcp',
    handleProtectedResource
);
// The metadata documents and registration have no limiter: Anthropic's
// egress range is shared, so per-IP counts would let other people's
// connectors lock ours out. Registration is closed outside the pairing
// window, which costs nothing to refuse (docs/38-remote-mcp.md).
router.get(
    '/.well-known/oauth-authorization-server',
    authorizationServer.authorizationServerMetadata
);
router.post('/oauth/register', authorizationServer.register);
router.get('/oauth/authorize', oauthLimiter, authorizationServer.showAuthorize);
router.post(
    '/oauth/authorize',
    oauthLimiter,
    loginEmailLimiter,
    authorizationServer.submitAuthorize
);
router.post('/oauth/token', oauthTokenLimiter, authorizationServer.token);

module.exports = router;
