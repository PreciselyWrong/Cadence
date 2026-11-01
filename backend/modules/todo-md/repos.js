'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const service = require('./service');
const git = require('./git');
const { configuredRepos, findRepo, gitDir } = require('./repoConfig');
const { appendTask, setItemDone, TodoEditError } = require('./writer');
const { editTodoFile, readTodoText } = require('./safeFile');
const { logInfo, logError } = require('../../services/logService');

// TODO.md files that live in git repositories (Gitea, GitHub). Each repo is
// cloned under TUDUDI_TODO_GIT_DIR; reading is fetch + reset to the remote
// branch, writing is fetch + reset + one keyed edit + commit + push. The
// remote branch is the source of truth: a Cadence edit that no longer
// applies to it (the line changed there) is not written and stays pending,
// and an edit that cannot reach it waits for "Retry".

const MAX_PUSH_ATTEMPTS = 3;
const MAX_PENDING = 50;
const { TodoMdError } = service;

const models = () => require('../../models');
const sourcePathFor = (slug) => `git:${slug}`;
const slugFromSourcePath = (sourcePath) =>
    /^git:(.+)$/.exec(sourcePath || '')?.[1] || null;
const cloneDir = (repo) => path.join(gitDir(), repo.slug);

const runGit = (repo, args, cwd) =>
    git.run(repo, gitDir(), args, { cwd: cwd || cloneDir(repo) });

async function stateOf(slug) {
    const { TodoMdRepo } = models();
    const [row] = await TodoMdRepo.findOrCreate({
        where: { slug },
        defaults: { slug, pending: [] },
    });
    return row;
}

// Clones the branch the first time, and follows a changed URL afterwards.
async function ensureClone(repo) {
    const dir = cloneDir(repo);
    const base = gitDir();
    await fs.promises.mkdir(base, { recursive: true, mode: 0o700 });
    if (fs.existsSync(path.join(dir, '.git'))) {
        const current = (
            await runGit(repo, ['config', '--get', 'remote.origin.url']).catch(
                () => ''
            )
        ).trim();
        if (current !== repo.url) {
            await runGit(repo, ['remote', 'set-url', 'origin', repo.url]);
        }
        return dir;
    }
    await fs.promises.rm(dir, { recursive: true, force: true });
    await runGit(
        repo,
        [
            'clone',
            '--depth',
            '1',
            '--single-branch',
            '--branch',
            repo.branch,
            '--',
            repo.url,
            dir,
        ],
        base
    );
    return dir;
}

// Brings the clone to the remote branch, dropping any local commit.
async function refresh(repo) {
    await ensureClone(repo);
    const ref = `refs/remotes/origin/${repo.branch}`;
    await runGit(repo, [
        'fetch',
        '--depth',
        '1',
        'origin',
        `+refs/heads/${repo.branch}:${ref}`,
    ]);
    await runGit(repo, ['reset', '--hard', ref]);
    const sha = (await runGit(repo, ['rev-parse', 'HEAD'])).trim();
    const date = (
        await runGit(repo, ['show', '-s', '--format=%cI', 'HEAD'])
    ).trim();
    return { sha, committedAt: date ? new Date(date) : new Date() };
}

// The TODO.md inside the clone, refused when it (or a folder on the way)
// is a symlink that leads out of the clone or into .git. `relative` is the
// path git knows the real file by.
async function todoFile(repo) {
    const dir = await fs.promises.realpath(cloneDir(repo));
    let real;
    try {
        real = await fs.promises.realpath(path.join(dir, repo.path));
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
            throw new TodoMdError(
                'missing_file',
                `${repo.path} is not in ${repo.display}`,
                404
            );
        }
        throw error;
    }
    const relative = path.relative(dir, real);
    if (
        relative.startsWith('..') ||
        path.isAbsolute(relative) ||
        relative.split(path.sep)[0] === '.git' ||
        !(await fs.promises.stat(real)).isFile()
    ) {
        throw new TodoMdError(
            'path_escape',
            'The TODO.md path leaves the repository',
            404
        );
    }
    return { file: real, relative: relative.split(path.sep).join('/') };
}

async function importText(repo, owner, text, committedAt, adopt) {
    return service.importFile(
        owner,
        {
            sourcePath: sourcePathFor(repo.slug),
            name: repo.slug,
            text,
            modifiedAt: committedAt,
        },
        adopt
    );
}

async function recordSynced(repo, sha) {
    const state = await stateOf(repo.slug);
    await state.update({
        head_sha: sha,
        synced_at: new Date(),
        last_error: null,
    });
}

async function recordError(repo, error) {
    const state = await stateOf(repo.slug);
    await state.update({ last_error: git.scrub(error.message, repo) });
}

function owner() {
    return service.ownerUser().then((user) => {
        if (!user) {
            throw new TodoMdError(
                'no_user',
                'There is no account to import into',
                503
            );
        }
        return user;
    });
}

