'use strict';

const express = require('express');
const { handleProtectedResource } = require('./protectedResource');
const authorizationServer = require('./authorizationServer');
const {
    oauthLimiter,
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
router.get(
    '/.well-known/oauth-authorization-server',
    oauthLimiter,
    authorizationServer.authorizationServerMetadata
);
router.post('/oauth/register', oauthLimiter, authorizationServer.register);
router.get('/oauth/authorize', oauthLimiter, authorizationServer.showAuthorize);
router.post(
    '/oauth/authorize',
    oauthLimiter,
    loginEmailLimiter,
    authorizationServer.submitAuthorize
);
router.post('/oauth/token', oauthLimiter, authorizationServer.token);

module.exports = router;
