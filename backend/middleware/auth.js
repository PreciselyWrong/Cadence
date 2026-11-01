const { User, OIDCIdentity } = require('../models');
const { findValidTokenByValue } = require('../modules/users/apiTokenService');
const { validateAccessToken } = require('../modules/oidc/service');
const providerConfig = require('../modules/oidc/providerConfig');
const oauthConfig = require('../modules/oauth/config');
const { isMcpPath } = require('../modules/mcp/paths');

const normalizeIssuer = (issuer) => String(issuer || '').replace(/\/+$/, '');

const getBearerToken = (req) => {
    const authHeader = req.headers?.authorization || '';
    const [scheme, token] = authHeader.split(' ');
    if (scheme && token && scheme.toLowerCase() === 'bearer') {
        return token.trim();
    }
    return null;
};

// Sends a 401 and sets WWW-Authenticate so OAuth2 clients can discover the
// authorization server (RFC 9728): Cadence's own for the MCP endpoint when a
// public MCP URL is configured, otherwise the OIDC provider's.
const unauthorized = (req, res, message) => {
    if (oauthConfig.isEnabled() && isMcpPath(req)) {
        res.set(
            'WWW-Authenticate',
            `Bearer resource_metadata="${oauthConfig.publicBase()}/.well-known/oauth-protected-resource/mcp"`
        );
    } else if ((process.env.OIDC_ENABLED || '').toLowerCase() === 'true') {
        const baseUrl = process.env.BASE_URL?.replace(/\/$/, ''); // trim trailing slash
        if (baseUrl) {
            res.set(
                'WWW-Authenticate',
                `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
            );
        }
    }
    return res.status(401).json({ error: message });
};

const requireAuth = async (req, res, next) => {
    try {
        // Skip authentication for health check, login routes, and current_user
        const skipPaths = ['/api/health', '/api/login', '/api/current_user'];
        if (skipPaths.includes(req.path) || req.originalUrl === '/api/health') {
            return next();
        }

        if (req.session && req.session.userId) {
            const user = await User.findByPk(req.session.userId);
            if (!user) {
                req.session.destroy();
                return res.status(401).json({ error: 'User not found' });
            }
            req.currentUser = user;
            return next();
        }

        const bearerToken = getBearerToken(req);
        if (!bearerToken) {
            return unauthorized(req, res, 'Authentication required');
        }

        if (bearerToken.startsWith('tt_')) {
            // Tududi API key - validate via bcrypt
            const apiToken = await findValidTokenByValue(bearerToken, {
                allowScopes: ['mcp'],
            });
            if (!apiToken) {
                return unauthorized(req, res, 'Invalid or expired API token');
            }

            const user = await User.findByPk(apiToken.user_id);
            if (!user) {
                return unauthorized(req, res, 'User not found');
            }

            // Tokens issued to remote MCP connectors only open the MCP
            // endpoint, whatever path reaches the server.
            if (apiToken.abilities?.scope === 'mcp' && !isMcpPath(req)) {
                return res
                    .status(403)
                    .json({ error: 'This token only grants MCP access' });
            }

            req.currentUser = user;
            req.authToken = apiToken;

            // Update last_used_at asynchronously (non-blocking) to avoid slowing down the request
            // Only update if it hasn't been updated in the last 5 minutes to reduce database writes
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (
                !apiToken.last_used_at ||
                apiToken.last_used_at < fiveMinutesAgo
            ) {
                // Fire and forget - don't await this update
                apiToken.update({ last_used_at: new Date() }).catch((err) => {
                    console.error('Failed to update token last_used_at:', err);
                });
            }

            return next();
        }

        // OAuth2 JWT - validate via OIDC provider JWKS
        if ((process.env.OIDC_ENABLED || '').toLowerCase() === 'true') {
            let payload;
            try {
                payload = await validateAccessToken(bearerToken);
            } catch (err) {
                console.error('JWT validation failed:', err);
                return unauthorized(
                    req,
                    res,
                    'Invalid or expired access token'
                );
            }

            // A subject is only unique within one provider, so the identity is
            // looked up for the provider that issued the token.
            const identityWhere = { subject: payload.sub };
            if (payload.iss) {
                const providers = await providerConfig.getAllProviders();
                const provider = providers.find(
                    (p) =>
                        normalizeIssuer(p.issuer) ===
                        normalizeIssuer(payload.iss)
                );
                if (!provider) {
                    console.warn(
                        `[OIDC] Bearer token issuer ${payload.iss} does not match any configured provider`
                    );
                    return unauthorized(
                        req,
                        res,
                        'No account found for this identity. Please log in via OIDC first.'
                    );
                }
                identityWhere.provider_slug = provider.slug;
            }

            const identity = await OIDCIdentity.findOne({
                where: identityWhere,
                include: [{ model: User, as: 'User' }],
            });

            if (!identity?.User) {
                return unauthorized(
                    req,
                    res,
                    'No account found for this identity. Please log in via OIDC first.'
                );
            }

            req.currentUser = identity.User;
            return next();
        }

        return unauthorized(req, res, 'Invalid or expired API token');
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({ error: 'Authentication error' });
    }
};

module.exports = {
    requireAuth,
};
