'use strict';

const {
    resolveRoot,
    resolveTodoFile,
    listProjectFolders,
    sourcePathFor,
    folderFromSourcePath,
} = require('./paths');
const { parseTodoMd } = require('./parser');
const { appendTask, setItemDone, TodoEditError } = require('./writer');
const { editTodoFile, readTodoText } = require('./safeFile');
const { logInfo, logError } = require('../../services/logService');

const SOURCE_TYPE = 'todo_md';
const DEFAULT_SECTION = 'Next';
const STATUS = { NOT_STARTED: 0, DONE: 2, ARCHIVED: 3 };

class TodoMdError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'TodoMdError';
        this.code = code;
        this.status = status;
    }
}

const models = () => require('../../models');

const settings = () => ({
    root: process.env.TUDUDI_TODO_ROOT || '',
    userEmail: (process.env.TUDUDI_TODO_USER_EMAIL || '').trim().toLowerCase(),
});

const isEnabled = () => settings().root.trim() !== '';
const isFileBackedProject = (project) => project?.source_type === SOURCE_TYPE;
const isFileBackedTask = (task) => Boolean(task?.source_key);

// Reads and writes of one project's file never overlap inside this process:
// an import waits for the write of a task being added, so the row that write
// creates is never imported a second time.
const queues = new Map();
function exclusive(name, fn) {
    const previous = queues.get(name) || Promise.resolve();
    const run = previous.then(fn, fn);
    const tail = run.catch(() => {});
    queues.set(name, tail);
    tail.then(() => {
        if (queues.get(name) === tail) queues.delete(name);
    });
    return run;
}

// The account the mirrored projects belong to: TUDUDI_TODO_USER_EMAIL, else
// the first administrator, else the first account.
async function ownerUser() {
    const { User } = models();
    const { userEmail } = settings();
    if (userEmail) {
        const named = await User.findOne({ where: { email: userEmail } });
        if (named) return named;
    }
    const { Role } = models();
    const admin = await Role.findOne({
        where: { is_admin: true },
        order: [['id', 'ASC']],
    });
    const adminUser = admin ? await User.findByPk(admin.user_id) : null;
    return adminUser || User.findOne({ order: [['id', 'ASC']] });
}

function desiredStatus(item) {
    if (item.dropped) return STATUS.ARCHIVED;
    return item.done ? STATUS.DONE : STATUS.NOT_STARTED;
}

async function sectionTag(task, userId, name) {
    try {
        const { updateTaskTags } = require('../tasks/operations/tags');
        await updateTaskTags(task, [name], userId);
    } catch {
        // A heading that cannot be a tag name (long, or with characters tags
        // refuse) simply leaves the task without a section tag.
    }
}

async function upsertProject(owner, folder) {
    const { Project } = models();
    const sourcePath = sourcePathFor(folder);
    let project = await Project.findOne({
        where: {
            user_id: owner.id,
            source_type: SOURCE_TYPE,
            source_path: sourcePath,
        },
    });
    if (!project) {
        project = await Project.create({
            name: folder.slice(0, 150),
            user_id: owner.id,
            source_type: SOURCE_TYPE,
            source_path: sourcePath,
        });
    } else if (project.name !== folder.slice(0, 150)) {
        project.name = folder.slice(0, 150);
        await project.save();
    }
    return project;
}

