'use strict';

const crypto = require('crypto');

// The state of a task as far as triage cares. A decision holds until one of
// these changes: changing a task is what puts it back in the queue.
function taskFingerprint(task) {
    const state = [
        task.name,
        task.note ?? '',
        task.due_date ?? '',
        task.status,
        task.project_name ?? '',
        [...(task.tags || [])].sort().join(','),
        task.recurring ? '1' : '0',
    ].join('\u0000');
    return crypto.createHash('sha256').update(state).digest('hex');
}

module.exports = { taskFingerprint };
