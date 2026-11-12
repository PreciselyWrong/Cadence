'use strict';

const links = require('../../links/service');

const text = (payload) => ({
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
});

// A link lives in a task or in a project's pages (docs/37-links.md). An
// assistant reads and edits pages; it never writes their metadata.
function registerLinkTools(server, context, tools) {
    tools.push({
        name: 'get_link',
        description: 'Get one saved link by its UID',
        inputSchema: {
            type: 'object',
            properties: { uid: { type: 'string', description: 'Link UID' } },
            required: ['uid'],
        },
        handler: async (params) => {
            try {
                return text({
                    link: await links.get(context.userId, params.uid),
                });
            } catch {
                throw new Error(`Link not found: ${params.uid}`);
            }
        },
    });

    tools.push({
        name: 'add_project_page',
        description:
            "Add a web page to a project's pages (material for the project). The same address twice in a project is one page. The server reads its title, picture and GitHub stats.",
        inputSchema: {
            type: 'object',
            properties: {
                project_uid: { type: 'string' },
                url: { type: 'string', description: 'http(s) address' },
                title: { type: 'string' },
                note: { type: 'string', description: 'Short note' },
            },
            required: ['project_uid', 'url'],
        },
        handler: async (params) =>
            text(
                (
                    await links.addPages(context.user, params.project_uid, {
                        url: params.url,
                        title: params.title,
                        note: params.note,
                    })
                ).body
            ),
    });

    tools.push({
        name: 'list_project_pages',
        description:
            "The pages of a project: address, title, site, the user's note and what the page says about itself.",
        inputSchema: {
            type: 'object',
            properties: { project_uid: { type: 'string' } },
            required: ['project_uid'],
        },
        handler: async (params) =>
            text(await links.listPages(context.user, params.project_uid)),
    });

    tools.push({
        name: 'update_link',
        description:
            'Update a project page: its title, address (the page is read again), project or short note. Only the fields given change.',
        inputSchema: {
            type: 'object',
            properties: {
                uid: { type: 'string', description: 'Page (link) UID' },
                title: {
                    type: ['string', 'null'],
                    description: 'Title kept over the page title',
                },
                url: {
                    type: 'string',
                    description:
                        'New address; refused if the project already has it',
                },
                project_uid: {
                    type: 'string',
                    description: 'Move the page to another project',
                },
                note: {
                    type: ['string', 'null'],
                    description: 'Short note; null or "" clears it',
                },
            },
            required: ['uid'],
        },
        handler: async (params) => {
            const body = {};
            for (const field of ['title', 'url', 'project_uid', 'note']) {
                if (field in params) body[field] = params[field];
            }
            const link = await links.update(context.userId, params.uid, body);
            return text({ link });
        },
    });

    tools.push({
        name: 'delete_link',
        description:
            'Remove a page from its project, for good. Only when the user asks.',
        inputSchema: {
            type: 'object',
            properties: {
                uid: { type: 'string', description: 'Page (link) UID' },
            },
            required: ['uid'],
        },
        handler: async (params) =>
            text(await links.remove(context.userId, params.uid)),
    });
}

module.exports = { registerLinkTools };
