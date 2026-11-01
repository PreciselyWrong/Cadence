'use strict';

const { Op } = require('sequelize');
const {
    Task,
    Project,
    Tag,
    UserTaskOrder,
    sequelize,
} = require('../../../models');
const permissionsService = require('../../../services/permissionsService');
const {
    ForbiddenError,
    NotFoundError,
    ValidationError,
} = require('../../../shared/errors');

const MAX_ORDER_TASKS = 5000;
const ALL_SCOPE = 'all';
const BASE_ORDER_BY =
    /^(created_at|updated_at|name|priority|status|due_date|completed_at):(asc|desc)$/;

// Resolves the list a request orders: the All Tasks page, one project's
// tasks (which needs read access to that project), or one of the user's
// tags. A tag order covers the visible tasks sent with it; tags have no
// sharing, so the tag must belong to the user.
//
// All Tasks and tag lists keep a per-user order in user_task_orders. A
// project's top-level tasks keep theirs in `tasks.order`, the field every
// device syncs: one order per project, shared by everyone who can edit it
// (docs/fork/DECISIONS.md).
async function resolveScope(
    userId,
    { scope, project_uid: projectUid, tag_uid: tagUid }
) {
    if (scope === ALL_SCOPE) return { key: ALL_SCOPE, projectId: null };
    if (scope === 'tag') {
        if (typeof tagUid !== 'string' || !tagUid) {
            throw new ValidationError('tag_uid is required.');
        }
        const tag = await Tag.findOne({
            where: { uid: tagUid, user_id: userId },
            attributes: ['id'],
        });
        if (!tag) throw new NotFoundError('Tag not found.');
        return { key: `tag:${tag.id}`, projectId: null };
    }
    if (scope !== 'project') {
        throw new ValidationError("scope must be 'all', 'project' or 'tag'.");
    }
    if (typeof projectUid !== 'string' || !projectUid) {
        throw new ValidationError('project_uid is required.');
    }
    const project = await Project.findOne({
        where: { uid: projectUid },
        attributes: ['id', 'uid'],
    });
    const access = project
        ? await permissionsService.getAccess(userId, 'project', projectUid)
        : 'none';
    if (!project || access === 'none') {
        throw new NotFoundError('Project not found.');
    }
    return {
        key: `project:${project.id}`,
        projectId: project.id,
        access,
    };
}

// A project's top-level tasks in their synced order, as uids. Tasks never
// placed (`order` null) are left out, as unplaced rows are for other lists.
async function getProjectOrderedUids(projectId, transaction) {
    const rows = await Task.findAll({
        where: {
            project_id: projectId,
            parent_task_id: null,
            order: { [Op.ne]: null },
        },
        attributes: ['uid'],
        order: [
            ['order', 'ASC'],
            ['id', 'ASC'],
        ],
        raw: true,
        transaction,
    });
    return rows.map((row) => row.uid);
}

// Writes positions as `order` on each task whose rank changed, through the
// model so the sync journal hands the change to every device.
async function writeProjectOrder(projectId, uids, transaction) {
    const rows = await Task.findAll({
        where: {
            project_id: projectId,
            parent_task_id: null,
            uid: { [Op.in]: uids },
        },
        transaction,
    });
    const byUid = new Map(rows.map((row) => [row.uid, row]));
    let index = 0;
    for (const uid of uids) {
        const row = byUid.get(uid);
        if (!row) continue;
        if (row.order !== index) {
            await row.update({ order: index }, { transaction });
        }
        index += 1;
    }
}

// The saved order of a list, as task uids. Rows of deleted tasks drop out
// through the join.
async function getOrderedUids(userId, scopeKey) {
    const rows = await UserTaskOrder.findAll({
        where: { user_id: userId, scope: scopeKey },
        attributes: ['position'],
        include: [{ model: Task, as: 'Task', attributes: ['uid'] }],
        order: [['position', 'ASC']],
    });
    return rows.filter((row) => row.Task).map((row) => row.Task.uid);
}

async function getOrder(userId, query) {
    const scope = await resolveScope(userId, query);
    if (scope.projectId !== null) {
        return { task_uids: await getProjectOrderedUids(scope.projectId) };
    }
    return { task_uids: await getOrderedUids(userId, scope.key) };
}

// The order a first drag starts from when the list was sorted another way
// (All Tasks only; it is paged, so the client cannot send the full list).
async function seedAllOrder(userId, baseOrderBy, timezone) {
    // Required lazily: query-builders requires this module for ORDER BY.
    const { filterTasksByParams } = require('../queries/query-builders');
    const tasks = await filterTasksByParams(
        { order_by: baseOrderBy, status: 'all' },
        userId,
        timezone
    );
    return tasks.map((task) => task.uid);
}

