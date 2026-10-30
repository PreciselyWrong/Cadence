'use strict';

const service = require('./service');
const { doneToggle } = require('./guards');
const { runWithOp } = require('../sync/context');

const rejected = (reason) => ({ status: 'rejected', reason });
const models = () => require('../../models');

const plainFields = (fields) =>
    Object.fromEntries(
        Object.entries(fields || {}).map(([key, entry]) => [key, entry?.value])
    );

// Sync pushes that touch TODO.md-backed rows. Returns the op's result when
// it is handled here, or null when the op is none of this module's business.
//   - a task created in a file-backed project is written to the file;
//   - checking or unchecking a mirrored task is written to the file;
//   - any other edit or delete of a mirrored task or project is refused.
async function intercept(userId, op, row) {
    const { Task, Project } = models();

    if (op.entity === 'project') {
        if (!service.isFileBackedProject(row)) return null;
        if (op.action === 'delete') return rejected('read_only');
        return op.fields && 'name' in op.fields ? rejected('read_only') : null;
    }
    if (op.entity !== 'task') return null;

    if (row) {
        if (!service.isFileBackedTask(row)) return null;
        if (op.action !== 'upsert') return rejected('read_only');
        const done = doneToggle(plainFields(op.fields));
        if (done === null) return rejected('read_only');
        const project = await Project.findByPk(row.project_id);
        try {
            await service.setTaskDone(row, project, done);
            return { status: 'applied' };
        } catch (error) {
            if (error instanceof service.TodoMdError) {
                return rejected(error.code);
            }
            throw error;
        }
    }

    if (op.action !== 'upsert') return null;
    const projectUid = op.fields?.project_uid?.value;
    if (typeof projectUid !== 'string') return null;
    const project = await Project.findOne({
        where: { uid: projectUid, user_id: userId },
    });
    if (!service.isFileBackedProject(project)) return null;

    const values = plainFields(op.fields);
    if (typeof values.name !== 'string' || values.name.trim() === '') {
        return rejected('invalid_value');
    }
    try {
        // Not tied to the op, so the device pulls the row the file produced
        // (section tag, normalised name) instead of skipping it as its own.
        await runWithOp(null, () =>
            service.createTask(project, {
                name: values.name,
                note: typeof values.note === 'string' ? values.note : '',
                uid: op.uid,
            })
        );
        return { status: 'applied' };
    } catch (error) {
        if (error instanceof service.TodoMdError) {
            return rejected(error.code);
        }
        throw error;
    }
}

module.exports = { intercept };
