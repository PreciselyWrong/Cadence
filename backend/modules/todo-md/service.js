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
const { Op } = require('sequelize');
const { logInfo, logError } = require('../../services/logService');

const SOURCE_TYPE = 'todo_md';
const DEFAULT_SECTION = 'Next';
// The one tag that ties a task to the file: tasks from the file carry it, and
// a task given it in a linked project is written to the file.
const CODE_TAG = 'code';
const STATUS = { NOT_STARTED: 0, DONE: 2, ARCHIVED: 3, CANCELLED: 5 };

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

const hasRoot = () => settings().root.trim() !== '';
const isEnabled = () =>
    hasRoot() || require('./repoConfig').configuredRepos().length > 0;
const isFileBackedProject = (project) => project?.source_type === SOURCE_TYPE;
// A project mirrored from a git repository (repos.js), not from a folder.
const isGitProject = (project) =>
    isFileBackedProject(project) &&
    String(project.source_path || '').startsWith('git:');
const isFileBackedTask = (task) => Boolean(task?.source_key);
// What POST /task receives: tag names, or objects with a name.
const asksForFile = (tags, section) =>
    Boolean(section) ||
    (Array.isArray(tags) &&
        tags.some((tag) => (tag?.name ?? tag) === CODE_TAG));

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

// Adds the code tag, leaving the task's other tags in place.
async function ensureCodeTag(task, userId) {
    const tags = await task.getTags({ attributes: ['name'] });
    const names = tags.map((tag) => tag.name);
    if (names.includes(CODE_TAG)) return;
    const { updateTaskTags } = require('../tasks/operations/tags');
    await updateTaskTags(task, [...names, CODE_TAG], userId);
}

// Tasks of a project that have the code tag but no bullet yet.
function untrackedCodeTasks(project, extraWhere = {}) {
    const { Task, Tag } = models();
    return Task.findAll({
        where: {
            project_id: project.id,
            source_key: null,
            parent_task_id: null,
            ...extraWhere,
        },
        include: [
            {
                model: Tag,
                where: { name: CODE_TAG },
                attributes: [],
                through: { attributes: [] },
            },
        ],
        order: [['id', 'ASC']],
    });
}

// A git repository makes its own project, named after the slug. A folder's
// file only feeds the project someone linked it to.
async function upsertRepoProject(owner, sourcePath, name) {
    const { Project } = models();
    const title = name.slice(0, 150);
    let project = await Project.findOne({
        where: {
            user_id: owner.id,
            source_type: SOURCE_TYPE,
            source_path: sourcePath,
        },
    });
    if (!project) {
        project = await Project.create({
            name: title,
            user_id: owner.id,
            source_type: SOURCE_TYPE,
            source_path: sourcePath,
        });
    } else if (project.name !== title) {
        project.name = title;
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
    const untracked = await untrackedCodeTasks(project);
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
    // Tasks already tagged code come last: a bullet with their name is theirs,
    // so linking again (or a task typed on both sides) never duplicates.
    for (const task of [...owned, ...untracked]) {
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
                // Read closed for the first time: when it closed is unknown,
                // and the file's date would count it as done today.
                completed_at: null,
            });
            await ensureCodeTag(created, owner.id);
            stats.created += 1;
            continue;
        }

        const changes = {};
        for (const [field, value] of Object.entries(desired)) {
            if ((task.get(field) ?? null) !== value) changes[field] = value;
        }
        if (status === STATUS.NOT_STARTED) {
            if (task.completed_at) changes.completed_at = null;
        } else if (task.status !== status) {
            changes.completed_at = task.completed_at || modifiedAt;
        }
        if (Object.keys(changes).length > 0) {
            task.set(changes);
            await task.save();
            stats.updated += 1;
        }
        await ensureCodeTag(task, owner.id);
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

function linkedProject(owner, sourcePath) {
    return models().Project.findOne({
        where: {
            user_id: owner.id,
            source_type: SOURCE_TYPE,
            source_path: sourcePath,
        },
    });
}

// Reconciles the project `sourcePath` with the text of its file. The caller
// holds the project's queue (`exclusive(sourcePath)`).
async function importFile(
    owner,
    { sourcePath, name, text, modifiedAt },
    adopt
) {
    const project = sourcePath.startsWith('git:')
        ? await upsertRepoProject(owner, sourcePath, name)
        : await linkedProject(owner, sourcePath);
    if (!project) {
        throw new TodoMdError(
            'not_linked',
            'No project is linked to this file',
            404
        );
    }
    const stats = await reconcile(
        project,
        owner,
        parseTodoMd(text),
        modifiedAt,
        adopt || null
    );
    return { project, ...stats };
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
    return importFile(
        owner,
        {
            sourcePath: sourcePathFor(folder),
            name: folder,
            text,
            modifiedAt: stat.mtime,
        },
        adopt
    );
}

