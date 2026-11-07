'use strict';

// Which items the classifier may touch, and which of their fields are still
// empty (docs/41-auto-classify.md). Pure functions over plain item shapes
// built by the worker (`../items.js`).

// Task.STATUS: done, archived, cancelled.
const CLOSED_TASK_STATUSES = new Set([2, 3, 5]);
const CLOSED_PROJECT_STATUSES = new Set(['done', 'cancelled', 'archived']);

const isBlank = (value) =>
    value === null || value === undefined || String(value).trim() === '';

// A project the classifier must leave alone, and every item inside it.
function isProjectOffLimits(project) {
    if (!project) return false;
    return project.file_backed || CLOSED_PROJECT_STATUSES.has(project.status);
}

function taskSlots(task) {
    if (CLOSED_TASK_STATUSES.has(task.status)) return null;
    if (task.recurring || task.habit_mode || task.parent_task_id) return null;
    if (task.source_key) return null;
    if (isProjectOffLimits(task.project)) return null;
    return {
        project: !task.project_id && !task.area_id,
        tags: (task.tags || []).length === 0,
        duration: task.estimated_minutes == null,
        // 0 is both the default and "low": only a raise is ever proposed.
        priority: !task.priority,
        summary: false,
    };
}

function noteSlots(note) {
    if (isProjectOffLimits(note.project)) return null;
    return {
        project: !note.project_id,
        tags: (note.tags || []).length === 0,
        duration: false,
        priority: false,
        summary: false,
    };
}

function linkSlots(link) {
    if (link.status === 'dropped') return null;
    if (isProjectOffLimits(link.project)) return null;
    return {
        project: false,
        tags: (link.tags || []).length === 0,
        duration: false,
        priority: false,
        summary: isBlank(link.note),
    };
}

const SLOTS = { task: taskSlots, note: noteSlots, link: linkSlots };

// The empty fields of an item the classifier may fill, or null when the item
// is off limits or has nothing left to fill.
function slotsOf(item) {
    const read = SLOTS[item.entity];
    if (!read) return null;
    const slots = read(item);
    if (!slots) return null;
    return Object.values(slots).some(Boolean) ? slots : null;
}

module.exports = {
    slotsOf,
    isProjectOffLimits,
    CLOSED_TASK_STATUSES,
    CLOSED_PROJECT_STATUSES,
};
