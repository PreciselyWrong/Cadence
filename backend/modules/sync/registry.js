'use strict';

// The single list of what syncs. Adding an entity means adding an entry
// here (and a field_clocks column on its table); the protocol, journal and
// merge stay as they are. `serverFields` are sent to clients but written only
// by the server: a push that names one is rejected. `refs` are exposed to clients by uid, never by
// the numeric id. `lists` are many-to-many sets, exposed as arrays of uids
// and merged as a whole.
// 2: the Cadence habit entities were added (additive; a client ignores an
// entity it does not know).
// 3: goals (objectives, key results, bucket list) were added, with a
// `goal_uid` reference on tasks and projects and `next_task_uid` on projects.
const SCHEMA_VERSION = 3;

const { normalizeIcon } = require('../../utils/icon-validation');

// Rejects a bad icon from a client; the stored value is the normalized id.
async function checkIcon(values) {
    if (!('icon' in values)) return null;
    try {
        values.icon = normalizeIcon(values.icon);
        return null;
    } catch {
        return 'invalid_icon';
    }
}

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
            'in_view_at',
            'week_of',
            'month_of',
            'needs_when',
            'review_on',
            'reviewed_at',
            'estimated_minutes',
            'recurrence_type',
            'recurrence_interval',
            'recurrence_end_date',
            'recurrence_weekday',
            'recurrence_weekdays',
            'recurrence_month_day',
            'recurrence_week_of_month',
            'recurrence_exdates',
            'completion_based',
            'order',
            'today_order',
            'completed_at',
            'source',
            'source_url',
        ],
        // Set when the server (or any device) has already notified the
        // reminder; a device must not ring one that was sent after it.
        // The key of a task mirrored from a TODO.md bullet: only its check box
        // can change on a device.
        serverFields: ['reminder_sent_at', 'source_key'],
        refs: {
            project_uid: { column: 'project_id', entity: 'project' },
            area_uid: { column: 'area_id', entity: 'area' },
            parent_task_uid: { column: 'parent_task_id', entity: 'task' },
            goal_uid: { column: 'goal_id', entity: 'goal' },
        },
        lists: {
            tag_uids: {
                through: 'tasks_tags',
                key: 'task_id',
                otherKey: 'tag_id',
                entity: 'tag',
            },
        },
        // A reminder moved on a device fires again at its new time, as a
        // web edit does (applyReminderAt).
        prepareValues: (row, values) => {
            if (!('reminder_at' in values)) return;
            const before = row?.reminder_at ? row.reminder_at.getTime() : null;
            const after = values.reminder_at
                ? new Date(values.reminder_at).getTime()
                : null;
            if (before !== after) values.reminder_sent_at = null;
        },
        // A due date changed on the user's device counts for the review.
        afterApply: async ({ row, previous, values, clocks, userId }) => {
            if (!previous || !('due_date' in values)) return;
            const { logDeviceDueChange } = require('../tasks/utils/logging');
            await logDeviceDueChange(
                row,
                previous.due_date,
                userId,
                clocks.due_date
            );
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
        // Same cleanup as the web: its tasks, notes and sub-projects go too.
        destroy: async (row) => {
            const projectsRepository = require('../projects/repository');
            await projectsRepository.deleteWithOrphaning(row, row.user_id);
        },
        validate: async (row, values) => {
            const invalidIcon = await checkIcon(values);
            if (invalidIcon) return invalidIcon;
            if (!row || !values.parent_project_id) return null;
            const { assertNoCycle } = require('../projects/hierarchy');
            try {
                await assertNoCycle(row.id, values.parent_project_id);
                return null;
            } catch {
                return 'invalid_hierarchy';
            }
        },
        version: 1,
        fields: [
            'name',
            'description',
            'status',
            'priority',
            'color',
            'icon',
            'pin_to_sidebar',
            'due_date_at',
            'start_date_at',
            'start_has_time',
            'task_show_completed',
            'task_sort_order',
            'is_maintenance',
            'next_task_uid',
            'completed_at',
        ],
        // 'todo_md' for a project that follows a TODO.md file; the banner is
        // uploaded on the web, devices only show it.
        serverFields: ['source_type', 'image_url'],
        refs: {
            area_uid: { column: 'area_id', entity: 'area' },
            goal_uid: { column: 'goal_id', entity: 'goal' },
            parent_project_uid: {
                column: 'parent_project_id',
                entity: 'project',
            },
        },
        lists: {
            tag_uids: {
                through: 'projects_tags',
                key: 'project_id',
                otherKey: 'tag_id',
                entity: 'tag',
            },
        },
    },
    // Objectives, their key results (a goal with a parent) and the bucket
    // list (a goal with a bucket). Tasks and projects point at them through
    // `goal_uid`.
    goal: {
        model: 'Goal',
        destroy: async (row) => {
            const { destroyWithDependents } = require('../goals/hierarchy');
            await destroyWithDependents(row);
        },
        validate: async (row, values, userId) => {
            if (!('parent_goal_id' in values) && !('bucket' in values)) {
                return null;
            }
            const { problemWith } = require('../goals/hierarchy');
            return problemWith({
                goal: row,
                parentId: values.parent_goal_id,
                bucket: values.bucket,
                userId,
            });
        },
        version: 1,
        fields: [
            'title',
            'why',
            'horizon',
            'target_date',
            'status',
            'color',
            'bucket',
        ],
        refs: {
            area_uid: { column: 'area_id', entity: 'area' },
            parent_goal_uid: { column: 'parent_goal_id', entity: 'goal' },
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
        // Tags nest at any depth, but a tag cannot be its own parent or move
        // under one of its descendants. A tag name is a path, so a descendant
        // is a tag whose name starts with the row's name and a "/".
        validate: async (row, values) => {
            const invalidIcon = await checkIcon(values);
            if (invalidIcon) return invalidIcon;
            if (!values.parent_id) return null;
            const { Tag } = require('../../models');
            if (row && values.parent_id === row.id) return 'invalid_hierarchy';
            const parent = await Tag.findByPk(values.parent_id);
            if (!parent) return 'invalid_hierarchy';
            if (row && parent.name.startsWith(`${row.name}/`)) {
                return 'invalid_hierarchy';
            }
            return null;
        },
        version: 1,
        fields: ['name', 'color', 'icon', 'pinned'],
        refs: {
            parent_uid: { column: 'parent_id', entity: 'tag' },
        },
    },
    note: {
        model: 'Note',
        // Attachment files leave the disk with the row.
        destroy: async (row) => {
            const {
                noteAttachments,
            } = require('../../services/entityAttachments');
            await noteAttachments.removeAll(row.id);
            await row.destroy();
        },
        version: 1,
        fields: ['title', 'content', 'color', 'background', 'pin_to_sidebar'],
        refs: {
            project_uid: { column: 'project_id', entity: 'project' },
        },
        lists: {
            tag_uids: {
                through: 'notes_tags',
                key: 'note_id',
                otherKey: 'tag_id',
                entity: 'tag',
            },
        },
    },
    inbox_item: {
        model: 'InboxItem',
        version: 1,
        fields: ['content', 'title', 'status', 'source'],
        refs: {},
    },
    // A project's pages (docs/37-links.md): a device adds one to a project
    // (address and project required), renames it, notes it or removes it.
    // A new address of an existing page goes through PATCH /links/:uid,
    // which reads the new page.
    link: {
        model: 'Link',
        destroy: (row) => require('../links/repository').remove(row),
        validate: async (row, values) => {
            const { normalizeUrl } = require('../links/core/urls');
            if (!row) {
                if (!values.project_id) return 'project_required';
                if (!normalizeUrl(values.url ?? '')) return 'invalid_url';
            } else if (
                'url' in values &&
                normalizeUrl(values.url ?? '') !== row.url
            ) {
                return 'url_readonly';
            }
            const { normalizeLinkStatus } = require('../links/core/constants');
            if (normalizeLinkStatus(values).invalid) return 'invalid_status';
            const { isDay } = require('../links/core/reviewDate');
            if (
                'review_at' in values &&
                values.review_at !== null &&
                !isDay(values.review_at)
            ) {
                return 'invalid_review_at';
            }
            return null;
        },
        // A former status is read as new, and a parked one gets its review day.
        prepareValues: (row, values) => {
            const { normalizeLinkStatus } = require('../links/core/constants');
            const {
                normalizeUrl,
                classifyKind,
            } = require('../links/core/urls');
            Object.assign(values, normalizeLinkStatus(values).fields);
            if (row) {
                delete values.url;
            } else {
                values.url = normalizeUrl(values.url);
                values.kind = classifyKind(values.url);
            }
        },
        // A page added by a device is read like any new page.
        afterApply: async ({ row, previous }) => {
            if (!previous && row.fetch_status === 'pending') {
                require('../links/jobs').enqueueFetch(row.id);
            }
        },
        version: 1,
        fields: ['url', 'title', 'note', 'status', 'review_at'],
        serverFields: [
            'description',
            'image_url',
            'site_name',
            'kind',
            'github_stars',
            'github_language',
            'github_last_commit',
            'readme_excerpt',
            'source_type',
            'source_uid',
            'fetch_status',
            'fetched_at',
        ],
        refs: {
            project_uid: { column: 'project_id', entity: 'project' },
        },
        lists: {
            tag_uids: {
                through: 'links_tags',
                key: 'link_id',
                otherKey: 'tag_id',
                entity: 'tag',
            },
        },
    },
};

// Cadence habits and everything stored around them (docs/21-habits.md).
Object.assign(
    ENTITIES,
    require('../habits/cadence/syncEntities').syncEntities()
);

const byModel = new Map(
    Object.entries(ENTITIES).map(([name, def]) => [def.model, name])
);

module.exports = {
    SCHEMA_VERSION,
    ENTITIES,
    entityForModel: (modelName) => byModel.get(modelName) ?? null,
    listsOf: (entity) => ENTITIES[entity].lists || {},
    serverFieldsOf: (entity) => ENTITIES[entity].serverFields || [],
};
