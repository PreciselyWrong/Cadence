'use strict';

// Positions fit a 32-bit int on every client (Android Int) and engine.
const MAX_POSITION = 2147483647;

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
            'assigned_to',
            'section_position',
        ],
        validate: async (row, values, userId) => {
            if (
                'section_position' in values &&
                values.section_position !== null &&
                !(
                    Number.isInteger(values.section_position) &&
                    values.section_position >= 0 &&
                    values.section_position <= MAX_POSITION
                )
            ) {
                return 'invalid_value';
            }
            if ('section_id' in values && values.section_id !== null) {
                const { ProjectSection } = require('../../models');
                const finalProjectId =
                    'project_id' in values
                        ? values.project_id
                        : (row?.project_id ?? null);
                const section = await ProjectSection.findByPk(
                    values.section_id,
                    { attributes: ['id', 'project_id'] }
                );
                if (
                    !section ||
                    !finalProjectId ||
                    section.project_id !== finalProjectId
                ) {
                    return 'invalid_reference:section_uid';
                }
            }
            if (!('assigned_to' in values)) return null;
            if (values.assigned_to === null || values.assigned_to === '') {
                values.assigned_to = null;
                return null;
            }
            if (typeof values.assigned_to !== 'string') {
                return 'invalid_assignee';
            }
            const { validateAssignee } = require('../tasks/utils/validation');
            try {
                values.assigned_to = await validateAssignee(
                    values.assigned_to,
                    userId,
                    {
                        projectId:
                            'project_id' in values
                                ? values.project_id
                                : (row?.project_id ?? null),
                        currentAssignedTo: row?.assigned_to ?? null,
                    }
                );
                return null;
            } catch {
                return 'invalid_assignee';
            }
        },
        // Set when the server (or any device) has already notified the
        // reminder; a device must not ring one that was sent after it.
        // The key of a task mirrored from a TODO.md bullet and its place in
        // the file: only its check box can change on a device.
        serverFields: [
            'reminder_sent_at',
            'source_key',
            'source_section',
            'source_position',
        ],
        refs: {
            project_uid: { column: 'project_id', entity: 'project' },
            area_uid: { column: 'area_id', entity: 'area' },
            parent_task_uid: { column: 'parent_task_id', entity: 'task' },
            goal_uid: { column: 'goal_id', entity: 'goal' },
            section_uid: { column: 'section_id', entity: 'project_section' },
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
        // web edit does (applyReminderAt). Moving a task to another project
        // clears its section as REST does.
        prepareValues: (row, values) => {
            if (
                row &&
                'project_id' in values &&
                (values.project_id ?? null) !== (row.project_id ?? null) &&
                !('section_id' in values) &&
                row.section_id
            ) {
                values.section_id = null;
                values.section_position = null;
            }
            if (!('reminder_at' in values)) return;
            const before = row?.reminder_at ? row.reminder_at.getTime() : null;
            const after = values.reminder_at
                ? new Date(values.reminder_at).getTime()
                : null;
            if (before !== after) values.reminder_sent_at = null;
        },
        // The task's history shows what the device did; a due date changed
        // on the device also counts for the review.
        afterApply: async ({ row, previous, values, clocks, userId }) => {
            const {
                logDeviceDueChange,
                logDeviceChanges,
            } = require('../tasks/utils/logging');
            await logDeviceChanges(row, previous, userId, values, clocks);
            if (!previous || !('due_date' in values)) return;
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
        serverFields: ['source_type', 'image_url', 'handoff_state'],
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
            return null;
        },
        // A page has no status nor review day any more: what a former client
        // still sends is accepted and dropped, so its pushes are not refused.
        prepareValues: (row, values) => {
            const {
                normalizeUrl,
                classifyKind,
            } = require('../links/core/urls');
            delete values.status;
            delete values.review_at;
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
    comment: {
        model: 'Comment',
        version: 1,
        fields: ['body', 'mentioned_person_uids'],
        serverFields: ['deleted_at'],
        refs: {
            task_uid: { column: 'task_id', entity: 'task', accessible: true },
            parent_comment_uid: {
                column: 'parent_comment_id',
                entity: 'comment',
                anyUser: true,
            },
        },
        destroy: async (row) => {
            if (row.deleted_at) return;
            await row.update({
                body: '',
                mentioned_person_uids: [],
                deleted_at: new Date(),
            });
        },
        authorize: async (userId, row, transaction) => {
            const { Task } = require('../../models');
            const permissionsService = require('../../services/permissionsService');
            const task = await Task.findByPk(row.task_id, {
                attributes: ['uid'],
                transaction,
            });
            if (!task) return false;
            const access = await permissionsService.getAccess(
                userId,
                'task',
                task.uid
            );
            return access !== permissionsService.ACCESS.NONE;
        },
        refuseUpsert: (row, fields) =>
            row.deleted_at && fields && 'body' in fields ? 'deleted' : null,
        validate: async (row, values) => {
            if (!row && !values.task_id) return 'task_required';
            if (row && 'task_id' in values && values.task_id !== row.task_id) {
                return 'invalid_value';
            }
            if (row && row.deleted_at && 'body' in values) {
                return 'deleted';
            }
            if ('body' in values) {
                if (typeof values.body !== 'string') return 'invalid_value';
                const trimmed = values.body.trim();
                if (!trimmed || trimmed.length > 10000) return 'invalid_value';
                values.body = trimmed;
            } else if (!row) {
                return 'invalid_value';
            }
            if ('mentioned_person_uids' in values) {
                if (
                    !Array.isArray(values.mentioned_person_uids) ||
                    !values.mentioned_person_uids.every(
                        (v) => typeof v === 'string'
                    )
                ) {
                    return 'invalid_value';
                }
            }
            if (
                'parent_comment_id' in values &&
                values.parent_comment_id !== null
            ) {
                const taskId = values.task_id ?? row?.task_id;
                const { Comment } = require('../../models');
                const parent = await Comment.findByPk(
                    values.parent_comment_id,
                    {
                        attributes: [
                            'id',
                            'task_id',
                            'parent_comment_id',
                            'deleted_at',
                        ],
                    }
                );
                if (!parent || parent.task_id !== taskId) {
                    return 'invalid_reference:parent_comment_uid';
                }
                if (
                    parent.deleted_at ||
                    parent.parent_comment_id ||
                    (row && parent.id === row.id)
                ) {
                    return 'invalid_value';
                }
            }
            return null;
        },
        afterApply: async ({ row, previous, userId }) => {
            if (!previous) {
                await require('../comments/service').recordCreatedSideEffects(
                    row,
                    userId
                );
            }
        },
        snapshotWhere: async (userId) => {
            const { Op } = require('sequelize');
            const { sequelize, Task } = require('../../models');
            const permissionsService = require('../../services/permissionsService');
            const taskWhere =
                await permissionsService.ownershipOrPermissionWhere(
                    'task',
                    userId
                );
            const sql = sequelize
                .getQueryInterface()
                .queryGenerator.selectQuery(
                    'tasks',
                    { attributes: ['id'], where: taskWhere },
                    Task
                )
                .replace(/;$/, '');
            return { task_id: { [Op.in]: sequelize.literal(`(${sql})`) } };
        },
        journalUsers: async (row, transaction) => {
            const { Task, Project, Area } = require('../../models');
            const permissionSources = require('../../services/permissionSources');
            const permissionsService = require('../../services/permissionsService');
            const {
                resolveAssigneeUser,
            } = require('../tasks/operations/assignment');
            const candidates = new Set([row.user_id]);
            const task = await Task.findByPk(row.task_id, {
                attributes: [
                    'id',
                    'uid',
                    'user_id',
                    'project_id',
                    'area_id',
                    'parent_task_id',
                    'assigned_to',
                ],
                transaction,
            });
            if (!task) return Array.from(candidates);
            candidates.add(task.user_id);

            const taskPerms = await permissionSources.findAccepted(
                { resource_type: 'task', resource_uid: task.uid },
                ['user_id']
            );
            for (const p of taskPerms) candidates.add(p.user_id);

            // Walk parent chain to collect project and area collaborators.
            let projectId = task.project_id;
            const areaIds = new Set();
            if (task.area_id) areaIds.add(task.area_id);
            let current = task;
            const seenTasks = new Set([task.id]);
            while (
                current.parent_task_id &&
                !seenTasks.has(current.parent_task_id)
            ) {
                seenTasks.add(current.parent_task_id);
                current = await Task.findByPk(current.parent_task_id, {
                    attributes: [
                        'id',
                        'user_id',
                        'project_id',
                        'area_id',
                        'parent_task_id',
                    ],
                    transaction,
                });
                if (!current) break;
                candidates.add(current.user_id);
                if (!projectId && current.project_id) {
                    projectId = current.project_id;
                }
                if (current.area_id) areaIds.add(current.area_id);
            }

            if (projectId) {
                const project = await Project.findByPk(projectId, {
                    attributes: ['uid', 'user_id', 'area_id'],
                    transaction,
                });
                if (project) {
                    candidates.add(project.user_id);
                    if (project.area_id) areaIds.add(project.area_id);
                    const projPerms = await permissionSources.findAccepted(
                        { resource_type: 'project', resource_uid: project.uid },
                        ['user_id']
                    );
                    for (const p of projPerms) candidates.add(p.user_id);
                }
            }

            for (const areaId of areaIds) {
                const area = await Area.findByPk(areaId, {
                    attributes: ['uid', 'user_id'],
                    transaction,
                });
                if (area) {
                    candidates.add(area.user_id);
                    const areaPerms = await permissionSources.findAccepted(
                        { resource_type: 'area', resource_uid: area.uid },
                        ['user_id']
                    );
                    for (const p of areaPerms) candidates.add(p.user_id);
                }
            }

            if (task.assigned_to) {
                const assignee = await resolveAssigneeUser(task.assigned_to);
                if (assignee) candidates.add(assignee.id);
            }

            const allowed = [];
            for (const uid of candidates) {
                const access = await permissionsService.getAccess(
                    uid,
                    'task',
                    task.uid
                );
                if (access !== permissionsService.ACCESS.NONE) {
                    allowed.push(uid);
                }
            }
            return allowed;
        },
        extraFields: async (row, transaction) => {
            const { User, Person } = require('../../models');
            const { authorDisplayName } = require('../comments/service');
            const author = await User.findByPk(row.user_id, {
                attributes: ['id', 'uid', 'name', 'surname', 'email'],
                transaction,
            });
            if (!author) return { author_uid: null, author_name: null };
            const selfPerson = await Person.findOne({
                where: {
                    linked_user_id: row.user_id,
                    user_id: row.user_id,
                },
                attributes: ['name'],
                raw: true,
                transaction,
            });
            return {
                author_uid: author.uid,
                author_name: authorDisplayName(author, selfPerson),
            };
        },
    },
    project_section: {
        model: 'ProjectSection',
        version: 1,
        fields: ['name', 'position'],
        refs: {
            project_uid: { column: 'project_id', entity: 'project' },
        },
        authorize: async (userId, row, transaction) => {
            const { Project } = require('../../models');
            const project = await Project.findByPk(row.project_id, {
                attributes: ['user_id'],
                transaction,
            });
            return Boolean(project && project.user_id === userId);
        },
        validate: async (row, values) => {
            if (!row && !values.project_id) return 'project_required';
            if (
                row &&
                'project_id' in values &&
                values.project_id !== row.project_id
            ) {
                return 'invalid_value';
            }
            if ('name' in values) {
                if (typeof values.name !== 'string') return 'invalid_value';
                const trimmed = values.name.trim();
                if (!trimmed || trimmed.length > 255) return 'invalid_value';
                values.name = trimmed;
            } else if (!row) {
                return 'invalid_value';
            }
            if (
                'position' in values &&
                !(
                    Number.isInteger(values.position) &&
                    values.position >= 0 &&
                    values.position <= MAX_POSITION
                )
            ) {
                return 'invalid_value';
            }
            return null;
        },
        destroy: (row) =>
            require('../project-sections/repository').destroy(row),
        snapshotWhere: async (userId) => {
            const { Op } = require('sequelize');
            const { sequelize, Project } = require('../../models');
            const sql = sequelize
                .getQueryInterface()
                .queryGenerator.selectQuery(
                    'projects',
                    { attributes: ['id'], where: { user_id: userId } },
                    Project
                )
                .replace(/;$/, '');
            return { project_id: { [Op.in]: sequelize.literal(`(${sql})`) } };
        },
        // A section has no user_id: it belongs to its project's owner.
        ownerId: async (row, transaction) => {
            const { Project } = require('../../models');
            const project = await Project.findByPk(row.project_id, {
                attributes: ['user_id'],
                transaction,
            });
            if (!project) {
                throw new Error(`Section ${row.uid} has no project`);
            }
            return project.user_id;
        },
        journalUsers: async (row, transaction) => [
            await ENTITIES.project_section.ownerId(row, transaction),
        ],
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