// Reads the remote branch and reconciles the project. Holds the queue.
async function syncLocked(repo) {
    try {
        const { sha, committedAt } = await refresh(repo);
        const { text } = await readTodoText((await todoFile(repo)).file);
        const result = await importText(repo, await owner(), text, committedAt);
        await recordSynced(repo, sha);
        return result;
    } catch (error) {
        await recordError(repo, error);
        if (error instanceof git.GitError) {
            throw new TodoMdError(
                'todo_md_repo_unreachable',
                git.scrub(error.message, repo),
                503
            );
        }
        throw error;
    }
}

const syncRepo = (repo) =>
    service.exclusive(sourcePathFor(repo.slug), () => syncLocked(repo));

// Every configured repository, one after the other. A repository that
// cannot be read keeps its project and tasks as they were.
async function syncAll() {
    const summary = {
        projects: 0,
        created: 0,
        updated: 0,
        removed: 0,
        errors: [],
    };
    for (const repo of configuredRepos()) {
        try {
            const result = await syncRepo(repo);
            summary.projects += 1;
            summary.created += result.created;
            summary.updated += result.updated;
            summary.removed += result.removed;
        } catch (error) {
            summary.errors.push({
                folder: sourcePathFor(repo.slug),
                code: error.code || 'error',
            });
            logError(
                `TODO.md repository sync failed for ${repo.slug}: ${git.scrub(error.message, repo)}`
            );
        }
    }
    if (summary.created || summary.updated || summary.removed) {
        logInfo(
            `TODO.md repositories: ${summary.created} created, ${summary.updated} updated, ${summary.removed} removed`
        );
    }
    return summary;
}

function transformFor(edit) {
    if (edit.op === 'add') {
        return (text) =>
            appendTask(text, edit.section, edit.name, { note: edit.note });
    }
    return (text) => setItemDone(text, edit.key, edit.done);
}

function commitMessage(edit) {
    if (edit.op === 'add') return `Cadence: add "${edit.name}"`;
    return `Cadence: ${edit.done ? 'check' : 'uncheck'} "${edit.name}"`;
}

// One edit, applied to the remote branch as it is now. Holds the queue.
// Returns the import result (and, for an add, the key of the new bullet).
async function applyLocked(repo, edit) {
    const user = await owner();
    for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt += 1) {
        const { sha, committedAt } = await refresh(repo);
        const { file, relative } = await todoFile(repo);
        let written;
        try {
            written = await editTodoFile(file, transformFor(edit));
        } catch (error) {
            if (error instanceof TodoEditError && error.code === 'not_found') {
                // The line changed in the repository: show what is there now
                // and write nothing.
                const { text } = await readTodoText(file);
                await importText(repo, user, text, committedAt);
                await recordSynced(repo, sha);
            }
            throw error;
        }
        const key =
            edit.op === 'add'
                ? service.addedItem(written.text, edit.section)?.key
                : null;
        const adopt = key && edit.uid ? { key, uid: edit.uid } : null;
        if (!written.changed) {
            const result = await importText(
                repo,
                user,
                written.text,
                committedAt,
                adopt
            );
            await recordSynced(repo, sha);
            return { ...result, key };
        }

        await runGit(repo, ['add', '--', relative]);
        await runGit(repo, [
            'commit',
            '--quiet',
            '-m',
            commitMessage(edit),
            '--',
            relative,
        ]);
        try {
            await runGit(repo, [
                'push',
                '--quiet',
                'origin',
                `HEAD:refs/heads/${repo.branch}`,
            ]);
        } catch (error) {
            if (error.kind === 'rejected' && attempt < MAX_PUSH_ATTEMPTS) {
                continue;
            }
            throw error;
        }
        const pushed = (await runGit(repo, ['rev-parse', 'HEAD'])).trim();
        const result = await importText(
            repo,
            user,
            written.text,
            new Date(),
            adopt
        );
        await recordSynced(repo, pushed);
        return { ...result, key };
    }
    throw new git.GitError('git push kept being rejected', {
        kind: 'rejected',
    });
}

// What the user sees for an edit that did not reach the repository.
function failureOf(error) {
    if (error instanceof TodoEditError && error.code === 'not_found') {
        return {
            reason: 'conflict',
            client: new TodoMdError(
                'todo_md_conflict',
                'This line changed in the repository; nothing was written',
                409
            ),
        };
    }
    if (error instanceof git.GitError) {
        return {
            reason: 'unreachable',
            client: new TodoMdError(
                'todo_md_repo_unreachable',
                error.message,
                503
            ),
        };
    }
    return null;
}

const sameEdit = (a, b) =>
    a.op === b.op &&
    (a.op === 'add'
        ? a.uid && a.uid === b.uid
        : a.key === b.key && a.task_uid === b.task_uid);