// The bullet `appendTask` just added to `section`.
function addedItem(text, section) {
    const wanted = section.toLowerCase();
    return parseTodoMd(text)
        .items.filter((i) => i.section.toLowerCase() === wanted)
        .pop();
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
    const linked = new Set(
        (
            await models().Project.findAll({
                where: { user_id: owner.id, source_type: SOURCE_TYPE },
                attributes: ['source_path'],
            })
        ).map((project) => project.source_path)
    );
    for (const folder of await listProjectFolders(root)) {
        if (!linked.has(sourcePathFor(folder))) continue;
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
    if (isGitProject(project)) {
        return require('./repos').createTask(project, {
            name,
            note,
            section: target,
            uid,
        });
    }
    try {
        const { root, folder, file } = await projectFile(project);
        const owner = await models().User.findByPk(project.user_id);
        return await exclusive(sourcePathFor(folder), async () => {
            const written = await editTodoFile(file, (text) =>
                appendTask(text, target, name, { note })
            );
            const added = addedItem(written.text, target);
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
    if (isGitProject(project)) {
        return require('./repos').setTaskDone(task, project, done);
    }
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

// Open tasks that are not in the file yet, in a form this pass can write.
const openUntracked = (project) =>
    untrackedCodeTasks(project, {
        status: {
            [Op.notIn]: [STATUS.DONE, STATUS.ARCHIVED, STATUS.CANCELLED],
        },
        recurrence_type: 'none',
    });

// A task can get the code tag by any route (web, device, MCP): instead of a
// hook on each, this pass writes every such task to `## Next` of its file.
async function exportTagged() {
    const root = await resolveRoot(settings().root);
    const owner = root ? await ownerUser() : null;
    if (!owner) return 0;
    const { Project } = models();
    const projects = await Project.findAll({
        where: { user_id: owner.id, source_type: SOURCE_TYPE },
    });
    let written = 0;
    for (const project of projects) {
        if (isGitProject(project)) continue;
        if ((await openUntracked(project)).length === 0) continue;
        try {
            const folder = folderFromSourcePath(project.source_path);
            const file = await resolveTodoFile(root, folder);
            await exclusive(sourcePathFor(folder), async () => {
                // A bullet already holding the name adopts its task first.
                await importFolderLocked(root, owner, folder);
                for (const task of await openUntracked(project)) {
                    const edited = await editTodoFile(file, (text) =>
                        appendTask(text, DEFAULT_SECTION, task.name, {
                            note: task.note,
                        })
                    );
                    const added = addedItem(edited.text, DEFAULT_SECTION);
                    await task.update({
                        source_key: added.key,
                        source_section: added.section.slice(0, 150),
                    });
                    written += 1;
                }
                await importFolderLocked(root, owner, folder);
            });
        } catch (error) {
            logError(`TODO.md export failed for ${project.uid}`, error);
        }
    }
    return written;
}

// The files under the root and the project each one feeds, if any.
async function listFiles() {
    const root = await resolveRoot(settings().root);
    const owner = await ownerUser();
    if (!root || !owner) return [];
    const projects = await models().Project.findAll({
        where: { user_id: owner.id, source_type: SOURCE_TYPE },
        attributes: ['uid', 'name', 'source_path'],
    });
    const byPath = new Map(projects.map((p) => [p.source_path, p]));
    const folders = await listProjectFolders(root);
    return folders.map((folder) => {
        const project = byPath.get(sourcePathFor(folder));
        return {
            folder,
            path: sourcePathFor(folder),
            project_uid: project?.uid ?? null,
            project_name: project?.name ?? null,
        };
    });
}

async function ownedProject(uid) {
    const owner = await ownerUser();
    const project = owner
        ? await models().Project.findOne({ where: { uid, user_id: owner.id } })
        : null;
    if (!project) {
        throw new TodoMdError('not_found', 'Project not found', 404);
    }
    return { owner, project };
}

// Makes `folder`'s TODO.md feed an existing project, and reads it at once.
async function linkProject(uid, folder) {
    const { owner, project } = await ownedProject(uid);
    if (isFileBackedProject(project)) {
        throw new TodoMdError(
            'already_linked',
            'This project already follows a TODO.md file',
            409
        );
    }
    const root = await resolveRoot(settings().root);
    if (!root) {
        throw new TodoMdError(
            'root_unavailable',
            'The TODO root is not configured or not readable',
            503
        );
    }
    const sourcePath = sourcePathFor(folder);
    try {
        await resolveTodoFile(root, folder);
        return await exclusive(sourcePath, async () => {
            if (await linkedProject(owner, sourcePath)) {
                throw new TodoMdError(
                    'file_taken',
                    'Another project already follows this file',
                    409
                );
            }
            await project.update({
                source_type: SOURCE_TYPE,
                source_path: sourcePath,
            });
            await importFolderLocked(root, owner, folder);
            return { project_uid: project.uid, path: sourcePath };
        });
    } catch (error) {
        throw asClientError(error);
    }
}

// The project stops following its file. Its tasks stay as ordinary tasks, and
// the file is not touched.
async function unlinkProject(uid) {
    const { project } = await ownedProject(uid);
    if (!isFileBackedProject(project)) {
        throw new TodoMdError('not_linked', 'Not a TODO.md project', 409);
    }
    if (isGitProject(project)) {
        throw new TodoMdError(
            'repo_project',
            'A repository project follows TUDUDI_TODO_REPOS',
            409
        );
    }
    return exclusive(project.source_path, async () => {
        const { Task } = models();
        const tasks = await Task.findAll({
            where: {
                project_id: project.id,
                source_key: { [Op.ne]: null },
            },
        });
        for (const task of tasks) {
            await task.update({ source_key: null, source_section: null });
        }
        await project.update({ source_type: null, source_path: null });
        return { project_uid: project.uid };
    });
}

async function status({ includeRepos = false } = {}) {
    const result = { enabled: isEnabled(), last_scan: lastScan };
    result.repos = includeRepos ? await require('./repos').statuses() : [];
    return result;
}

module.exports = {
    SOURCE_TYPE,
    DEFAULT_SECTION,
    CODE_TAG,
    TodoMdError,
    asksForFile,
    isEnabled,
    hasRoot,
    isFileBackedProject,
    isGitProject,
    isFileBackedTask,
    settings,
    ownerUser,
    importAll,
    importFolder,
    importFile,
    exclusive,
    addedItem,
    asClientError,
    createTask,
    setTaskDone,
    exportTagged,
    listFiles,
    linkProject,
    unlinkProject,
    status,
};
