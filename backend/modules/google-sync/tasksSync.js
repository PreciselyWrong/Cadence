'use strict';

const { Project, GoogleTasklist, GoogleTaskLink } = require('../../models');
const {
    hash,
    localTaskProjection,
    remoteTaskProjection,
    toGoogleTask,
    fromGoogleTask,
} = require('./mapping');
const local = require('./localTasks');
const { guard } = require('./guard');

// Re-asks a little before the last pull so an item updated while that pull
// ran is not missed; items already seen hash the same and change nothing.
const UPDATED_MIN_SLACK_MS = 2 * 60 * 1000;

// Google task lists <-> Tududi projects. The default list holds tasks
// without a project; a new Google list becomes a project of that name.
async function syncTasklists(ctx) {
    const { client, user } = ctx;
    const remoteLists = await client.listTasklists();
    const defaultList = await client.request(
        'GET',
        'https://tasks.googleapis.com/tasks/v1/users/@me/lists/@default'
    );
    const rows = await GoogleTasklist.findAll({ where: { user_id: user.id } });
    const byGoogleId = new Map(rows.map((row) => [row.google_id, row]));
    const remoteIds = new Set();

    for (const list of remoteLists) {
        remoteIds.add(list.id);
        const isDefault = list.id === defaultList?.id;
        let row = byGoogleId.get(list.id);
        if (!row) {
            let projectId = null;
            if (!isDefault) {
                projectId = (await local.findOrCreateProject(user, list.title))
                    .id;
            }
            row = await GoogleTasklist.create({
                user_id: user.id,
                google_id: list.id,
                title: list.title,
                project_id: projectId,
                is_default: isDefault,
            });
        } else if (row.title !== list.title || row.is_default !== isDefault) {
            await row.update({ title: list.title, is_default: isDefault });
        }
        byGoogleId.set(list.id, row);
    }

    // A list deleted on Google: its tasks lose their link and are sent again
    // to a new list, rather than deleted from Tududi.
    for (const row of rows) {
        if (remoteIds.has(row.google_id)) continue;
        await GoogleTaskLink.destroy({
            where: {
                user_id: user.id,
                kind: 'task',
                container_id: row.google_id,
            },
        });
        await row.destroy();
        byGoogleId.delete(row.google_id);
    }

    ctx.lists = [...byGoogleId.values()];
}

async function listForProject(ctx, projectId) {
    const found = ctx.lists.find((row) =>
        projectId ? row.project_id === projectId : row.is_default
    );
    if (found) return found;
    if (!projectId) throw new Error('Google has no default task list');
    const project = await Project.findByPk(projectId);
    const created = await ctx.client.insertTasklist(
        (project?.name || 'Tududi').slice(0, 1024)
    );
    const row = await GoogleTasklist.create({
        user_id: ctx.user.id,
        google_id: created.id,
        title: created.title,
        project_id: projectId,
        is_default: false,
    });
    ctx.lists.push(row);
    return row;
}

async function pullRemote(ctx, account) {
    const updatedMin = account.tasks_updated_min
        ? new Date(
              new Date(account.tasks_updated_min).getTime() -
                  UPDATED_MIN_SLACK_MS
          ).toISOString()
        : undefined;
    const remote = new Map();
    for (const list of ctx.lists) {
        const items = await ctx.client.listTasks(list.google_id, {
            updatedMin,
        });
        for (const item of items) {
            const seen = remote.get(item.id);
            // Moved between lists: the live copy wins over the deleted one.
            if (seen && !seen.item.deleted && item.deleted) continue;
            remote.set(item.id, { item, list });
        }
    }
    return remote;
}

