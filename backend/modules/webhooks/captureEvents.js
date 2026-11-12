'use strict';

const { Note, Link, Project } = require('../../models');
const { getConfig } = require('../../config/config');
const { logError } = require('../../services/logService');
const dispatcher = require('./dispatcher');

// note.created and link.created: let a receiver (an assistant that files new
// items, an automation) react to every new note and saved link, from any
// write path, as task.created does for tasks.

const appUrl = (path) =>
    `${getConfig().frontendUrl.replace(/\/+$/, '')}${path}`;

async function notePayload(note) {
    const project = note.project_id
        ? await Project.findByPk(note.project_id, { attributes: ['uid'] })
        : null;
    return {
        uid: note.uid,
        title: note.title || null,
        project_uid: project?.uid || null,
        url: appUrl(`/notes/${note.uid}`),
    };
}

// A link is a page of a project (docs/37-links.md).
async function linkPayload(link) {
    const project = link.project_id
        ? await Project.findByPk(link.project_id, { attributes: ['uid'] })
        : null;
    return {
        uid: link.uid,
        url: link.url,
        title: link.title || null,
        project_uid: project?.uid ?? null,
    };
}

const EVENTS = {
    note: {
        event: 'note.created',
        text: (note) => `New note: ${note.title || 'Untitled'}`,
        data: async (note) => ({ note: await notePayload(note) }),
    },
    link: {
        event: 'link.created',
        text: (link) => `New link: ${link.title || link.url}`,
        data: async (link) => ({ link: await linkPayload(link) }),
    },
};

async function send(kind, row) {
    const { event, text, data } = EVENTS[kind];
    try {
        await dispatcher.emit(row.user_id, event, {
            text: text(row),
            data: await data(row),
        });
    } catch (error) {
        logError(`Failed to send webhook event ${event}:`, error);
    }
}

// After commit, so a receiver never hears about a row that was rolled back.
function onCreate(kind) {
    return (row, options) => {
        if (
            options?.skipWebhooks ||
            !row?.user_id ||
            dispatcher.knownToHaveNone(row.user_id)
        ) {
            return undefined;
        }
        if (options?.transaction) {
            options.transaction.afterCommit(() => send(kind, row));
            return undefined;
        }
        return send(kind, row);
    };
}

let registered = false;

function register() {
    if (registered) return;
    registered = true;
    Note.addHook('afterCreate', 'webhooks', onCreate('note'));
    Link.addHook('afterCreate', 'webhooks', onCreate('link'));
}

module.exports = { register };
