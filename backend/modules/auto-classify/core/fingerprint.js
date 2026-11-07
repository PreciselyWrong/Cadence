'use strict';

const crypto = require('crypto');

// The state of an item as the user sees and edits it. Taken before the model
// is asked and again just before writing: a difference means the user (or a
// device) changed it meanwhile, and nothing is written. Kept after writing:
// an undo, and the "classified automatically" mark, hold only while the item
// still has that state.
const FIELDS = {
    task: [
        'name',
        'note',
        'status',
        'project_id',
        'area_id',
        'estimated_minutes',
        'priority',
        'due_date',
    ],
    note: ['title', 'content', 'project_id'],
    link: ['url', 'title', 'note', 'status', 'project_id'],
};

function normalize(value) {
    if (value === undefined || value === null) return null;
    if (value instanceof Date) return value.toISOString();
    return value;
}

function itemFingerprint(item) {
    const fields = FIELDS[item.entity];
    if (!fields) throw new Error(`Unknown entity: ${item.entity}`);
    const state = [
        item.entity,
        ...fields.map((field) => normalize(item[field])),
        [...(item.tags || [])].sort(),
    ];
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(state))
        .digest('hex');
}

module.exports = { itemFingerprint, FIELDS };
