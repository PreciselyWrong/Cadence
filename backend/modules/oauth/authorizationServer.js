'use strict';

const crypto = require('crypto');
const { logger } = require('../../services/logService');
const oauthConfig = require('./config');
const {
    RegistrationError,
    registerClient,
    readClient,
    acceptsRedirect,
} = require('./clients');
const { issueCode, consumeCode } = require('./codes');
const { verifyOwner, issueMcpToken } = require('./service');
const { renderConsent, renderError } = require('./consentPage');

// OAuth 2.1 authorization server for remote MCP connectors such as
// claude.ai custom connectors: RFC 8414 metadata, RFC 7591 registration
// restricted to an allowlist of redirect URIs, authorization code with
// S256 PKCE, and MCP-only access tokens. Off unless TUDUDI_PUBLIC_MCP_URL is
// set. See docs/38-remote-mcp.md.

const SCOPE = 'mcp';
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

const notFound = (res) => res.status(404).end();
const trimSlash = (value) => String(value).replace(/\/+$/, '');

function authorizationServerMetadata(req, res) {
    if (!oauthConfig.isEnabled()) return notFound(res);
    const base = oauthConfig.publicBase();
    return res.json({
        issuer: base,
        authorization_endpoint: `${base}/oauth/authorize`,
        token_endpoint: `${base}/oauth/token`,
        registration_endpoint: `${base}/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        token_endpoint_auth_methods_supported: ['none'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: [SCOPE],
        authorization_response_iss_parameter_supported: true,
    });
}

function register(req, res) {
    if (!oauthConfig.isEnabled()) return notFound(res);
    try {
        const client = registerClient(req.body || {});
        logger.info(
            {
                event: 'oauth.client_registered',
                clientName: client.client_name,
                redirectUris: client.redirect_uris,
                ip: req.ip,
            },
            'OAuth client registered'
        );
        res.setHeader('Cache-Control', 'no-store');
        return res.status(201).json(client);
    } catch (error) {
        if (!(error instanceof RegistrationError)) throw error;
        logger.warn(
            {
                event: 'oauth.client_refused',
                error: error.error,
                ip: req.ip,
            },
            'OAuth client registration refused'
        );
        return res
            .status(400)
            .json({ error: error.error, error_description: error.message });
    }
}

function redirectWith(res, redirectUri, params) {
    const url = new URL(redirectUri);
    for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'string' && value)
            url.searchParams.set(key, value);
    }
    url.searchParams.set('iss', oauthConfig.publicBase());
    return res.redirect(302, url.toString());
}

// What is wrong with an authorization request, in the order RFC 6749 4.1.2.1
// asks: a bad client or redirect URI is shown to the person and never
// redirected to; anything else goes back to the client as an error.
function checkAuthorizeRequest(params) {
    const client = readClient(params.client_id);
    if (!client) {
        return { fatal: 'This app is not registered with Cadence.' };
    }
    if (!acceptsRedirect(client, params.redirect_uri)) {
        return {
            fatal: 'This app asked to return to an address Cadence does not accept.',
        };
    }
    if (params.response_type !== 'code') {
        return { client, error: 'unsupported_response_type' };
    }
    if (
        params.code_challenge_method !== 'S256' ||
        typeof params.code_challenge !== 'string' ||
        !CHALLENGE_PATTERN.test(params.code_challenge)
    ) {
        return { client, error: 'invalid_request' };
    }
    if (
        params.resource !== undefined &&
        trimSlash(params.resource) !== oauthConfig.resourceUrl()
    ) {
        return { client, error: 'invalid_target' };
    }
    return { client };
}

function pickParams(source = {}) {
    const fields = [
        'response_type',
        'client_id',
        'redirect_uri',
        'code_challenge',
        'code_challenge_method',
        'state',
        'scope',
        'resource',
    ];
    const params = {};
    for (const field of fields) {
        if (typeof source[field] === 'string') params[field] = source[field];
    }
    return params;
}

function showAuthorize(req, res) {
    if (!oauthConfig.isEnabled()) return notFound(res);
    const params = pickParams(req.query);
    const check = checkAuthorizeRequest(params);
    if (check.fatal) return renderError(res, check.fatal);
    if (check.error) {
        return redirectWith(res, params.redirect_uri, {
            error: check.error,
            state: params.state,
        });
    }
    return renderConsent(res, { client: check.client, params });
}

async function submitAuthorize(req, res, next) {
    if (!oauthConfig.isEnabled()) return notFound(res);
    try {
        const body = req.body || {};
        const params = pickParams(body);
        const check = checkAuthorizeRequest(params);
        if (check.fatal) return renderError(res, check.fatal);
        if (check.error) {
            return redirectWith(res, params.redirect_uri, {
                error: check.error,
                state: params.state,
            });
        }
        const { client } = check;

        if (body.decision !== 'allow') {
            logger.info(
                {
                    event: 'oauth.authorize_denied',
                    clientName: client.name,
                    ip: req.ip,
                },
                'OAuth authorization denied'
            );
            return redirectWith(res, params.redirect_uri, {
                error: 'access_denied',
                state: params.state,
            });
        }

        const owner = await verifyOwner(
            {
                email: body.email,
                password: body.password,
                mfaCode: body.mfa_code,
            },
            req
        );
        if (!owner.ok) {
            logger.warn(
                {
                    event: 'oauth.authorize_refused',
                    reason: owner.reason,
                    userId: owner.userId,
                    clientName: client.name,
                    ip: req.ip,
                },
                'OAuth authorization refused'
            );
            return renderConsent(res, {
                client,
                params,
                status: 401,
                error:
                    owner.reason === 'password_auth_disabled'
                        ? 'Password sign-in is turned off on this server.'
                        : 'Sign-in failed. Check your email, password and two-factor code.',
            });
        }

        const code = issueCode({
            clientId: client.clientId,
            clientName: client.name,
            redirectUri: params.redirect_uri,
            codeChallenge: params.code_challenge,
            userId: owner.user.id,
        });
        logger.info(
            {
                event: 'oauth.authorize_granted',
                userId: owner.user.id,
                clientName: client.name,
                ip: req.ip,
            },
            'OAuth authorization granted'
        );
        return redirectWith(res, params.redirect_uri, {
            code,
            state: params.state,
        });
    } catch (error) {
        return next(error);
    }
}

function s256(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function sameString(a, b) {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function token(req, res, next) {
    if (!oauthConfig.isEnabled()) return notFound(res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');

    const refuse = (status, error) => {
        logger.warn(
            { event: 'oauth.token_refused', error, ip: req.ip },
            'OAuth token request refused'
        );
        return res.status(status).json({ error });
    };

    try {
        const body = req.body || {};
        if (body.grant_type !== 'authorization_code') {
            return refuse(400, 'unsupported_grant_type');
        }
        const { code, redirect_uri, client_id, code_verifier, resource } = body;
        if (
            [code, redirect_uri, client_id, code_verifier].some(
                (value) => typeof value !== 'string' || !value
            )
        ) {
            return refuse(400, 'invalid_request');
        }
        const client = readClient(client_id);
        if (!client) return refuse(401, 'invalid_client');

        // Spent before any other check, so a code is tried at most once.
        const grant = consumeCode(code);
        if (
            !grant ||
            grant.clientId !== client.clientId ||
            grant.redirectUri !== redirect_uri ||
            !VERIFIER_PATTERN.test(code_verifier) ||
            !sameString(s256(code_verifier), grant.codeChallenge)
        ) {
            return refuse(400, 'invalid_grant');
        }
        if (
            resource !== undefined &&
            trimSlash(resource) !== oauthConfig.resourceUrl()
        ) {
            return refuse(400, 'invalid_target');
        }

        const issued = await issueMcpToken({
            userId: grant.userId,
            clientName: grant.clientName,
        });
        logger.info(
            {
                event: 'oauth.token_issued',
                userId: grant.userId,
                tokenId: issued.tokenId,
                clientName: grant.clientName,
                expiresAt: issued.expiresAt.toISOString(),
                ip: req.ip,
            },
            'OAuth token issued'
        );
        return res.json({
            access_token: issued.rawToken,
            token_type: 'Bearer',
            expires_in: issued.lifetime,
            scope: SCOPE,
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    authorizationServerMetadata,
    register,
    showAuthorize,
    submitAuthorize,
    token,
};
