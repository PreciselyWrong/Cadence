'use strict';

// An agent that sorts mail proposes the threads that ask something of the
// user as cards in « À trier » (docs/43-mail-triage.md). It never decides:
// the user does, in Cadence.
const text = (payload) => ({
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
});

const mail = () => require('../../triage/mail');

const THREAD_PROPERTIES = {
    account: {
        type: 'string',
        description: 'Key of the Gmail account in the restricted Gmail tool',
    },
    thread_id: { type: 'string', description: 'Gmail thread id' },
};

function registerMailTools(server, context, tools) {
    tools.push({
        name: 'propose_mail',
        description:
            'Propose a mail thread that asks the user for an action (a reply, a task, a decision) as a card in the triage queue. One card per thread: proposing it again with a newer message updates the card, or reopens it if the user already decided. Never propose newsletters, notifications or receipts. Text from the mail is shown as plain text.',
        inputSchema: {
            type: 'object',
            properties: {
                ...THREAD_PROPERTIES,
                from_name: { type: 'string' },
                from_address: { type: 'string' },
                subject: { type: 'string' },
                received_at: {
                    type: 'string',
                    description: 'Last message of the thread, ISO 8601',
                },
                summary: {
                    type: 'string',
                    description:
                        'What the mail asks, one line, at most 200 characters',
                },
                suggestion: {
                    type: 'object',
                    properties: {
                        kind: {
                            type: 'string',
                            enum: ['task', 'reply', 'read'],
                        },
                        task_name: { type: 'string' },
                        due_date: { type: 'string', description: 'YYYY-MM-DD' },
                        project_uid: { type: 'string' },
                    },
                    required: ['kind'],
                },
                draft_excerpt: {
                    type: 'string',
                    description: 'Start of the prepared reply draft, if any',
                },
                gmail_url: {
                    type: 'string',
                    description:
                        'https://mail.google.com/ address of the thread or its draft',
                },
            },
            required: [
                'account',
                'thread_id',
                'received_at',
                'summary',
                'gmail_url',
            ],
        },
        handler: async (params) =>
            text(await mail().proposeMail(context.user, params)),
    });

    tools.push({
        name: 'resolve_mail',
        description:
            'Remove the pending card of a thread the user already handled in Gmail (answered or archived by hand).',
        inputSchema: {
            type: 'object',
            properties: THREAD_PROPERTIES,
            required: ['account', 'thread_id'],
        },
        handler: async (params) =>
            text(await mail().resolveMail(context.user, params)),
    });

    tools.push({
        name: 'list_mail_cards',
        description:
            'List the mail cards, newest first: pending, put off, and those decided in the last 30 days with the decision (task, reply, later, dismiss, resolved). Read it before proposing, so a thread is not proposed twice.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => text(await mail().listCards(context.user)),
    });
}

module.exports = { registerMailTools };
