'use strict';

const { Op } = require('sequelize');

// A project's next action is one of its own open tasks, picked by the user
// (projects.next_task_uid). The pick never outlives its meaning: it is
// cleared as soon as the task is closed, deleted or leaves the project, on
// every write path (REST, sync, MCP, imports) because it runs as a model hook.

// Done, archived, cancelled.
const CLOSED_STATUSES = [2, 3, 5];

const isClosed = (status) => CLOSED_STATUSES.includes(status);

async function clearStale(Project, task, options, { gone = false } = {}) {
    const projects = await Project.findAll({
        where: { next_task_uid: task.uid },
        transaction: options.transaction,
    });
    for (const project of projects) {
        const stale =
            gone || isClosed(task.status) || task.project_id !== project.id;
        if (!stale) continue;
        await project.update(
            { next_task_uid: null },
            { transaction: options.transaction }
        );
    }
}

// Suggested shows one task per project that has a designated next action:
// that one. Projects without a pick keep every candidate.
async function keepDesignated(tasks) {
    const { Project } = require('../../models');
    const projectIds = [...new Set(tasks.map((t) => t.project_id))].filter(
        Boolean
    );
    if (projectIds.length === 0) return tasks;
    const picked = await Project.findAll({
        where: { id: projectIds, next_task_uid: { [Op.ne]: null } },
        attributes: ['id', 'next_task_uid'],
        raw: true,
    });
    const pickByProject = new Map(picked.map((p) => [p.id, p.next_task_uid]));
    return tasks.filter(
        (task) =>
            !pickByProject.has(task.project_id) ||
            pickByProject.get(task.project_id) === task.uid
    );
}

function install({ Task, Project }) {
    Task.addHook('afterUpdate', (task, options) =>
        clearStale(Project, task, options)
    );
    Task.addHook('afterDestroy', (task, options) =>
        clearStale(Project, task, options, { gone: true })
    );
}

// The reason `task` cannot be the project's next action, or null. `task` cannot be the project's next action.
function problemWith(task, project) {
    if (!task || task.project_id !== project.id) {
        return 'The next action must be a task of this project.';
    }
    if (isClosed(task.status)) return 'The next action must be an open task.';
    return null;
}

module.exports = { install, problemWith, keepDesignated, CLOSED_STATUSES };
