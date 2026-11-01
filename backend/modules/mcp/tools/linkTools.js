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
// page metadata. An assistant reads them and proposes: it may write the
// note, the tags and the status, never the url or the metadata.
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
        name: 'update_link',
        description:
            'Update the note, tags or status of a saved link. tags replaces the whole set (tag names; nested tags as paths like "dev/tools"). Only the fields given change.',
        inputSchema: {
            type: 'object',
            properties: {
                uid: { type: 'string', description: 'Link UID' },
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
                        'new, kept (keep), tested (tried), parked (later), dropped',
                },
            },
            required: ['uid'],
        },
        handler: async (params) => {
            const body = {};
            if ('note' in params) body.note = params.note;
            if ('status' in params) body.status = params.status;
            if ('tags' in params) body.tags = decodeTagsInput(params.tags);
            const link = await links.update(context.userId, params.uid, body);
            return text({ link });
        },
    });
}

module.exports = { registerLinkTools };