async function syncTasks(ctx, account) {
    ctx.pullFailed = false;
    const { client, user, timezone } = ctx;
    const startedAt = new Date();
    await syncTasklists(ctx);
    const remote = await pullRemote(ctx, account);

    const links = await GoogleTaskLink.findAll({
        where: { user_id: user.id, kind: 'task' },
    });
    const byGoogle = new Map(links.map((link) => [link.google_id, link]));
    const byTask = new Map(links.map((link) => [link.task_id, link]));
    const tasks = await local.loadTasks(
        user.id,
        links.map((link) => link.task_id)
    );
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const projectOfList = (list) => list.project_id || null;

    const relink = async (link, task, item, list) => {
        await link.update({
            container_id: list.google_id,
            google_id: item.id,
            local_hash: hash(localTaskProjection(task, timezone)),
            remote_hash: hash(remoteTaskProjection(item, list.google_id)),
        });
    };

    // Pull: Google -> Tududi
    const pending = [...remote.values()];
    for (const { item, list } of pending) {
        await guard(ctx, 'pull', async () => {
            const link = byGoogle.get(item.id);
            const task = link ? tasksById.get(link.task_id) : null;

            if (item.deleted) {
                if (link) {
                    if (task) {
                        await local.deleteTask(task);
                        tasksById.delete(task.id);
                    }
                    await link.destroy();
                    byGoogle.delete(item.id);
                    byTask.delete(link.task_id);
                }
                return;
            }

            const remoteHash = hash(remoteTaskProjection(item, list.google_id));
            if (!link) {
                // Finished before it ever reached Tududi: leave it on Google.
                if (item.status === 'completed') return;
                const { attrs } = fromGoogleTask(item, null, timezone);
                const parentLink = item.parent
                    ? byGoogle.get(item.parent)
                    : null;
                const created = await local.createTask(user, {
                    ...attrs,
                    project_id: projectOfList(list),
                    parent_task_id: parentLink ? parentLink.task_id : null,
                });
                const newLink = await GoogleTaskLink.create({
                    user_id: user.id,
                    task_id: created.id,
                    kind: 'task',
                    container_id: list.google_id,
                    google_id: item.id,
                    local_hash: hash(localTaskProjection(created, timezone)),
                    remote_hash: remoteHash,
                });
                byGoogle.set(item.id, newLink);
                byTask.set(created.id, newLink);
                tasksById.set(created.id, created);
                return;
            }

            if (!task || remoteHash === link.remote_hash) return;

            const localChanged =
                hash(localTaskProjection(task, timezone)) !== link.local_hash;
            // Both sides changed: the later edit wins.
            if (
                localChanged &&
                new Date(task.updated_at) > new Date(item.updated || 0)
            ) {
                return;
            }

            const { attrs, completion } = fromGoogleTask(item, task, timezone);
            if ((task.project_id || null) !== projectOfList(list)) {
                attrs.project_id = projectOfList(list);
            }
            const parentLink = item.parent ? byGoogle.get(item.parent) : null;
            const parentId = parentLink ? parentLink.task_id : null;
            if ((task.parent_task_id || null) !== parentId) {
                attrs.parent_task_id = parentId;
            }
            if (Object.keys(attrs).length) await task.update(attrs);
            if (completion === 'complete') {
                await local.completeTask(task, user, timezone);
            } else if (completion === 'reopen') {
                await local.reopenTask(task, user);
            }
            await task.reload();
            // A recurring task that moved on is pushed back on this same run.
            const hashes = {
                container_id: list.google_id,
                remote_hash: remoteHash,
                local_hash: hash(localTaskProjection(task, timezone)),
            };
            if (completion === 'complete' && !local.isDone(task)) {
                hashes.local_hash = null;
            }
            await link.update(hashes);
        });
    }

    // Tasks deleted in Tududi
    for (const link of [...byTask.values()]) {
        await guard(ctx, 'push', async () => {
            if (tasksById.has(link.task_id)) return;
            await client.deleteTask(link.container_id, link.google_id);
            await link.destroy();
            byTask.delete(link.task_id);
            byGoogle.delete(link.google_id);
        });
    }

    // Push: Tududi -> Google
    for (const task of local.parentsFirst([...tasksById.values()])) {
        await guard(ctx, 'push', async () => {
            const link = byTask.get(task.id);
            if (!local.isSyncable(task)) {
                if (link) {
                    await client.deleteTask(link.container_id, link.google_id);
                    await link.destroy();
                    byTask.delete(task.id);
                }
                return;
            }

            const localHash = hash(localTaskProjection(task, timezone));
            if (link && localHash === link.local_hash) return;

            const parentLink = task.parent_task_id
                ? byTask.get(task.parent_task_id)
                : null;
            // A subtask lives in its parent's list on Google.
            const list =
                (parentLink &&
                    ctx.lists.find(
                        (row) => row.google_id === parentLink.container_id
                    )) ||
                (await listForProject(ctx, task.project_id));
            const body = toGoogleTask(task, timezone);

            if (!link || link.container_id !== list.google_id) {
                if (link)
                    await client.deleteTask(link.container_id, link.google_id);
                const created = await client.insertTask(list.google_id, body, {
                    parent: parentLink?.google_id,
                });
                const fields = {
                    user_id: user.id,
                    task_id: task.id,
                    kind: 'task',
                    container_id: list.google_id,
                    google_id: created.id,
                    local_hash: localHash,
                    remote_hash: hash(
                        remoteTaskProjection(created, list.google_id)
                    ),
                };
                const saved = link
                    ? await link.update(fields)
                    : await GoogleTaskLink.create(fields);
                byTask.set(task.id, saved);
                byGoogle.set(created.id, saved);
                return;
            }

            let updated = await client.patchTask(
                list.google_id,
                link.google_id,
                body
            );
            const parentGoogleId = parentLink?.google_id || null;
            if ((updated.parent || null) !== parentGoogleId) {
                updated = await client.moveTask(
                    list.google_id,
                    link.google_id,
                    {
                        parent: parentGoogleId || undefined,
                    }
                );
            }
            await relink(link, task, updated, list);
        });
    }

    // A pull that failed for an item asks again next time.
    if (!ctx.pullFailed) await account.update({ tasks_updated_min: startedAt });
}

module.exports = { syncTasks };
