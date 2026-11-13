'use strict';

// The « Point emploi » agent pushes one career proposal (docs/47-proposals.md,
// Career): offers, follow-ups and tasks it found. The user decides in Cadence.
const text = (payload) => ({
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
});

const career = () => require('../../proposals/career');

const ID = {
    type: 'string',
    pattern: '^[A-Za-z0-9_-]{1,64}$',
    description: 'Your own id for the item, letters, digits, _ or -',
};
const DAY = { type: 'string', description: 'YYYY-MM-DD' };
const HTTPS = { type: 'string', description: 'https:// address' };

const STAT = {
    type: 'object',
    properties: {
        label: { type: 'string', description: 'At most 20 characters' },
        value: { type: 'string', description: 'At most 12 characters' },
    },
    required: ['label', 'value'],
};

const FOLLOWUP = {
    type: 'object',
    properties: {
        id: ID,
        title: { type: 'string', description: 'At most 120 characters' },
        company: { type: 'string' },
        applied_at: DAY,
        note: { type: 'string', description: 'At most 140 characters' },
        draft_url: {
            ...HTTPS,
            description: 'Gmail draft, https://mail.google.com/ only',
        },
        source_url: HTTPS,
    },
    required: ['id', 'title'],
};

const OFFER = {
    type: 'object',
    properties: {
        id: ID,
        title: { type: 'string', description: 'At most 120 characters' },
        company: { type: 'string', description: 'At most 120 characters' },
        location: { type: 'string' },
        rate: { type: 'string', description: 'At most 60 characters' },
        url: HTTPS,
        expires: DAY,
        fit: {
            type: 'string',
            description: 'Why it fits the user, at most 200 characters',
        },
        source: { type: 'string', enum: ['jobseeka', 'agent'] },
    },
    required: ['id', 'title', 'company', 'url', 'fit'],
};

const TASK = {
    type: 'object',
    properties: {
        id: ID,
        name: { type: 'string', description: 'At most 200 characters' },
        note: { type: 'string' },
        due_date: DAY,
    },
    required: ['id', 'name'],
};

function registerCareerTools(server, context, tools) {
    tools.push({
        name: 'propose_career',
        description:
            'Push the career point of the day: a headline, at most four stats, follow-ups of applications waiting for an answer, offers to apply to, and tasks. Replaces the ready career proposal not yet decided. Invalid entries are dropped; an empty payload is refused. Cadence computes nothing here: send what you found.',
        inputSchema: {
            type: 'object',
            properties: {
                headline: {
                    type: 'string',
                    description: 'At most 60 characters',
                },
                subtitle: {
                    type: 'string',
                    description: 'At most 160 characters',
                },
                stats: { type: 'array', items: STAT, maxItems: 4 },
                followups: { type: 'array', items: FOLLOWUP, maxItems: 10 },
                offers: { type: 'array', items: OFFER, maxItems: 15 },
                tasks: { type: 'array', items: TASK, maxItems: 8 },
            },
            required: ['headline'],
        },
        handler: async (params) =>
            text(await career().proposeCareer(context.user, params)),
    });
}

module.exports = { registerCareerTools };
