'use strict';

const links = require('../../links/service');
const {
    LINK_STATUSES,
    LINK_KINDS,
    LINK_SOURCES,
} = require('../../links/core/constants');
const { decodeTagsInput } = require('./tagResolver');

const text = (payload) => ({
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
});

// Links are found by the server in inbox items, tasks and notes, with their
// page metadata. An assistant reads them and proposes: it may write the title,
// the project, the note, the tags and the status, never the metadata.
function registerLinkTools(server, context, tools) {
    tools.push({
        name: 'list_links',
        description:
            'List saved links (found in inbox items, tasks and notes) with their page title, description, kind, GitHub stats, note, status and tags. Newest first. Use untagged=true to find links still to tag.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    description: `Comma-separated statuses: ${LINK_STATUSES.join(', ')}`,
                },
                kind: {
                    type: 'string',
                    description: `Comma-separated kinds: ${LINK_KINDS.join(', ')}`,
                },
                tag: { type: 'string', description: 'Exact tag name' },
                untagged: {
                    type: 'boolean',
                    description: 'Only links without any tag',
                },
                domain: {
                    type: 'string',
                    description: 'Domain without www., e.g. github.com',
                },
                query: {
                    type: 'string',
                    description:
                        'Text searched in title, description, url, note and README excerpt',
                },
                source_type: { type: 'string', enum: LINK_SOURCES },
                sort: { type: 'string', enum: ['newest', 'oldest'] },
                limit: {
                    type: 'number',
                    description: 'Maximum links (default 100, max 1000)',
                },
                offset: { type: 'number' },
            },
        },
        handler: async (params = {}) => {
            const { query, limit, ...rest } = params;
            const result = await links.list(context.userId, {
                ...rest,
                q: query,
                limit: limit ?? 100,
            });
            return text({
                count: result.links.length,
                total: result.total,
                links: result.links,
            });
        },
    });

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
        name: 'create_link',
        description:
            'Save a web page as a link. The same page twice is one link. The server reads its title, description and picture.',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'http(s) address' },
                title: { type: 'string' },
                note: { type: 'string' },
                status: { type: 'string', enum: LINK_STATUSES },
                tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['url'],
        },
        handler: async (params) =>
            text(
                await links.create(context.userId, {
                    ...params,
                    tags: 'tags' in params ? decodeTagsInput(params.tags) : [],
                })
            ),
    });

    tools.push({
        name: 'group_links',
        description:
            'Put related links in one theme by adding the same tag to each, keeping their other tags.',
        inputSchema: {
            type: 'object',
            properties: {
                uids: { type: 'array', items: { type: 'string' } },
                theme: {
                    type: 'string',
                    description:
                        'Tag name; nested tags as paths like "dev/tools"',
                },
            },
            required: ['uids', 'theme'],
        },
        handler: async (params) => {
            const grouped = [];
            for (const uid of params.uids) {
                const link = await links.get(context.userId, uid);
                const names = link.tags.map((tag) => tag.name);
                grouped.push(
                    await links.update(context.userId, uid, {
                        tags: [...new Set([...names, params.theme])],
                    })
                );
            }
            return text({ links: grouped });
        },
    });

    tools.push({
        name: 'propose_link_slot',
        description:
            'Propose a slot in the agenda for related links, for example several tools to try on one subject. It only waits in the triage queue: the user accepts or refuses it. Nothing is planned until then.',
        inputSchema: {
            type: 'object',
            properties: {
                link_uids: { type: 'array', items: { type: 'string' } },
                title: { type: 'string', description: 'What the slot is for' },
                reason: {
                    type: 'string',
                    description: 'Why, in one short sentence',
                },
                date: { type: 'string', description: 'YYYY-MM-DD' },
                start_minute: {
                    type: 'integer',
                    description: 'Minutes after midnight; omit for no set time',
                },
                duration_minutes: { type: 'integer' },
            },
            required: ['link_uids', 'title', 'reason', 'date'],
        },
        handler: async (params) =>
            text(
                await require('../../triage/slots').proposeSlot(
                    context.user,
                    params
                )
            ),
    });

    tools.push({
        name: 'update_link',
        description:
            'Update the title, address, project, note, tags, status or review day of a saved link. tags replaces the whole set (tag names; nested tags as paths like "dev/tools"). Only the fields given change.',
        inputSchema: {
            type: 'object',
            properties: {
                uid: { type: 'string', description: 'Link UID' },
                title: {
                    type: ['string', 'null'],
                    description: 'Title kept over the page title',
                },
                url: {
                    type: 'string',
                    description:
                        'New address; the page is read again. Refused if another link has it',
                },
                project_uid: {
                    type: ['string', 'null'],
                    description: 'Project of the link; null takes it out',
                },
                note: {
                    type: ['string', 'null'],
                    description:
                        'Free text shown under the link; null or "" clears it',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tag names; [] removes all tags',
                },
                status: {
                    type: 'string',
                    enum: LINK_STATUSES,
                    description:
                        'new (to read), to_evaluate, tested (to try), kept, parked (later), dropped (archived)',
                },
                review_at: {
                    type: ['string', 'null'],
                    description:
                        'Day to look at the link again (YYYY-MM-DD, or null). A parked link gets today + 30 days when none is given',
                },
            },
            required: ['uid'],
        },
        handler: async (params) => {
            const body = {};
            for (const field of ['title', 'url', 'project_uid']) {
                if (field in params) body[field] = params[field];
            }
            if ('note' in params) body.note = params.note;
            if ('status' in params) body.status = params.status;
            if ('review_at' in params) body.review_at = params.review_at;
            if ('tags' in params) body.tags = decodeTagsInput(params.tags);
            const link = await links.update(context.userId, params.uid, body);
            return text({ link });
        },
    });

    tools.push({
        name: 'delete_link',
        description:
            'Permanently delete a saved link. Its address is no longer captured from tasks and notes. Only do this when the user asks: to set a link aside, use update_link with status dropped.',
        inputSchema: {
            type: 'object',
            properties: {
                uid: { type: 'string', description: 'Link UID' },
            },
            required: ['uid'],
        },
        handler: async (params) =>
            text(await links.remove(context.userId, params.uid)),
    });
}

module.exports = { registerLinkTools };
