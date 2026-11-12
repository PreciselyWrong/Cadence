'use strict';

const service = require('./service');
const policy = require('./policy');
const { runWithOp } = require('../sync/context');

const rejected = (reason) => ({ status: 'rejected', reason });
const models = () => require('../../models');

const plainFields = (fields) =>
    Object.fromEntries(
        Object.entries(fields || {}).map(([key, entry]) => [key, entry?.value])
    );

// Sync pushes that touch TODO.md-backed rows. Returns the op's result when
// it is handled here, `{ continueWith: op }` when the merge still has to apply
// the op's Cadence-side fields, or null when the op is none of this module's
// business.
//   - a task created with the code tag in a file-backed project is written
//     to the file (without it, the task stays in Cadence);
//   - a mirrored task's box is written to the file, and its Cadence-side
//     fields are merged as usual;
//   - a change to any other file-owned field, or any delete, is refused.
async function intercept(userId, op, row) {
    const { Project, Tag } = models();

    if (op.entity === 'project') {
        if (!service.isFileBackedProject(row)) return null;
        if (op.action === 'delete') return rejected('read_only');
        const renames =
            service.isGitProject(row) && op.fields && 'name' in op.fields;
        return renames ? rejected('read_only') : null;
    }
    if (op.entity !== 'task') return null;

    if (row) {
        if (!service.isFileBackedTask(row)) return null;
        if (op.action !== 'upsert') return rejected('read_only');
        const project = await Project.findByPk(row.project_id);
        const values = plainFields(op.fields);
        const changes = policy.fileOwnedChanges(row, project, values);
        if (changes.refused.length > 0) return rejected('read_only');
        try {
            if (changes.status !== null) {
                await service.setTaskDone(
                    row,
                    project,
                    changes.status === policy.DONE
                );
            }
        } catch (error) {
            if (error instanceof service.TodoMdError) {
                return rejected(error.code);
            }
            throw error;
        }
        const rest = policy.withoutFileOwned(op.fields);
        if (Object.keys(rest).length === 0) return { status: 'applied' };
        return { continueWith: { ...op, fields: rest } };
    }

    if (op.action !== 'upsert') return null;
    const projectUid = op.fields?.project_uid?.value;
    if (typeof projectUid !== 'string') return null;
    const project = await Project.findOne({
        where: { uid: projectUid, user_id: userId },
    });
    if (!service.isFileBackedProject(project)) return null;

    const values = plainFields(op.fields);
    const codeTag = await Tag.findOne({
        where: { user_id: userId, name: service.CODE_TAG },
        attributes: ['uid'],
    });
    if (!codeTag || !values.tag_uids?.includes(codeTag.uid)) return null;
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