// Saves a drag. The client sends the tasks it shows, in their new order;
// lists are paged and filtered, so those tasks are reordered within the
// slots they hold in the full order and everything else stays put. The
// full order is the saved one, or for a drag made under another sort
// (`base_order_by`), that sort.
async function saveOrder(userId, body, timezone) {
    const taskUids = body?.task_uids;
    if (
        !Array.isArray(taskUids) ||
        taskUids.some((uid) => typeof uid !== 'string' || !uid)
    ) {
        throw new ValidationError('task_uids must be a list of UIDs.');
    }
    if (taskUids.length > MAX_ORDER_TASKS) {
        throw new ValidationError(
            `Cannot order more than ${MAX_ORDER_TASKS} tasks.`
        );
    }
    if (new Set(taskUids).size !== taskUids.length) {
        throw new ValidationError('task_uids contains duplicates.');
    }

    const scope = await resolveScope(userId, body);
    if (scope.projectId !== null && scope.access === 'ro') {
        throw new ForbiddenError('Read-only access to this project.');
    }
    const visibleWhere = await permissionsService.ownershipOrPermissionWhere(
        'task',
        userId
    );
    const conditions = [visibleWhere, { uid: { [Op.in]: taskUids } }];
    if (scope.projectId !== null) {
        conditions.push({ project_id: scope.projectId, parent_task_id: null });
    }
    const tasks = taskUids.length
        ? await Task.findAll({
              where: { [Op.and]: conditions },
              attributes: ['id', 'uid', 'created_at'],
              raw: true,
          })
        : [];
    if (tasks.length !== taskUids.length) {
        throw new NotFoundError('One or more tasks not found.');
    }

    const baseOrderBy = body.base_order_by;
    if (baseOrderBy !== undefined && !BASE_ORDER_BY.test(baseOrderBy)) {
        throw new ValidationError('base_order_by is not a valid sort.');
    }
    let saved;
    if (baseOrderBy && scope.key === ALL_SCOPE) {
        saved = await seedAllOrder(userId, baseOrderBy, timezone);
    } else if (scope.projectId !== null) {
        saved = await getProjectOrderedUids(scope.projectId);
    } else {
        saved = await getOrderedUids(userId, scope.key);
    }
    const savedSet = new Set(saved);
    // Unplaced tasks sort first, newest first, in every custom list.
    const unplaced = tasks
        .filter((task) => !savedSet.has(task.uid))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map((task) => task.uid);
    const current = [...unplaced, ...saved];
    const moved = new Set(taskUids);
    let next = 0;
    const newOrder = current.map((uid) =>
        moved.has(uid) ? taskUids[next++] : uid
    );

    if (scope.projectId !== null) {
        await sequelize.transaction((transaction) =>
            writeProjectOrder(scope.projectId, newOrder, transaction)
        );
        return { task_uids: newOrder };
    }

    const idByUid = new Map(tasks.map((task) => [task.uid, task.id]));
    const missing = newOrder.filter((uid) => !idByUid.has(uid));
    if (missing.length) {
        const rows = await Task.findAll({
            where: { uid: { [Op.in]: missing } },
            attributes: ['id', 'uid'],
            raw: true,
        });
        rows.forEach((row) => idByUid.set(row.uid, row.id));
    }

    await sequelize.transaction(async (transaction) => {
        await UserTaskOrder.destroy({
            where: { user_id: userId, scope: scope.key },
            transaction,
        });
        await UserTaskOrder.bulkCreate(
            newOrder
                .filter((uid) => idByUid.has(uid))
                .map((uid, index) => ({
                    user_id: userId,
                    task_id: idByUid.get(uid),
                    scope: scope.key,
                    position: index,
                })),
            { transaction }
        );
    });

    return { task_uids: newOrder };
}

// Project orders used to be per user. Each project still holding saved
// rows takes its owner's order onto its tasks, unless a device has already
// ordered it; the rows then go. Runs at start-up, a no-op once done.
async function moveProjectOrders() {
    const rows = await UserTaskOrder.findAll({
        where: { scope: { [Op.like]: 'project:%' } },
        attributes: ['user_id', 'scope', 'position'],
        include: [
            {
                model: Task,
                as: 'Task',
                attributes: ['uid', 'project_id', 'parent_task_id'],
            },
        ],
        order: [['position', 'ASC']],
    });
    const byProject = new Map();
    for (const row of rows) {
        const projectId = Number(row.scope.slice('project:'.length));
        if (!byProject.has(projectId)) byProject.set(projectId, []);
        byProject.get(projectId).push(row);
    }

    let moved = 0;
    for (const [projectId, projectRows] of byProject) {
        await sequelize.transaction(async (transaction) => {
            const project = await Project.findByPk(projectId, {
                attributes: ['id', 'user_id'],
                transaction,
            });
            const alreadyOrdered = project
                ? (await getProjectOrderedUids(projectId, transaction)).length >
                  0
                : true;
            if (!alreadyOrdered) {
                const uids = projectRows
                    .filter(
                        (row) =>
                            row.user_id === project.user_id &&
                            row.Task &&
                            row.Task.project_id === projectId &&
                            row.Task.parent_task_id === null
                    )
                    .map((row) => row.Task.uid);
                if (uids.length) {
                    await writeProjectOrder(projectId, uids, transaction);
                    moved += 1;
                }
            }
            await UserTaskOrder.destroy({
                where: { scope: `project:${projectId}` },
                transaction,
            });
        });
    }
    return { projects: moved };
}

// ORDER BY for `order_by=custom` on GET /tasks: placed tasks by position,
// unplaced ones first and newest first.
function customOrderClause(userId) {
    const position = `(SELECT uto.position FROM user_task_orders uto WHERE uto.task_id = "Task"."id" AND uto.user_id = ${Number(userId)} AND uto.scope = '${ALL_SCOPE}')`;
    return [
        [
            sequelize.literal(
                `CASE WHEN ${position} IS NULL THEN 0 ELSE 1 END`
            ),
            'ASC',
        ],
        [sequelize.literal(position), 'ASC'],
        ['created_at', 'DESC'],
    ];
}

module.exports = {
    getOrder,
    saveOrder,
    customOrderClause,
    moveProjectOrders,
};
