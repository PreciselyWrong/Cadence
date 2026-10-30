'use strict';

const service = require('./service');

// What a client may still do to a task or project that mirrors a TODO.md
// file. Everything else is refused: the file is the source of truth, and a
// change made here would be overwritten by the next read.

const STATUS_NAMES = { not_started: 0, in_progress: 1, done: 2 };
const TOGGLE_FIELDS = new Set(['status', 'completed_at']);

// true / false when the change is only "mark done" / "mark not done",
// null for any other change.
function doneToggle(fields) {
    const keys = Object.keys(fields || {});
    if (!keys.includes('status') || !keys.every((k) => TOGGLE_FIELDS.has(k))) {
        return null;
    }
    const raw = fields.status;
    const status = typeof raw === 'string' ? STATUS_NAMES[raw] : raw;
    if (![0, 1, 2].includes(status)) return null;
    return status === 2;
}

const READ_ONLY = {
    error: 'This comes from a TODO.md file: edit the file instead.',
    code: 'todo_md_read_only',
};

const sendError = (res, error) =>
    res.status(error.status || 500).json({
        error: error.message,
        code: error.code,
    });

// Express middleware for the task routes that write (after the access check).
// `onToggle(req, res, task, done)` answers an allowed check/uncheck.
function taskGuard(onToggle) {
    return async (req, res, next) => {
        try {
            const { Task } = require('../../models');
            const task = await Task.findOne({
                where: { uid: req.params.uid },
                attributes: ['id', 'uid', 'source_key', 'project_id'],
            });
            if (!task || !service.isFileBackedTask(task)) return next();

            const done = req.method === 'PATCH' ? doneToggle(req.body) : null;
            if (done === null) return res.status(403).json(READ_ONLY);

            try {
                await onToggle(req, res, task, done);
            } catch (error) {
                if (error instanceof service.TodoMdError) {
                    return sendError(res, error);
                }
                throw error;
            }
        } catch (error) {
            next(error);
        }
    };
}

// A file-backed project keeps its name (the folder's) and cannot be deleted
// or completed with its tasks; its area, colour, pin and tags stay editable.
async function projectGuard(req, res, next) {
    try {
        const { Project } = require('../../models');
        const project = await Project.findOne({
            where: { uid: req.params.uid },
            attributes: ['id', 'name', 'source_type'],
        });
        if (!project || !service.isFileBackedProject(project)) return next();
        const renames =
            req.method === 'PATCH' &&
            typeof req.body?.name === 'string' &&
            req.body.name !== project.name;
        if (req.method === 'PATCH' && !renames) return next();
        return res.status(403).json(READ_ONLY);
    } catch (error) {
        return next(error);
    }
}

module.exports = { doneToggle, taskGuard, projectGuard, READ_ONLY, sendError };
