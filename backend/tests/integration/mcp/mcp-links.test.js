'use strict';

const request = require('supertest');
const app = require('../../../app');
const { InboxItem, Link, Project } = require('../../../models');
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

    it('reads, edits and removes a page, and reports a missing one', async () => {
        const { Project } = require('../../../models');
        const project = await Project.create({ name: 'P', user_id: user.id });
        const link = await Link.findOne({ where: { kind: 'article' } });
        await link.update({ project_id: project.id });
        expect(json(await call('get_link', { uid: link.uid })).link.title).toBe(
            'A post'
        );
        const edited = json(
            await call('update_link', { uid: link.uid, note: 'à lire' })
        );
        expect(edited.link.note).toBe('à lire');
        expect((await call('get_link', { uid: 'nope' })).isError).toBe(true);
        await call('delete_link', { uid: link.uid });
        expect(await Link.findByPk(link.id)).toBeNull();
    });

    describe('project pages', () => {
        it('adds a page to a project and lists its pages', async () => {
            const { Project } = require('../../../models');
            const project = await Project.create({
                name: 'Fusée',
                user_id: user.id,
            });
            const added = json(
                await call('add_project_page', {
                    project_uid: project.uid,
                    url: 'https://example.com/engine/',
                    title: 'Engine',
                })
            );
            expect(added).toMatchObject({
                created: true,
                page: { url: 'https://example.com/engine', title: 'Engine' },
            });
            const listed = json(
                await call('list_project_pages', { project_uid: project.uid })
            );
            expect(listed.pages.map((p) => p.url)).toEqual([
                'https://example.com/engine',
            ]);
        });

        it('makes a task from an address, named by its kind', async () => {
            const { Task } = require('../../../models');
            const result = json(
                await call('create_task', {
                    url: 'https://github.com/acme/rocket',
                })
            );
            expect(result.task.name).toBe('Try: acme/rocket');
            const task = await Task.findOne({
                where: { uid: result.task.uid },
            });
            expect(task.note).toBe('https://github.com/acme/rocket');
            expect(task.needs_when).toBe(true);
            expect(task.source).toBe('link');
        });
    });

    it('leaves an idea open when the link it is said to have become is not the user’s', async () => {
        const item = await InboxItem.create({
            user_id: user.id,
            content: 'https://example.com/autre',
            status: 'added',
            source: 'mcp',
        });
        const other = await createTestUser({ email: 'mcp-other@example.com' });
        const foreign = await Link.create({
            user_id: other.id,
            url: 'https://example.com/autre',
        });

        const refused = await call('process_inbox_item', {
            uid: item.uid,
            link_uid: foreign.uid,
        });
        expect(refused.isError).toBe(true);
        await item.reload();
        expect(item.status).toBe('added');
    });
});