async function keepPending(repo, edit, reason, message) {
    const state = await stateOf(repo.slug);
    const pending = (state.pending || []).filter((p) => !sameEdit(p, edit));
    pending.push({
        ...edit,
        id: edit.id || crypto.randomBytes(6).toString('hex'),
        reason,
        error: git.scrub(message, repo),
        at: new Date().toISOString(),
    });
    await state.update({
        pending: pending.slice(-MAX_PENDING),
        last_error: git.scrub(message, repo),
    });
}

function repoOf(project) {
    const slug = slugFromSourcePath(project.source_path);
    const repo = slug ? findRepo(slug) : null;
    if (!repo) {
        throw new TodoMdError(
            'todo_md_repo_unknown',
            'This repository is no longer configured',
            404
        );
    }
    return repo;
}

// Applies `edit`; when it cannot reach the repository it is kept pending
// and the client gets 409 (conflict) or 503 (unreachable).
async function applyOrKeep(repo, edit) {
    return service.exclusive(sourcePathFor(repo.slug), async () => {
        try {
            return await applyLocked(repo, edit);
        } catch (error) {
            const failure = failureOf(error);
            if (!failure) throw service.asClientError(error);
            await keepPending(repo, edit, failure.reason, error.message);
            throw failure.client;
        }
    });
}

async function createTask(project, { name, note, section, uid }) {
    const repo = repoOf(project);
    const edit = {
        op: 'add',
        section,
        name: String(name ?? '')
            .replace(/\s+/g, ' ')
            .trim(),
        note: note || '',
        // The uid a device chose; the server picks one otherwise.
        uid: uid || null,
    };
    const result = await applyOrKeep(repo, edit);
    return models().Task.findOne({
        where: { project_id: project.id, source_key: result.key },
    });
}

async function setTaskDone(task, project, done) {
    const repo = repoOf(project);
    const fresh = await models().Task.findByPk(task.id);
    await applyOrKeep(repo, {
        op: 'done',
        key: task.source_key,
        name: fresh?.name || task.name || '',
        task_uid: task.uid || fresh?.uid || null,
        done,
    });
    return task.reload().catch(() => task);
}

const requireRepo = (slug) => {
    const repo = findRepo(slug);
    if (!repo) {
        throw new TodoMdError(
            'todo_md_repo_unknown',
            'No repository with this name is configured',
            404
        );
    }
    return repo;
};

// "Retry": the pending edits, oldest first. One that applies is dropped
// from the list; one that still fails stays, with the new reason. Stops at
// the first unreachable one, since the next ones would fail the same way.
async function retry(slug) {
    const repo = requireRepo(slug);
    await service.exclusive(sourcePathFor(slug), async () => {
        const state = await stateOf(slug);
        const remaining = [];
        const queue = [...(state.pending || [])];
        let lastError = null;
        while (queue.length > 0) {
            const edit = queue.shift();
            try {
                await applyLocked(repo, edit);
            } catch (error) {
                const failure = failureOf(error);
                if (!failure && !(error instanceof TodoEditError)) throw error;
                lastError = git.scrub(error.message, repo);
                // An edit the file refuses for another reason (a task now
                // in Done) is a conflict too: only the user can resolve it.
                const reason = failure?.reason || 'conflict';
                remaining.push({
                    ...edit,
                    reason,
                    error: lastError,
                    at: new Date().toISOString(),
                });
                if (reason === 'unreachable') {
                    remaining.push(...queue);
                    break;
                }
            }
        }
        await state.update({ pending: remaining, last_error: lastError });
    });
    return statusOf(repo);
}

// "Discard": forgets the pending edits and reads the repository again.
async function discard(slug) {
    const repo = requireRepo(slug);
    const state = await stateOf(slug);
    await state.update({ pending: [] });
    await syncRepo(repo).catch(() => {});
    return statusOf(repo);
}

async function statusOf(repo) {
    const { Project, TodoMdRepo } = models();
    const state = await TodoMdRepo.findOne({ where: { slug: repo.slug } });
    const project = await Project.findOne({
        where: {
            source_type: service.SOURCE_TYPE,
            source_path: sourcePathFor(repo.slug),
        },
        attributes: ['uid'],
    });
    return {
        slug: repo.slug,
        repo: repo.display,
        branch: repo.branch,
        path: repo.path,
        project_uid: project?.uid || null,
        webhook: Boolean(repo.webhookSecret),
        head_sha: state?.head_sha || null,
        synced_at: state?.synced_at || null,
        last_error: state?.last_error || null,
        pending: (state?.pending || []).map((p) => ({
            id: p.id,
            op: p.op,
            name: p.name,
            done: p.op === 'done' ? p.done : undefined,
            reason: p.reason,
            error: p.error,
            at: p.at,
        })),
    };
}

const statuses = () => Promise.all(configuredRepos().map(statusOf));

module.exports = {
    sourcePathFor,
    syncRepo,
    syncAll,
    createTask,
    setTaskDone,
    retry,
    discard,
    statuses,
    statusOf,
};