// Brings the project's tasks in line with the file: matched by identity key
// (section + text + occurrence), then by text alone so a bullet moved to
// another section keeps its row; the rest is created or removed.
async function reconcile(project, owner, parsed, modifiedAt, adopt) {
    const { Task, TaskAttachment } = models();
    const { ENTITIES } = require('../sync/registry');
    const stats = { created: 0, updated: 0, removed: 0 };

    const existing = await Task.findAll({
        where: { project_id: project.id },
        order: [['id', 'ASC']],
    });
    const owned = existing.filter((t) => t.source_key);
    const byKey = new Map();
    for (const task of owned) {
        if (!byKey.has(task.source_key)) byKey.set(task.source_key, task);
    }

    const pairs = new Map();
    const used = new Set();
    for (const item of parsed.items) {
        const task = byKey.get(item.key);
        if (task && !used.has(task.id)) {
            pairs.set(item, task);
            used.add(task.id);
        }
    }

    const spare = new Map();
    for (const task of owned) {
        if (used.has(task.id)) continue;
        if (!spare.has(task.name)) spare.set(task.name, []);
        spare.get(task.name).push(task);
    }
    for (const item of parsed.items) {
        if (pairs.has(item)) continue;
        const candidates = spare.get(item.name);
        if (candidates && candidates.length > 0) {
            const task = candidates.shift();
            pairs.set(item, task);
            used.add(task.id);
        }
    }

    for (const item of parsed.items) {
        const status = desiredStatus(item);
        const task = pairs.get(item);
        const desired = {
            name: item.name,
            note: item.note === '' ? null : item.note,
            status,
            source_section: item.section.slice(0, 150),
            source_key: item.key,
        };

        if (!task) {
            const created = await Task.create({
                ...desired,
                ...(adopt && adopt.key === item.key ? { uid: adopt.uid } : {}),
                user_id: owner.id,
                project_id: project.id,
                completed_at:
                    status === STATUS.DONE || status === STATUS.ARCHIVED
                        ? modifiedAt
                        : null,
            });
            await sectionTag(created, owner.id, item.section);
            stats.created += 1;
            continue;
        }

        const sectionChanged = task.source_section !== desired.source_section;
        const changes = {};
        for (const [field, value] of Object.entries(desired)) {
            if ((task.get(field) ?? null) !== value) changes[field] = value;
        }
        const leavesDone =
            task.status === STATUS.DONE && status !== STATUS.DONE;
        const entersDone =
            task.status !== STATUS.DONE && status === STATUS.DONE;
        if (leavesDone) changes.completed_at = null;
        if (entersDone || (status === STATUS.ARCHIVED && !task.completed_at)) {
            changes.completed_at = task.completed_at || modifiedAt;
        }
        if (Object.keys(changes).length > 0) {
            task.set(changes);
            await task.save();
            stats.updated += 1;
        }
        if (sectionChanged) {
            await sectionTag(task, owner.id, item.section);
        }
    }

    for (const task of owned) {
        if (used.has(task.id)) continue;
        task.Attachments = await TaskAttachment.findAll({
            where: { task_id: task.id },
        });
        await ENTITIES.task.destroy(task);
        stats.removed += 1;
    }
    return stats;
}

// Reads the folder's file and reconciles its project. Callers outside this
// module go through `importFolder`, which takes the project's queue;
// `importFolderLocked` is for code already holding it.
async function importFolderLocked(root, owner, folder, adopt = null) {
    const fs = require('fs');
    const file = await resolveTodoFile(root, folder);
    const [{ text }, stat] = await Promise.all([
        readTodoText(file),
        fs.promises.stat(file),
    ]);
    const project = await upsertProject(owner, folder);
    const stats = await reconcile(
        project,
        owner,
        parseTodoMd(text),
        stat.mtime,
        adopt
    );
    return { project, ...stats };
}

const importFolder = (root, owner, folder) =>
    exclusive(sourcePathFor(folder), () =>
        importFolderLocked(root, owner, folder)
    );

let lastScan = { at: null, projects: 0, errors: [] };

