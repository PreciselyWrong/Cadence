'use strict';

// Agent decision cards over MCP (docs/49-agent-decisions.md).
const text = (payload) => ({
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
});

const decisions = () => require('../../decisions/service');

function registerDecisionTools(server, context, tools) {
    tools.push({
        name: 'propose_decisions',
        description:
            'Propose 1 to 30 decision cards of a given kind for the user to settle in Cadence. One card per (kind, key): proposing an existing pending or later card updates it; a card in reviewing (answered with a note) is replaced and reopened; a decided card is left alone (already_decided). Each item is validated on its own; invalid items are returned in errors and skipped.',
        inputSchema: {
            type: 'object',
            properties: {
                kind: {
                    type: 'string',
                    description:
                        '^[a-z][a-z0-9_]{0,31}$ (e.g. subscription, docker_update, family, finance, memory)',
                },
                kind_label: {
                    type: 'string',
                    description: 'Group label, 1 to 40 characters',
                },
                items: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 30,
                    items: {
                        type: 'object',
                        properties: {
                            key: { type: 'string' },
                            title: { type: 'string' },
                            context: { type: 'string' },
                            body: { type: 'string' },
                            url: {
                                type: 'string',
                                description: 'https:// URL only',
                            },
                            choices: {
                                type: 'array',
                                minItems: 2,
                                maxItems: 5,
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        label: { type: 'string' },
                                        tone: {
                                            type: 'string',
                                            enum: ['primary', 'danger'],
                                        },
                                    },
                                    required: ['id', 'label'],
                                },
                            },
                            recommended: { type: 'string' },
                            reason: { type: 'string' },
                            data: { type: 'object' },
                        },
                        required: ['key', 'title', 'choices'],
                    },
                },
            },
            required: ['kind', 'kind_label', 'items'],
        },
        handler: async (params) =>
            text(await decisions().proposeDecisions(context.user, params)),
    });

    tools.push({
        name: 'list_decisions',
        description:
            'List decision cards (pending, later, reviewing, and those decided in the last 30 days) with all fields including data, status, decision, note, later_until, decided_at and result.',
        inputSchema: {
            type: 'object',
            properties: {
                kind: { type: 'string' },
                status: {
                    type: 'string',
                    enum: ['pending', 'later', 'reviewing', 'done'],
                },
            },
        },
        handler: async (params) =>
            text(await decisions().listDecisions(context.user, params || {})),
    });

    tools.push({
        name: 'report_decision',
        description:
            'Record the deterministic follow-up result of a decided card: ok true (with optional https:// url) or ok false (with optional error code ^[a-z_]{1,40}$).',
        inputSchema: {
            type: 'object',
            properties: {
                kind: { type: 'string' },
                key: { type: 'string' },
                ok: { type: 'boolean' },
                error: { type: 'string' },
                url: { type: 'string' },
            },
            required: ['kind', 'key', 'ok'],
        },
        handler: async (params) =>
            text(await decisions().reportDecision(context.user, params)),
    });
}

module.exports = { registerDecisionTools };
