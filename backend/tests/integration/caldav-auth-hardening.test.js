const request = require('supertest');
const app = require('../../app');
const { User } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const { createApiToken } = require('../../modules/users/apiTokenService');

const basic = (email, password) =>
    `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`;

describe('CalDAV Basic auth hardening', () => {
    it('rejects a passwordless (SSO) account with 401, not 500', async () => {
        const sso = await User.create({
            email: `caldav_sso_${Date.now()}@example.com`,
            password_digest: null,
        });

        const res = await request(app)
            .propfind(`/caldav/${sso.email}/`)
            .set('Authorization', basic(sso.email, 'anything'))
            .set('Content-Type', 'application/xml')
            .send('<?xml version="1.0"?><D:propfind xmlns:D="DAV:"/>');

        expect(res.status).toBe(401);
    });

    it('matches the username case-insensitively', async () => {
        const user = await createTestUser({
            email: `caldav_case_${Date.now()}@example.com`,
        });

        const res = await request(app)
            .options(`/caldav/${user.email}/`)
            .set(
                'Authorization',
                basic(user.email.toUpperCase(), 'password123')
            );

        expect([200, 204]).toContain(res.status);
    });

    // Tokens issued to a remote MCP connector (docs/38-remote-mcp.md) only
    // open the MCP endpoint, so CalDAV must refuse them both ways.
    it('refuses an MCP-only token as Bearer and as the Basic password', async () => {
        const user = await createTestUser({
            email: `caldav_mcp_${Date.now()}@example.com`,
        });
        const { rawToken } = await createApiToken({
            userId: user.id,
            name: 'Claude MCP (Claude)',
            abilities: { scope: 'mcp' },
        });
        const propfind = (authorization) =>
            request(app)
                .propfind(`/caldav/${user.email}/`)
                .set('Authorization', authorization)
                .set('Content-Type', 'application/xml')
                .send('<?xml version="1.0"?><D:propfind xmlns:D="DAV:"/>');

        expect((await propfind(`Bearer ${rawToken}`)).status).toBe(401);
        expect((await propfind(basic(user.email, rawToken))).status).toBe(401);
    });
});
