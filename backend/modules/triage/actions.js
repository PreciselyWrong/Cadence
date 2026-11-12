'use strict';

// Carrying out what the user validated. Every action goes through the MCP
// tools, which already hold the rules of each write (rights, recurrence,
// file-backed tasks); none is reimplemented here.
const { registerAllTools } = require('../mcp/toolRegistry');
const { ForbiddenError, ValidationError } = require('../../shared/errors');
const repository = require('./repository');

const MAX_SUBTASKS = 20;
const MAX_NAME = 255;

function toolsFor(user) {
    const tools = [];
    registerAllTools(null, { userId: user.id, user }, tools);
    return async (name, params) => {
        const tool = tools.find((candidate) => candidate.name === name);
        try {
            return await tool.handler(params);
        } catch (error) {
            throw asRefusal(error);
        }
    };
}

// The tools refuse with a plain Error. Told apart from a fault, it answers 4xx:
// a client queue would otherwise send the same refused order again forever.
function asRefusal(error) {
    if (error.constructor !== Error) return error;
    return error.message === 'Access denied'
        ? new ForbiddenError(error.message)
        : new ValidationError(error.message);
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
            tags: task.tags ?? [],
        });
        await run('delete_task', { id: task.uid });
    },
    // Subtasks, addresses and tags follow (docs/37-links.md).
    to_project: async (run, task) => {
        await run('convert_task_to_project', { uid: task.uid });
    },
    to_habit: async (run, task) => {
        await run('create_habit', {
            name: task.name,
            description: task.note || '',
        });
        await run('delete_task', { id: task.uid });
    },
};

const CONVERSIONS = new Set(['to_note', 'to_project', 'to_habit']);

// What removes the task is checked before anything is written: a conversion
// that fails on the removal would leave a copy behind each time it is retried.
async function assertRemovable(task, action) {
    if (task.owned === false) {
        throw new ForbiddenError('Only the owner can remove a task');
    }
    if (task.file_backed) {
        throw new ValidationError('This task follows a TODO.md file');
    }
    if (task.recurring) {
        throw new ValidationError('A recurring task stays a series');
    }
    if (
        CONVERSIONS.has(action) &&
        action !== 'to_project' &&
        (await repository.countSubtasks(task.uid)) > 0
    ) {
        throw new ValidationError('This task has subtasks');
    }
}

async function applyAction(user, task, action, payload = {}) {
    const perform = ACTIONS[action];
    if (!perform) throw new ValidationError(`Unknown action: ${action}`);
    if (action === 'delete' || CONVERSIONS.has(action)) {
        await assertRemovable(task, action);
    }
    await perform(toolsFor(user), task, payload ?? {});
}

module.exports = { applyAction, ACTIONS, toolsFor };
