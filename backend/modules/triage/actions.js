'use strict';

// Carrying out what the user validated. Every action goes through the MCP
// tools, which already hold the rules of each write (rights, recurrence,
// file-backed tasks); none is reimplemented here.
const { registerAllTools } = require('../mcp/toolRegistry');
const { ValidationError } = require('../../shared/errors');

const MAX_SUBTASKS = 20;
const MAX_NAME = 255;

function toolsFor(user) {
    const tools = [];
    registerAllTools(null, { userId: user.id, user }, tools);
    return (name, params) => {
        const tool = tools.find((candidate) => candidate.name === name);
        return tool.handler(params);
    };
}

const text = (value, field) => {
    const clean = typeof value === 'string' ? value.trim() : '';
    if (!clean || clean.length > MAX_NAME) {
        throw new ValidationError(`${field} is required`);
    }
    return clean;
};

// A conversion creates the new thing first: if it fails, the task is intact.
const ACTIONS = {
    rename: (run, task, payload) =>
        run('update_task', { id: task.uid, name: text(payload.name, 'name') }),
    set_due: (run, task, payload) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.due_date ?? '')) {
            throw new ValidationError('due_date must be YYYY-MM-DD');
        }
        return run('update_task', { id: task.uid, due_date: payload.due_date });
    },
    done: (run, task) => run('complete_task', { id: task.uid }),
    cancel: (run, task) =>
        run('update_task', { id: task.uid, status: 'cancelled' }),
    delete: (run, task) => run('delete_task', { id: task.uid }),
    split: async (run, task, payload) => {
        const names = Array.isArray(payload.subtasks) ? payload.subtasks : [];
        if (names.length === 0 || names.length > MAX_SUBTASKS) {
            throw new ValidationError(
                `subtasks must hold 1 to ${MAX_SUBTASKS} names`
            );
        }
        const clean = names.map((name) => text(name, 'subtask'));
        for (const name of clean) {
            await run('add_subtask', { parent_id: task.uid, name });
        }
    },
    reclass: (run, task, payload) => {
        const update = { id: task.uid };
        if (payload.project_id !== undefined) {
            update.project_id = payload.project_id;
        }
        if (payload.area_uid !== undefined) update.area_uid = payload.area_uid;
        if (payload.tags !== undefined) {
            if (!Array.isArray(payload.tags)) {
                throw new ValidationError('tags must be a list');
            }
            update.tags = payload.tags;
        }
        if (Object.keys(update).length === 1) {
            throw new ValidationError('nothing to reclass');
        }
        return run('update_task', update);
    },
    to_note: async (run, task) => {
        await run('create_note', {
            title: task.name,
            content: task.note || task.name,
        });
        await run('delete_task', { id: task.uid });
    },
    to_project: async (run, task) => {
        await run('create_project', {
            name: task.name,
            description: task.note || '',
        });
        await run('delete_task', { id: task.uid });
    },
    to_habit: async (run, task) => {
        await run('create_habit', { name: task.name });
        await run('delete_task', { id: task.uid });
    },
};

async function applyAction(user, task, action, payload = {}) {
    const perform = ACTIONS[action];
    if (!perform) throw new ValidationError(`Unknown action: ${action}`);
    await perform(toolsFor(user), task, payload ?? {});
}

module.exports = { applyAction, ACTIONS };
