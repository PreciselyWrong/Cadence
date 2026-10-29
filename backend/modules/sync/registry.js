'use strict';

// The single list of what syncs. Adding an entity means adding an entry
// here (and a field_clocks column on its table); the protocol, journal and
// merge stay as they are. `refs` are exposed to clients by uid, never by
// the numeric id.
const SCHEMA_VERSION = 1;

const ENTITIES = {
    task: {
        model: 'Task',
        version: 1,
        fields: [
            'name',
            'note',
            'status',
            'priority',
            'due_date',
            'due_has_time',
            'defer_until',
            'start_date',
            'start_has_time',
            'reminder_at',
            'pinned_at',
            'estimated_minutes',
            'recurrence_type',
            'recurrence_interval',
            'recurrence_end_date',
            'recurrence_weekday',
            'recurrence_weekdays',
            'recurrence_month_day',
            'recurrence_week_of_month',
            'completion_based',
            'order',
            'completed_at',
        ],
        refs: {
            project_uid: { column: 'project_id', entity: 'project' },
            area_uid: { column: 'area_id', entity: 'area' },
            parent_task_uid: { column: 'parent_task_id', entity: 'task' },
        },
        // Removes events, tags, relations and attachments with the row.
        destroy: async (row) => {
            const { TaskAttachment } = require('../../models');
            const { destroyTaskRows } = require('../tasks/operations/deletion');
            row.Attachments = await TaskAttachment.findAll({
                where: { task_id: row.id },
            });
            await destroyTaskRows(row);
        },
    },
    project: {
        model: 'Project',
        version: 1,
        fields: [
            'name',
            'description',
            'status',
            'priority',
            'color',
            'pin_to_sidebar',
            'due_date_at',
            'start_date_at',
            'start_has_time',
            'task_show_completed',
            'task_sort_order',
            'is_maintenance',
            'completed_at',
        ],
        refs: {
            area_uid: { column: 'area_id', entity: 'area' },
            parent_project_uid: {
                column: 'parent_project_id',
                entity: 'project',
            },
        },
    },
    area: {
        model: 'Area',
        version: 1,
        fields: ['name', 'description', 'color'],
        refs: {},
    },
    tag: {
        model: 'Tag',
        version: 1,
        fields: ['name', 'color', 'pinned'],
        refs: {
            parent_uid: { column: 'parent_id', entity: 'tag' },
        },
    },
    note: {
        model: 'Note',
        version: 1,
        fields: ['title', 'content', 'color', 'background', 'pin_to_sidebar'],
        refs: {
            project_uid: { column: 'project_id', entity: 'project' },
        },
    },
    inbox_item: {
        model: 'InboxItem',
        version: 1,
        fields: ['content', 'title', 'status', 'source'],
        refs: {},
    },
};

const byModel = new Map(
    Object.entries(ENTITIES).map(([name, def]) => [def.model, name])
);

module.exports = {
    SCHEMA_VERSION,
    ENTITIES,
    entityForModel: (modelName) => byModel.get(modelName) ?? null,
};
