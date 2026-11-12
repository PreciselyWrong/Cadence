'use strict';

const service = require('./service');
const policy = require('./policy');

// A task mirrored from a TODO.md file keeps its name, its note, its done box
// and its project in the file (policy.js). Its other fields are Cadence-side
// and editable everywhere. The file-owned ones are refused: the next read
// would overwrite them.

const READ_ONLY = {
    error: 'This comes from a TODO.md file: edit the file instead.',
    code: 'todo_md_read_only',
};

const sendError = (res, error) =>
    res.status(error.status || 500).json({
        error: error.message,
        code: error.code,
    });

async function loadFileTask(uid) {
    const { Task, Project } = require('../../models');
    const task = await Task.findOne({
        where: { uid },
        attributes: [
            'id',
            'uid',
            'name',
            'note',
            'status',
            'completed_at',
            'source_key',
            'project_id',
        ],
    });
    if (!task || !service.isFileBackedTask(task)) return null;
    const project = await Project.findByPk(task.project_id);
    return { task, project };
}

// Guards a route that sets `valuesOf(req)` on a file-backed task.
// `box` says whether the request may change the done box: when it does, the
// box is written to the file before the route runs, and the file-owned fields
// are dropped from `req.body` (`withBody` gives the body to keep).
function fileTaskGuard({ valuesOf, box, withBody }) {
    return async (req, res, next) => {
        try {
            const found = await loadFileTask(req.params.uid);
            if (!found) return next();
            const { task, project } = found;

            const values = valuesOf(req);
            if (values === null) return res.status(403).json(READ_ONLY);
            const changes = policy.fileOwnedChanges(task, project, values);
            if (
                changes.refused.length > 0 ||
                (changes.status !== null && !box)
            ) {
                return res.status(403).json(READ_ONLY);
            }

            if (changes.status !== null) {
                await service.setTaskDone(
                    task,
                    project,
                    changes.status === policy.DONE
                );
            }
            withBody(req, policy.withoutFileOwned(values));
            return next();
        } catch (error) {
            if (error instanceof service.TodoMdError) {
                return sendError(res, error);
            }
            return next(error);
        }
    };
}

// PATCH /task/:uid: the box is written to the file, the rest is applied.
const patchTaskGuard = fileTaskGuard({
    valuesOf: (req) => req.body || {},
    box: true,
    withBody: (req, rest) => {
        req.body = rest;
    },
});

// Edit of one occurrence: its changes go through the same rules; the box is
// not written from here.
const occurrenceEditGuard = fileTaskGuard({
    valuesOf: (req) => req.body?.changes || {},
    box: false,
    withBody: (req, rest) => {
        req.body = { ...req.body, changes: rest };
    },
});

// Deleting is refused: a line removed from the file deletes its task, and a
// delete in Cadence would be undone by the next read.
const refuseFileTask = fileTaskGuard({
    valuesOf: () => null,
    box: false,
    withBody: () => {},
});

// A file-backed project cannot be deleted or completed with its tasks: unlink
// it first. Only a repository project keeps its name (the slug's).
async function projectGuard(req, res, next) {
    try {
        const { Project } = require('../../models');
        const project = await Project.findOne({
            where: { uid: req.params.uid },
            attributes: ['id', 'name', 'source_type', 'source_path'],
        });
        if (!project || !service.isFileBackedProject(project)) return next();
        const renames =
            req.method === 'PATCH' &&
            typeof req.body?.name === 'string' &&
            req.body.name !== project.name;
        if (
            req.method === 'PATCH' &&
            !(renames && service.isGitProject(project))
        ) {
            return next();
        }
        return res.status(403).json(READ_ONLY);
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    patchTaskGuard,
    occurrenceEditGuard,
    refuseFileTask,
    projectGuard,
    READ_ONLY,
    sendError,
};