// Reads every project folder under the root. A folder that cannot be read
// is reported and skipped: nothing is ever deleted because a file is
// unreachable, only because the file was read and no longer holds the task.
async function importAll() {
    const root = await resolveRoot(settings().root);
    if (!root) {
        throw new TodoMdError(
            'root_unavailable',
            'The TODO root is not configured or not readable',
            503
        );
    }
    const owner = await ownerUser();
    if (!owner) {
        throw new TodoMdError(
            'no_user',
            'There is no account to import into',
            503
        );
    }

    const summary = {
        projects: 0,
        created: 0,
        updated: 0,
        removed: 0,
        errors: [],
    };
    for (const folder of await listProjectFolders(root)) {
        try {
            const result = await importFolder(root, owner, folder);
            summary.projects += 1;
            summary.created += result.created;
            summary.updated += result.updated;
            summary.removed += result.removed;
        } catch (error) {
            summary.errors.push({ folder, code: error.code || 'error' });
            logError(`TODO.md import failed for ${folder}`, error);
        }
    }
    lastScan = {
        at: new Date().toISOString(),
        projects: summary.projects,
        errors: summary.errors,
    };
    if (summary.created || summary.updated || summary.removed) {
        logInfo(
            `TODO.md import: ${summary.created} created, ${summary.updated} updated, ${summary.removed} removed`
        );
    }
    return summary;
}

async function projectFile(project) {
    const root = await resolveRoot(settings().root);
    if (!root) {
        throw new TodoMdError(
            'root_unavailable',
            'The TODO root is not configured or not readable',
            503
        );
    }
    const folder = folderFromSourcePath(project.source_path);
    return { root, folder, file: await resolveTodoFile(root, folder) };
}

function asClientError(error) {
    if (error instanceof TodoEditError) {
        return new TodoMdError(error.code, error.message, 409);
    }
    if (error.code === 'file_conflict') {
        return new TodoMdError(error.code, error.message, 409);
    }
    if (error.code === 'unsupported_encoding') {
        return new TodoMdError(error.code, error.message, 422);
    }
    if (error.code === 'path_escape' || error.code === 'missing_file') {
        return new TodoMdError(error.code, error.message, 404);
    }
    return error;
}

// Appends a bullet to the project's file and records the matching task. The
// uid, when given, is the one a device already chose for it.
async function createTask(project, { name, note, section, uid } = {}) {
    if (!isFileBackedProject(project)) {
        throw new TodoMdError('not_file_backed', 'Not a TODO.md project');
    }
    const target = (section || DEFAULT_SECTION).trim() || DEFAULT_SECTION;
    try {
        const { root, folder, file } = await projectFile(project);
        const owner = await models().User.findByPk(project.user_id);
        return await exclusive(sourcePathFor(folder), async () => {
            const written = await editTodoFile(file, (text) =>
                appendTask(text, target, name, { note })
            );
            const parsed = parseTodoMd(written.text);
            const wanted = target.toLowerCase();
            const added = parsed.items
                .filter((i) => i.section.toLowerCase() === wanted)
                .pop();
            const { Task } = models();
            await importFolderLocked(root, owner, folder, {
                key: added.key,
                uid,
            });
            return Task.findOne({
                where: { project_id: project.id, source_key: added.key },
            });
        });
    } catch (error) {
        throw asClientError(error);
    }
}

// Checks or unchecks the task's bullet. Only the box changes; a task that
// sits in Done or Dropped has to be moved in the file itself.
async function setTaskDone(task, project, done) {
    try {
        const { root, folder, file } = await projectFile(project);
        const owner = await models().User.findByPk(project.user_id);
        return await exclusive(sourcePathFor(folder), async () => {
            await editTodoFile(file, (text) =>
                setItemDone(text, task.source_key, done)
            );
            await importFolderLocked(root, owner, folder, null);
            return task.reload();
        });
    } catch (error) {
        throw asClientError(error);
    }
}

function status() {
    return { enabled: isEnabled(), last_scan: lastScan };
}

module.exports = {
    SOURCE_TYPE,
    DEFAULT_SECTION,
    TodoMdError,
    isEnabled,
    isFileBackedProject,
    isFileBackedTask,
    settings,
    ownerUser,
    importAll,
    importFolder,
    createTask,
    setTaskDone,
    status,
};
