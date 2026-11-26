'use strict';

const { User, Task } = require('../../models');
const { ValidationError } = require('../../shared/errors');
const { logError } = require('../../services/logService');
const { parseEstimatedMinutes } = require('../tasks/core/parsers');
const { createSubtasks } = require('../tasks/operations/subtasks');
const { serializeTask } = require('../tasks/core/serializers');
const model = require('./model');
const { normalizeSteps, NAME_MAX } = require('./core/steps');
const {
    resolveSettings,
    serverDefaults,
    sanitizeUserSettings,
} = require('./settings');

// Steps one request may create, whatever max_steps says: a client edits the
// proposal, it does not bulk-load tasks through it.
const APPLY_MAX = 50;

async function uiSettingsOf(userId) {
    const user = await User.findByPk(userId, {
        attributes: ['id', 'ui_settings'],
    });
    const value = user?.ui_settings;
    if (typeof value !== 'string') return value || {};
    try {
        return JSON.parse(value) || {};
    } catch {
        return {};
    }
}

async function getSettings(user) {
    return {
        settings: resolveSettings(await uiSettingsOf(user.id)),
        defaults: serverDefaults(),
        ai_configured: await model.isConfigured(user.id),
    };
}

async function updateSettings(user, body) {
    const clean = sanitizeUserSettings(body);
    if (!clean) throw new ValidationError('Invalid breakdown settings');
    const ui = await uiSettingsOf(user.id);
    const previous =
        ui.breakdown && typeof ui.breakdown === 'object' ? ui.breakdown : {};
    await User.update(
        { ui_settings: { ...ui, breakdown: { ...previous, ...clean } } },
        { where: { id: user.id } }
    );
    return getSettings(user);
}

// Steps are only created under a top-level task.
async function topLevelTask(uid) {
    const task = await Task.findOne({ where: { uid } });
    if (task.parent_task_id) {
        throw new ValidationError('A subtask cannot be split into steps');
    }
    return task;
}

const result = (source, reason, steps = []) => ({
    source,
    reason,
    steps,
    total_minutes: steps.reduce((sum, step) => sum + step.minutes, 0),
});

// The proposal shown in « Découper en étapes ». Nothing is written. Without
// a usable answer the client offers to write a first small step by hand.
async function propose(user, uid) {
    const task = await topLevelTask(uid);
    const settings = resolveSettings(await uiSettingsOf(user.id));
    if (!settings.enabled) return result('fallback', 'disabled');
    if (!(await model.isConfigured(user.id))) {
        return result('fallback', 'not_configured');
    }
    const subtasks = (
        await Task.findAll({
            where: { parent_task_id: task.id },
            attributes: ['name'],
            order: [['order', 'ASC']],
        })
    ).map((subtask) => subtask.name);

    let raw;
    try {
        raw = await model.askSteps(
            user.id,
            { name: task.name, note: task.note || '', subtasks },
            settings
        );
    } catch (error) {
        logError({ error, taskUid: uid }, 'Task breakdown failed');
        return result('fallback', 'failed');
    }
    const steps = normalizeSteps(raw, { settings, existing: subtasks });
    return steps.length > 0
        ? result('ai', null, steps)
        : result('fallback', 'empty');
}

// The steps the user kept, as subtasks in their order, after the existing
// ones. Each step is checked again: the client may have edited it.
function readSteps(input) {
    if (!Array.isArray(input) || input.length === 0) {
        throw new ValidationError('steps must list at least one step');
    }
    if (input.length > APPLY_MAX) {
        throw new ValidationError(`At most ${APPLY_MAX} steps at once`);
    }
    return input.map((step) => {
        const name =
            typeof step?.name === 'string'
                ? step.name.replace(/\s+/g, ' ').trim()
                : '';
        if (!name || name.length > NAME_MAX) {
            throw new ValidationError(
                `Each step needs a name of 1 to ${NAME_MAX} characters`
            );
        }
        const minutes =
            step.minutes === undefined || step.minutes === null
                ? null
                : parseEstimatedMinutes(step.minutes);
        return { name, estimated_minutes: minutes };
    });
}

async function apply(user, uid, body) {
    const steps = readSteps(body?.steps);
    const task = await topLevelTask(uid);
    const created = await createSubtasks(task.id, steps, user.id, {
        withEstimates: true,
    });
    return {
        subtasks: await Promise.all(
            created.map((subtask) => serializeTask(subtask, user.timezone))
        ),
    };
}

module.exports = { getSettings, updateSettings, propose, apply };
