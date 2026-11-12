'use strict';

// Where a task came from (badge + link). Set by MCP, inherited when an inbox
// item becomes a task, validated on every write, and carried by sync and
// backups.
const request = require('supertest');
const app = require('../../app');
const { Task, InboxItem } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const registry = require('../../modules/sync/registry');
const {
    createApiToken: createApiTokenFromService,
} = require('../../modules/users/apiTokenService');

// The MCP transport answers with an SSE event: `data: {json-rpc}`.
function parseSseResponse(text) {
    const line = text.split('\n').find((l) => l.startsWith('data: '));
    return JSON.parse(line.slice(6));
}

describe('task source', () => {
    let user;
    let agent;

    beforeEach(async () => {
        user = await createTestUser({
            email: `source_${Date.now()}@test.com`,
        });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });
    });

    const newTask = (name, extra = {}) =>
        Task.create({ user_id: user.id, name, status: 0, ...extra });

    const callMcp = async (toolName, args) => {
        const { rawToken } = await createApiTokenFromService({
            userId: user.id,
            name: 'Source test',
            expiresAt: null,
        });
        const response = await request(app)
            .post('/api/mcp')
            .set('Authorization', `Bearer ${rawToken}`)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json, text/event-stream')
            .send({
                jsonrpc: '2.0',
                method: 'tools/call',
                params: { name: toolName, arguments: args },
                id: 1,
            });
        const rpc = parseSseResponse(response.text);
        const result = rpc.result;
        const raw = result.content[0].text;
        let content = null;
        try {
            content = JSON.parse(raw);
        } catch {
            content = null;
        }
        return { isError: result.isError === true, content, raw };
    };

    describe('MCP', () => {
        it('marks a task created through MCP as mcp by default', async () => {
            const res = await callMcp('create_task', { name: 'Depuis Claude' });
            expect(res.isError).toBe(false);
            expect(res.content.task.source).toBe('mcp');
            expect(res.content.task.source_url).toBeNull();
        });

        it('takes a gmail source and its message link on create', async () => {
            const res = await callMcp('create_task', {
                name: 'Répondre à Marie',
                source: 'gmail',
                source_url: 'https://mail.google.com/mail/u/0/#inbox/abc',
            });
            expect(res.isError).toBe(false);
            expect(res.content.task.source).toBe('gmail');
            expect(res.content.task.source_url).toBe(
                'https://mail.google.com/mail/u/0/#inbox/abc'
            );
        });

        it('refuses an unknown source or a non-web link', async () => {
            const badSource = await callMcp('create_task', {
                name: 'X',
                source: 'facebook',
            });
            expect(badSource.isError).toBe(true);
            expect(badSource.raw).toMatch(/source must be one of/);

            const badUrl = await callMcp('create_task', {
                name: 'Y',
                source_url: 'javascript:alert(1)',
            });
            expect(badUrl.isError).toBe(true);
            expect(badUrl.raw).toMatch(/source_url must be an http/);
        });

        it('sets and clears the source on update_task', async () => {
            const task = await newTask('Mise à jour');
            let res = await callMcp('update_task', {
                id: task.uid,
                source: 'gmail',
                source_url: 'https://mail.google.com/mail/u/0/#inbox/z',
            });
            expect(res.isError).toBe(false);
            await task.reload();
            expect(task.source).toBe('gmail');

            res = await callMcp('update_task', {
                id: task.uid,
                source: null,
                source_url: null,
            });
            expect(res.isError).toBe(false);
            await task.reload();
            expect(task.source).toBeNull();
            expect(task.source_url).toBeNull();
        });
    });

    describe('REST', () => {
        it('leaves a plain web task without a source', async () => {
            const res = await agent
                .post('/api/task')
                .send({ name: 'Créée sur le web' });
            expect(res.status).toBe(201);
            expect(res.body.source).toBeNull();
        });

        it('refuses an invalid source on PATCH with a 400 and writes nothing', async () => {
            const task = await newTask('Intacte', { source: 'telegram' });
            const res = await agent
                .patch(`/api/task/${task.uid}`)
                .send({ source: 'spam' });
            expect(res.status).toBe(400);
            await task.reload();
            expect(task.source).toBe('telegram');
        });

        it('refuses a javascript: source_url on PATCH', async () => {
            const task = await newTask('Lien');
            const res = await agent
                .patch(`/api/task/${task.uid}`)
                .send({ source_url: 'javascript:alert(1)' });
            expect(res.status).toBe(400);
        });

        it('keeps the source when a later PATCH does not mention it', async () => {
            const task = await newTask('Garde', {
                source: 'gmail',
                source_url: 'https://mail.google.com/mail/u/0/#inbox/k',
            });
            const res = await agent
                .patch(`/api/task/${task.uid}`)
                .send({ name: 'Garde (renommée)' });
            expect(res.status).toBe(200);
            expect(res.body.source).toBe('gmail');
            expect(res.body.source_url).toBe(
                'https://mail.google.com/mail/u/0/#inbox/k'
            );
        });
    });

    describe('inbox to task', () => {
        it('copies the item origin when the item becomes a task', async () => {
            const item = await InboxItem.create({
                content: 'Acheter du café',
                status: 'added',
                source: 'desktop',
                user_id: user.id,
            });
            const task = await newTask('Acheter du café');

            const res = await agent
                .patch(`/api/inbox/${item.uid}/process`)
                .send({ task_uid: task.uid });
            expect(res.status).toBe(200);
            await task.reload();
            expect(task.source).toBe('desktop');
            expect(task.source_url).toBeNull();
        });

        it('copies the link when the item is a bare web address', async () => {
            const item = await InboxItem.create({
                content: 'https://example.com/article',
                status: 'added',
                source: 'telegram',
                user_id: user.id,
            });
            const task = await newTask('Article');

            await agent
                .patch(`/api/inbox/${item.uid}/process`)
                .send({ task_uid: task.uid });
            await task.reload();
            expect(task.source).toBe('telegram');
            expect(task.source_url).toBe('https://example.com/article');
        });

        it('does not copy a free-text origin such as manual', async () => {
            const item = await InboxItem.create({
                content: 'Une idée',
                status: 'added',
                source: 'manual',
                user_id: user.id,
            });
            const task = await newTask('Une idée');

            await agent
                .patch(`/api/inbox/${item.uid}/process`)
                .send({ task_uid: task.uid });
            await task.reload();
            expect(task.source).toBeNull();
        });

        it('keeps the origin a task already has', async () => {
            const item = await InboxItem.create({
                content: 'Doublon',
                status: 'added',
                source: 'desktop',
                user_id: user.id,
            });
            const task = await newTask('Déjà marquée', { source: 'gmail' });

            await agent
                .patch(`/api/inbox/${item.uid}/process`)
                .send({ task_uid: task.uid });
            await task.reload();
            expect(task.source).toBe('gmail');
        });
    });

    describe('sync and backup', () => {
        it('carries the source fields in the task sync entity', async () => {
            expect(registry.ENTITIES.task.fields).toEqual(
                expect.arrayContaining(['source', 'source_url'])
            );

            const task = await newTask('Synchro', {
                source: 'gmail',
                source_url: 'https://mail.google.com/mail/u/0/#inbox/s',
            });
            const snap = await agent.get('/api/v1/sync/snapshot?entity=task');
            const row = (snap.body.rows || []).find((r) => r.uid === task.uid);
            expect(row.source).toBe('gmail');
            expect(row.source_url).toBe(
                'https://mail.google.com/mail/u/0/#inbox/s'
            );
        });
    });
});
