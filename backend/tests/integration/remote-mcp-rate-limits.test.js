jest.mock('../../config/config', () => {
    const actual = jest.requireActual('../../config/config');
    return {
        ...actual,
        getConfig: () => {
            const config = actual.getConfig();
            return {
                ...config,
                trustProxy: 1,
                rateLimiting: {
                    ...config.rateLimiting,
                    enabled: true,
                    auth: { windowMs: 15 * 60 * 1000, max: 3 },
                    bearerFailure: { max: 3 },
                    authEmail: { windowMs: 15 * 60 * 1000, max: 2 },
                },
            };
        },
    };
});

const request = require('supertest');
const app = require('../../app');
const { Role } = require('../../models');
const {
    createTestUser,
    enrollMfa,
    authenticateUser,
} = require('../helpers/testUtils');
const { createApiToken } = require('../../modules/users/apiTokenService');
const pairing = require('../../modules/oauth/pairing');

const BASE = 'https://cadence.example.test';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

// Every test gets its own address in Anthropic's range, so the shared
// database-backed counters of one test never reach the next.
let counter = 0;
const nextIp = () => `160.79.104.${++counter}`;

const withEnv = (vars) =>
    jest.replaceProperty(process, 'env', { ...process.env, ...vars });

const mcpCall = (ip, token) => {
    const call = request(app)
        .post('/mcp')
        .set('X-Forwarded-For', ip)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream');
    if (token) call.set('Authorization', `Bearer ${token}`);
    return call.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
};

describe('Remote MCP rate limits on a shared egress range', () => {
    let user;

    beforeEach(async () => {
        withEnv({ TUDUDI_PUBLIC_MCP_URL: BASE });
        pairing.close();
        user = await createTestUser({
            email: `limits-${Date.now()}-${counter}@example.com`,
            email_verified: true,
        });
        await Role.update({ is_admin: true }, { where: { user_id: user.id } });
    });

    it('never counts or blocks the metadata documents', async () => {
        const ip = nextIp();
        for (let i = 0; i < 3; i++) {
            const res = await request(app)
                .get('/oauth/authorize')
                .set('X-Forwarded-For', ip);
            expect(res.status).toBe(400);
        }
        expect(
            (
                await request(app)
                    .get('/oauth/authorize')
                    .set('X-Forwarded-For', ip)
            ).status
        ).toBe(429);

        for (const path of [
            '/.well-known/oauth-authorization-server',
            '/.well-known/oauth-protected-resource',
            '/.well-known/oauth-protected-resource/mcp',
        ]) {
            for (let i = 0; i < 5; i++) {
                const res = await request(app)
                    .get(path)
                    .set('X-Forwarded-For', ip);
                expect(res.status).toBe(200);
            }
        }
    });

    it('limits failed token requests per client, not per address', async () => {
        const ip = nextIp();
        const tokenRequest = (clientId) =>
            request(app)
                .post('/oauth/token')
                .set('X-Forwarded-For', ip)
                .type('form')
                .send({
                    grant_type: 'authorization_code',
                    code: 'nope',
                    redirect_uri: CALLBACK,
                    client_id: clientId,
                    code_verifier: 'x'.repeat(43),
                });
        for (let i = 0; i < 3; i++) {
            expect((await tokenRequest(`mcp_a${counter}`)).status).toBe(401);
        }
        expect((await tokenRequest(`mcp_a${counter}`)).status).toBe(429);
        expect((await tokenRequest(`mcp_b${counter}`)).status).toBe(401);
    });

    it('limits failed MCP calls per token, never the unauthenticated discovery call', async () => {
        const ip = nextIp();
        for (let i = 0; i < 6; i++) {
            expect((await mcpCall(ip)).status).toBe(401);
        }

        // The limiter keys on the first 12 characters, so the test number
        // goes there to keep each test's bucket apart.
        const bad = `tt_${String(counter).padStart(9, '0')}${'f'.repeat(55)}`;
        for (let i = 0; i < 3; i++) {
            expect((await mcpCall(ip, bad)).status).toBe(401);
        }
        expect((await mcpCall(ip, bad)).status).toBe(429);

        const { rawToken } = await createApiToken({
            userId: user.id,
            name: 'Claude MCP (Claude)',
            abilities: { scope: 'mcp', oauth_client: 'mcp_x' },
        });
        expect((await mcpCall(ip, rawToken)).status).toBe(200);
    });

    it('never lets consent failures lock the owner out of web sign-in', async () => {
        for (let i = 0; i < 4; i++) {
            const res = await request(app)
                .post('/oauth/authorize')
                .set('X-Forwarded-For', nextIp())
                .type('form')
                .send({
                    client_id: 'mcp_bogus',
                    email: user.email,
                    password: 'wrong',
                    decision: 'allow',
                });
            expect(res.status).toBe(400);
        }
        const login = await request(app)
            .post('/api/login')
            .set('X-Forwarded-For', nextIp())
            .send({ email: user.email, password: 'password123' });
        expect(login.status).toBe(200);
    });

    it('lets a paired registration through after refusals from the same address', async () => {
        const ip = nextIp();
        const register = () =>
            request(app)
                .post('/oauth/register')
                .set('X-Forwarded-For', ip)
                .send({ client_name: 'Claude', redirect_uris: [CALLBACK] });
        for (let i = 0; i < 5; i++) {
            expect((await register()).status).toBe(403);
        }

        const cookie = await authenticateUser(request(app), user);
        await enrollMfa(user);
        const opened = await request(app)
            .post('/api/mcp/pairing')
            .set('X-Forwarded-For', '100.64.0.1')
            .set('Cookie', cookie);
        expect(opened.status).toBe(201);
        expect((await register()).status).toBe(201);
    });
});
