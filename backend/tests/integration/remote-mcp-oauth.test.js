'use strict';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const { ApiToken } = require('../../models');
const {
    createTestUser,
    enrollMfa,
    authenticateUser,
} = require('../helpers/testUtils');
const { logger } = require('../../services/logService');
const {
    createApiToken,
    revokeApiToken,
} = require('../../modules/users/apiTokenService');

const BASE = 'https://cadence.example.test';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

// jest.replaceProperty restores automatically between tests (restoreMocks).
const withEnv = (vars) =>
    jest.replaceProperty(process, 'env', { ...process.env, ...vars });

const base64url = (buffer) => buffer.toString('base64url');
const newVerifier = () => base64url(crypto.randomBytes(32));
const challengeOf = (verifier) =>
    base64url(crypto.createHash('sha256').update(verifier).digest());

async function registerClient(body = {}) {
    return request(app)
        .post('/oauth/register')
        .send({
            client_name: 'Claude',
            redirect_uris: [CALLBACK],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            ...body,
        });
}

function authorizeParams(clientId, verifier, extra = {}) {
    return {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: CALLBACK,
        code_challenge: challengeOf(verifier),
        code_challenge_method: 'S256',
        state: 'state-123',
        scope: 'mcp',
        resource: `${BASE}/mcp`,
        ...extra,
    };
}

const mcpCall = (token, body) =>
    request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send(body);

