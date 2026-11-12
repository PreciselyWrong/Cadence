'use strict';

// What a TODO.md file owns for a task mirrored from it: its name, its note,
// its done / not done box (status, with the completion date that follows it)
// and its project. Every other field of the task is Cadence-only.
const FILE_OWNED_TASK_FIELDS = Object.freeze([
    'name',
    'note',
    'status',
    'completed_at',
    'project_id',
    'project_uid',
]);

const DONE = 2;

const STATUS_CODES = Object.freeze({
    not_started: 0,
    pending: 0,
    in_progress: 1,
    done: DONE,
    completed: DONE,
    archived: 3,
    waiting: 4,
    cancelled: 5,
    planned: 6,
});

// The status as a number, or null when it names none.
function statusCode(raw) {
    if (typeof raw === 'number') {
        return Number.isInteger(raw) && raw >= 0 && raw <= 6 ? raw : null;
    }
    if (typeof raw === 'string' && Object.hasOwn(STATUS_CODES, raw)) {
        return STATUS_CODES[raw];
    }
    return null;
}

const instant = (value) =>
    value === null || value === undefined || value === ''
        ? null
        : new Date(value).getTime();

// Classifies the values a request would set on a file-backed `task`.
// `project` is { id, uid } of the task's current project. Returns:
//   refused: the file-owned fields that would change (the request is refused);
//   status:  the status to write to the file's box, or null when the box does
//            not change (a status other than done is a box not checked).
// A field sent with the value it already has is not a change.
function fileOwnedChanges(task, project, values = {}) {
    const refused = [];
    const has = (key) => values[key] !== undefined;

    if (has('name') && values.name !== task.name) refused.push('name');
    if (has('note') && (values.note ?? '') !== (task.note ?? '')) {
        refused.push('note');
    }
    if (has('project_uid') && values.project_uid !== project?.uid) {
        refused.push('project_uid');
    }
    if (
        has('project_id') &&
        String(values.project_id) !== String(task.project_id) &&
        values.project_id !== project?.uid
    ) {
        refused.push('project_id');
    }

    let status = null;
    if (has('status')) {
        const code = statusCode(values.status);
        if (code === null) refused.push('status');
        else if (code !== Number(task.status)) status = code;
    }

    // completed_at follows the box: with a status change the file sets it.
    if (
        status === null &&
        has('completed_at') &&
        instant(values.completed_at) !== instant(task.completed_at)
    ) {
        refused.push('completed_at');
    }

    return { refused, status };
}

// The values without the fields a file owns.
function withoutFileOwned(values = {}) {
    return Object.fromEntries(
        Object.entries(values).filter(
            ([key]) => !FILE_OWNED_TASK_FIELDS.includes(key)
        )
    );
}

module.exports = {
    FILE_OWNED_TASK_FIELDS,
    DONE,
    statusCode,
    fileOwnedChanges,
    withoutFileOwned,
};
