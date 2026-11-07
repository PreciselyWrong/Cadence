'use strict';

const request = require('supertest');
const app = require('../../../app');
const { Link } = require('../../../models');
const { createTestUser } = require('../../helpers/testUtils');
const {
    createApiToken: createApiTokenFromService,
} = require('../../../modules/users/apiTokenService');

function parseSse(text) {
    for (const line of text.split('\n')) {
        if (line.startsWith('data: ')) return JSON.parse(line.slice(6));
    }
    return null;
}

describe('MCP link tools', () => {
    let token;
    let user;

    const call = async (name, args) => {
        const res = await request(app)
            .post('/api/mcp')
            .set('Authorization', `Bearer ${token}`)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json, text/event-stream')
            .send({
                jsonrpc: '2.0',
                method: 'tools/call',
                params: { name, arguments: args },
                id: 1,
            });
        return parseSse(res.text).result;
    };
    const json = (result) => JSON.parse(result.content[0].text);

    beforeEach(async () => {
        user = await createTestUser({ email: 'mcp-links@example.com' });
        token = (
            await createApiTokenFromService({
                userId: user.id,
                name: 'MCP links test',
                expiresAt: null,
            })
        ).rawToken;
        await Link.bulkCreate([
            {
                user_id: user.id,
                url: 'https://github.com/a/b',
                kind: 'repo',
                title: 'a/b',
            },
            {
                user_id: user.id,
                url: 'https://example.com/post',
                kind: 'article',
                title: 'A post',
            },
        ]);
    });

    it('lists untagged links, then tags one, and filters by tag', async () => {
        const untagged = json(await call('list_links', { untagged: true }));
        expect(untagged.total).toBe(2);
        const repo = untagged.links.find((l) => l.kind === 'repo');

        const updated = json(
            await call('update_link', {
                uid: repo.uid,
                tags: '["dev/cli","rust"]',
                note: 'JSON CLI',
                status: 'kept',
            })
        );
        expect(updated.link.tags.map((t) => t.name)).toEqual([
            'dev/cli',
            'rust',
        ]);
        expect(updated.link.note).toBe('JSON CLI');
        expect(updated.link.status).toBe('new');

        const byTag = json(await call('list_links', { tag: 'rust' }));
        expect(byTag.links.map((l) => l.uid)).toEqual([repo.uid]);
        const rest = json(await call('list_links', { untagged: true }));
        expect(rest.links.map((l) => l.kind)).toEqual(['article']);
        const found = json(await call('list_links', { query: 'post' }));
        expect(found.total).toBe(1);
    });

    it('gets one link and reports a bad status or a missing link', async () => {
        const [link] = json(
            await call('list_links', { kind: 'article' })
        ).links;
        expect(json(await call('get_link', { uid: link.uid })).link.title).toBe(
            'A post'
        );

        const dropped = json(
            await call('update_link', { uid: link.uid, status: 'dropped' })
        );
        expect(dropped.link.status).toBe('dropped');

        const bad = await call('update_link', { uid: link.uid, status: 'x' });
        expect(bad.isError).toBe(true);
        const missing = await call('get_link', { uid: 'nope' });
        expect(missing.isError).toBe(true);
    });
});
