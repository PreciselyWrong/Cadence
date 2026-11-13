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
            'Propose a mail thread that asks the user for an action (a reply, a task, a decision) as a card in the triage queue. One card per thread: proposing it again with a newer message updates the card, or reopens it if the user already decided; a card the user answered with a note is replaced by the new proposal. Never propose newsletters, notifications or receipts. Text from the mail is shown as plain text. Give options (2 to 5 decisions, in display order) and recommended (one of them) to choose what the user can do; draft (body, required with the draft option) is the reply Cadence asks you to create in Gmail; excerpt is the start of the mail, as plain text.',
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
                            enum: ['task', 'reply', 'read', 'event'],
                        },
                        task_name: { type: 'string' },
                        event: {
                            type: 'object',
                            description:
                                'kind event only: the appointment the mail sets. start is YYYY-MM-DD (all day) or ISO 8601 with offset; end of the same kind, after start.',
                            properties: {
                                title: { type: 'string' },
                                start: { type: 'string' },
                                end: { type: 'string' },
                                location: { type: 'string' },
                            },
                            required: ['start'],
                        },
                        due_date: { type: 'string', description: 'YYYY-MM-DD' },
                        project_uid: { type: 'string' },
                    },
                    required: ['kind'],
                },
                draft_excerpt: {
                    type: 'string',
                    description: 'Start of the prepared reply draft, if any',
                },
                options: {
                    type: 'array',
                    minItems: 2,
                    maxItems: 5,
                    description:
                        'Decisions offered on the card, in display order: draft (create a Gmail draft from draft.body), task, event, later, archive (archive the thread in Gmail), dismiss',
                    items: {
                        type: 'string',
                        enum: [
                            'draft',
                            'task',
                            'event',
                            'later',
                            'archive',
                            'dismiss',
                        ],
                    },
                },
                recommended: {
                    type: 'string',
                    description:
                        'The option the card highlights, one of options',
                },
                draft: {
                    type: 'object',
                    description:
                        'The reply to create as a Gmail draft; required with the draft option',
                    properties: {
                        body: { type: 'string', maxLength: 4000 },
                    },
                    required: ['body'],
                },
                excerpt: {
                    type: 'string',
                    maxLength: 1500,
                    description:
                        'Start of the mail, plain text, so the user reads it without leaving Cadence',
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
            'List the mail cards, newest first: pending, put off, waiting for you after a note (reviewing, with the user note), and those decided in the last 30 days with the decision (task, reply, event, later, dismiss, draft, archive, resolved). Read it before proposing, so a thread is not proposed twice. A card decided as event with event.state requested waits for you to create the calendar event, then call report_mail_event. A card with action requested (draft: create the Gmail draft from draft.body; archive: archive the thread) waits for report_mail_action. action_error is the code of the last failed action.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => text(await mail().listCards(context.user)),
    });

    tools.push({
        name: 'report_mail_event',
        description:
            'After the user accepted an appointment on a mail card (decision event), say whether you created the calendar event: state created with its Google Calendar url, or failed with a short reason.',
        inputSchema: {
            type: 'object',
            properties: {
                ...THREAD_PROPERTIES,
                state: { type: 'string', enum: ['created', 'failed'] },
                url: {
                    type: 'string',
                    description:
                        'https://calendar.google.com/ link of the event',
                },
                error: {
                    type: 'string',
                    description: 'Why it failed, at most 200 characters',
                },
            },
            required: ['account', 'thread_id', 'state'],
        },
        handler: async (params) =>
            text(await mail().reportEvent(context.user, params)),
    });

    tools.push({
        name: 'report_mail_action',
        description:
            'After a card asked for a Gmail action (action.type draft or archive, state requested), say what came of it: ok true (draft with its mail.google.com draft link, optional) or ok false with a short error code (the card is reopened for the user). Report once per action.',
        inputSchema: {
            type: 'object',
            properties: {
                ...THREAD_PROPERTIES,
                type: { type: 'string', enum: ['draft', 'archive'] },
                ok: { type: 'boolean' },
                draft_url: {
                    type: 'string',
                    description:
                        'https://mail.google.com/ link of the draft (draft only, ok true)',
                },
                error: {
                    type: 'string',
                    description:
                        'Short code of the failure, lowercase with underscores (ok false), e.g. gmail_unavailable',
                },
            },
            required: ['account', 'thread_id', 'type', 'ok'],
        },
        handler: async (params) =>
            text(await mail().reportAction(context.user, params)),
    });
}

module.exports = { registerMailTools };