describe('Remote MCP OAuth authorization server', () => {
    let user;

    beforeEach(async () => {
        withEnv({ TUDUDI_PUBLIC_MCP_URL: BASE });
        user = await createTestUser({
            email: `remote-mcp-${Date.now()}@example.com`,
            email_verified: true,
        });
    });

    async function obtainCode({ verifier, clientId } = {}) {
        const client = clientId || (await registerClient()).body.client_id;
        const res = await request(app)
            .post('/oauth/authorize')
            .type('form')
            .send({
                ...authorizeParams(client, verifier),
                email: user.email,
                password: 'password123',
                decision: 'allow',
            });
        expect(res.status).toBe(302);
        const location = new URL(res.headers.location);
        return { client, code: location.searchParams.get('code'), location };
    }

    async function exchange(client, code, verifier, extra = {}) {
        return request(app)
            .post('/oauth/token')
            .type('form')
            .send({
                grant_type: 'authorization_code',
                code,
                redirect_uri: CALLBACK,
                client_id: client,
                code_verifier: verifier,
                ...extra,
            });
    }

    describe('discovery', () => {
        it('serves protected resource metadata for the public MCP URL', async () => {
            for (const path of [
                '/.well-known/oauth-protected-resource',
                '/.well-known/oauth-protected-resource/mcp',
            ]) {
                const res = await request(app).get(path);
                expect(res.status).toBe(200);
                expect(res.body).toEqual({
                    resource: `${BASE}/mcp`,
                    authorization_servers: [BASE],
                    scopes_supported: ['mcp'],
                    bearer_methods_supported: ['header'],
                });
            }
        });

        it('ignores Host and X-Forwarded-Host when building URLs', async () => {
            const res = await request(app)
                .get('/.well-known/oauth-authorization-server')
                .set('Host', 'evil.example')
                .set('X-Forwarded-Host', 'evil.example');
            expect(res.status).toBe(200);
            expect(JSON.stringify(res.body)).not.toContain('evil.example');
            expect(res.body).toMatchObject({
                issuer: BASE,
                authorization_endpoint: `${BASE}/oauth/authorize`,
                token_endpoint: `${BASE}/oauth/token`,
                registration_endpoint: `${BASE}/oauth/register`,
                response_types_supported: ['code'],
                grant_types_supported: ['authorization_code'],
                token_endpoint_auth_methods_supported: ['none'],
                code_challenge_methods_supported: ['S256'],
                scopes_supported: ['mcp'],
            });
            expect(
                res.body.client_id_metadata_document_supported
            ).toBeUndefined();
        });

        it('serves nothing when TUDUDI_PUBLIC_MCP_URL is unset', async () => {
            withEnv({ TUDUDI_PUBLIC_MCP_URL: undefined });
            for (const path of [
                '/.well-known/oauth-authorization-server',
                '/.well-known/oauth-protected-resource/mcp',
            ]) {
                expect((await request(app).get(path)).status).toBe(404);
            }
            expect((await registerClient()).status).toBe(404);
        });

        it('answers an anonymous POST /mcp with 401 and a resource_metadata pointer', async () => {
            const res = await request(app)
                .post('/mcp')
                .send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
            expect(res.status).toBe(401);
            expect(res.headers['www-authenticate']).toBe(
                `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`
            );
        });

        it('refuses a full-access API key or a session on the public /mcp', async () => {
            const { rawToken } = await createApiToken({
                userId: user.id,
                name: 'Full access',
            });
            const list = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
            const metadata = `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`;

            const key = await mcpCall(rawToken, list);
            expect(key.status).toBe(401);
            expect(key.headers['www-authenticate']).toBe(metadata);

            const cookie = await authenticateUser(request(app), user);
            const session = await request(app)
                .post('/mcp')
                .set('Cookie', cookie)
                .set('Accept', 'application/json, text/event-stream')
                .send(list);
            expect(session.status).toBe(401);
            expect(session.headers['www-authenticate']).toBe(metadata);

            // Tailscale clients keep using full-access keys on /api/mcp.
            const legacy = await request(app)
                .post('/api/mcp')
                .set('Authorization', `Bearer ${rawToken}`)
                .set('Accept', 'application/json, text/event-stream')
                .send(list);
            expect(legacy.status).toBe(200);
        });

        it('refuses GET /mcp with 405 instead of serving the web app', async () => {
            const res = await request(app).get('/mcp');
            expect(res.status).toBe(405);
            expect(res.headers.allow).toBe('POST');
        });
    });

    describe('client registration', () => {
        it('registers a public client for an allowed redirect URI', async () => {
            const res = await registerClient();
            expect(res.status).toBe(201);
            expect(res.body).toMatchObject({
                client_name: 'Claude',
                redirect_uris: [CALLBACK],
                grant_types: ['authorization_code'],
                response_types: ['code'],
                token_endpoint_auth_method: 'none',
            });
            expect(res.body.client_id).toMatch(/^mcp_/);
            expect(res.body.client_secret).toBeUndefined();
        });

        it('rejects a redirect URI outside the allowlist', async () => {
            const res = await registerClient({
                redirect_uris: [CALLBACK, 'https://evil.example/callback'],
            });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('invalid_redirect_uri');
        });

        it('takes the allowlist from TUDUDI_MCP_OAUTH_REDIRECT_URIS', async () => {
            withEnv({
                TUDUDI_MCP_OAUTH_REDIRECT_URIS:
                    'https://other.example/cb, https://second.example/cb',
            });
            expect((await registerClient()).status).toBe(400);
            const res = await registerClient({
                redirect_uris: ['https://second.example/cb'],
            });
            expect(res.status).toBe(201);
        });

        it('rejects a request without redirect URIs', async () => {
            const res = await registerClient({ redirect_uris: undefined });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('invalid_redirect_uri');
        });
    });

    describe('authorization endpoint', () => {
        it('shows a consent page that names the redirect host and escapes the client name', async () => {
            const client = (
                await registerClient({ client_name: '<script>x</script>' })
            ).body.client_id;
            const res = await request(app)
                .get('/oauth/authorize')
                .query(authorizeParams(client, newVerifier()));
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toMatch(/text\/html/);
            expect(res.text).toContain('claude.ai');
            expect(res.text).not.toContain('<script>x</script>');
            expect(res.text).toContain('&lt;script&gt;');
            const csp = res.headers['content-security-policy'];
            expect(csp).toContain("form-action 'self' https://claude.ai");
            expect(csp).toContain("frame-ancestors 'none'");
            expect(res.headers['cache-control']).toBe('no-store');
        });

        it('never redirects for an unknown or tampered client', async () => {
            const client = (await registerClient()).body.client_id;
            for (const clientId of ['mcp_bogus', `${client}x`]) {
                const res = await request(app)
                    .get('/oauth/authorize')
                    .query(authorizeParams(clientId, newVerifier()));
                expect(res.status).toBe(400);
                expect(res.headers.location).toBeUndefined();
            }
        });

        it('never redirects to a URI the client did not register', async () => {
            const client = (await registerClient()).body.client_id;
            const res = await request(app)
                .get('/oauth/authorize')
                .query(
                    authorizeParams(client, newVerifier(), {
                        redirect_uri:
                            'https://claude.com/api/mcp/auth_callback',
                    })
                );
            expect(res.status).toBe(400);
            expect(res.headers.location).toBeUndefined();
        });

        it('rejects a client whose redirect URI was removed from the allowlist', async () => {
            const client = (await registerClient()).body.client_id;
            withEnv({
                TUDUDI_MCP_OAUTH_REDIRECT_URIS: 'https://other.example/cb',
            });
            const res = await request(app)
                .get('/oauth/authorize')
                .query(authorizeParams(client, newVerifier()));
            expect(res.status).toBe(400);
            expect(res.headers.location).toBeUndefined();
        });

        it('redirects back with invalid_request when PKCE is missing', async () => {
            const client = (await registerClient()).body.client_id;
            const res = await request(app)
                .get('/oauth/authorize')
                .query(
                    authorizeParams(client, newVerifier(), {
                        code_challenge_method: 'plain',
                    })
                );
            expect(res.status).toBe(302);
            const location = new URL(res.headers.location);
            expect(location.origin + location.pathname).toBe(CALLBACK);
            expect(location.searchParams.get('error')).toBe('invalid_request');
            expect(location.searchParams.get('state')).toBe('state-123');
        });

        it('redirects back with invalid_target for another resource', async () => {
            const client = (await registerClient()).body.client_id;
            const res = await request(app)
                .get('/oauth/authorize')
                .query(
                    authorizeParams(client, newVerifier(), {
                        resource: 'https://elsewhere.example/mcp',
                    })
                );
            expect(res.status).toBe(302);
            expect(
                new URL(res.headers.location).searchParams.get('error')
            ).toBe('invalid_target');
        });

        it('issues no code for a wrong password', async () => {
            const client = (await registerClient()).body.client_id;
            const res = await request(app)
                .post('/oauth/authorize')
                .type('form')
                .send({
                    ...authorizeParams(client, newVerifier()),
                    email: user.email,
                    password: 'wrong-password',
                    decision: 'allow',
                });
            expect(res.status).toBe(401);
            expect(res.headers.location).toBeUndefined();
        });

        it('requires the two-factor code when two-factor sign-in is on', async () => {
            await enrollMfa(user);
            const client = (await registerClient()).body.client_id;
            const res = await request(app)
                .post('/oauth/authorize')
                .type('form')
                .send({
                    ...authorizeParams(client, newVerifier()),
                    email: user.email,
                    password: 'password123',
                    decision: 'allow',
                });
            expect(res.status).toBe(401);
            expect(res.headers.location).toBeUndefined();
        });

        it('redirects with access_denied when the owner refuses', async () => {
            const client = (await registerClient()).body.client_id;
            const res = await request(app)
                .post('/oauth/authorize')
                .type('form')
                .send({
                    ...authorizeParams(client, newVerifier()),
                    decision: 'deny',
                });
            expect(res.status).toBe(302);
            expect(
                new URL(res.headers.location).searchParams.get('error')
            ).toBe('access_denied');
        });

        it('redirects with a code, the state and the issuer after consent', async () => {
            const { location } = await obtainCode({ verifier: newVerifier() });
            expect(location.origin + location.pathname).toBe(CALLBACK);
            expect(location.searchParams.get('code')).toBeTruthy();
            expect(location.searchParams.get('state')).toBe('state-123');
            expect(location.searchParams.get('iss')).toBe(BASE);
        });
    });

    describe('token endpoint', () => {
        it('exchanges a code for an MCP-only token bound to the owner', async () => {
            const infoSpy = jest.spyOn(logger, 'info');
            const verifier = newVerifier();
            const { client, code } = await obtainCode({ verifier });

            const res = await exchange(client, code, verifier);
            expect(res.status).toBe(200);
            expect(res.headers['cache-control']).toBe('no-store');
            expect(res.body).toMatchObject({
                token_type: 'Bearer',
                scope: 'mcp',
                expires_in: 30 * 24 * 3600,
            });
            expect(res.body.refresh_token).toBeUndefined();
            const token = res.body.access_token;
            expect(token).toMatch(/^tt_/);

            const row = await ApiToken.findOne({
                where: { user_id: user.id },
            });
            expect(row.abilities).toMatchObject({ scope: 'mcp' });
            expect(row.name).toBe('Claude MCP (Claude)');

            const list = await mcpCall(token, {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
            });
            expect(list.status).toBe(200);

            const api = await request(app)
                .get('/api/tasks')
                .set('Authorization', `Bearer ${token}`);
            expect(api.status).toBe(403);

            const legacyPath = await request(app)
                .post('/api/mcp')
                .set('Authorization', `Bearer ${token}`)
                .set('Accept', 'application/json, text/event-stream')
                .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
            expect(legacyPath.status).toBe(200);

            const events = infoSpy.mock.calls.map(([fields]) => fields?.event);
            expect(events).toEqual(
                expect.arrayContaining([
                    'oauth.client_registered',
                    'oauth.authorize_granted',
                    'oauth.token_issued',
                ])
            );
            const logged = JSON.stringify(infoSpy.mock.calls);
            expect(logged).not.toContain(token);
            expect(logged).not.toContain(code);
            expect(logged).not.toContain(verifier);
        });

        it('logs the start of each MCP session', async () => {
            const verifier = newVerifier();
            const { client, code } = await obtainCode({ verifier });
            const token = (await exchange(client, code, verifier)).body
                .access_token;
            const infoSpy = jest.spyOn(logger, 'info');

            await mcpCall(token, {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-06-18',
                    capabilities: {},
                    clientInfo: { name: 'claude-ai', version: '1' },
                },
            });

            const session = infoSpy.mock.calls.find(
                ([fields]) => fields?.event === 'mcp.session_started'
            );
            expect(session).toBeDefined();
            expect(session[0]).toMatchObject({
                userId: user.id,
                client: 'claude-ai',
            });
            expect(session[1]).toBe('MCP session started');
        });

        it('rejects a wrong code verifier and spends the code', async () => {
            const verifier = newVerifier();
            const { client, code } = await obtainCode({ verifier });

            const wrong = await exchange(client, code, newVerifier());
            expect(wrong.status).toBe(400);
            expect(wrong.body.error).toBe('invalid_grant');

            const retry = await exchange(client, code, verifier);
            expect(retry.status).toBe(400);
            expect(retry.body.error).toBe('invalid_grant');
        });

        it('accepts a code only once', async () => {
            const verifier = newVerifier();
            const { client, code } = await obtainCode({ verifier });
            expect((await exchange(client, code, verifier)).status).toBe(200);
            const again = await exchange(client, code, verifier);
            expect(again.status).toBe(400);
            expect(again.body.error).toBe('invalid_grant');
        });

        it('rejects a code presented by another client', async () => {
            const verifier = newVerifier();
            const { code } = await obtainCode({ verifier });
            const other = (await registerClient()).body.client_id;
            const res = await exchange(other, code, verifier);
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('invalid_grant');
        });

        it('answers unsupported_grant_type for refresh_token', async () => {
            const res = await request(app)
                .post('/oauth/token')
                .type('form')
                .send({ grant_type: 'refresh_token', refresh_token: 'x' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('unsupported_grant_type');
        });

        it('revokes the previous token of the same client on reconnect', async () => {
            const first = newVerifier();
            const one = await obtainCode({ verifier: first });
            const oldToken = (await exchange(one.client, one.code, first)).body
                .access_token;
            const second = newVerifier();
            const two = await obtainCode({ verifier: second });
            const newToken = (await exchange(two.client, two.code, second)).body
                .access_token;

            const list = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
            expect((await mcpCall(oldToken, list)).status).toBe(401);
            expect((await mcpCall(newToken, list)).status).toBe(200);
        });

        it('stops working once the token is revoked from the profile', async () => {
            const verifier = newVerifier();
            const { client, code } = await obtainCode({ verifier });
            const token = (await exchange(client, code, verifier)).body
                .access_token;
            const row = await ApiToken.findOne({
                where: { user_id: user.id },
            });
            await revokeApiToken(row.id, user.id);

            const res = await mcpCall(token, {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
            });
            expect(res.status).toBe(401);
        });
    });
});
