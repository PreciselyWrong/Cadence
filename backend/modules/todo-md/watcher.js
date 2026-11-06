'use strict';

const fs = require('fs');
const path = require('path');
const service = require('./service');
const repos = require('./repos');
const { configuredRepos, invalidSlugs } = require('./repoConfig');
const { resolveRoot, listProjectFolders, FILE_NAME } = require('./paths');
const { logInfo, logError } = require('../../services/logService');

// Files are the source of truth and can change at any time (git pull, an
// editor). Bind mounts do not always emit change events, so a poll every
// POLL_MS compares each file's size and modification time; fs.watch only
// makes the reaction faster when the platform does deliver events.
const POLL_MS = 30_000;
const DEBOUNCE_MS = 750;
const REPO_POLL_MS = 5 * 60_000;

let timer = null;
let repoTimer = null;
let debounce = null;
let signatures = new Map();
let watchers = new Map();
let running = false;

const signatureOf = (stat) => `${stat.mtimeMs}:${stat.size}`;

async function currentSignatures(root) {
    const next = new Map();
    for (const folder of await listProjectFolders(root)) {
        try {
            const stat = await fs.promises.stat(
                path.join(root, folder, FILE_NAME)
            );
            next.set(folder, signatureOf(stat));
        } catch {
            // The file vanished between the listing and the stat.
        }
    }
    return next;
}

function changed(before, after) {
    if (before.size !== after.size) return true;
    for (const [folder, signature] of after) {
        if (before.get(folder) !== signature) return true;
    }
    return false;
}

function watchFolders(root, folders) {
    for (const [folder, handle] of watchers) {
        if (!folders.includes(folder)) {
            handle.close();
            watchers.delete(folder);
        }
    }
    for (const folder of folders) {
        if (watchers.has(folder)) continue;
        try {
            const handle = fs.watch(
                path.join(root, folder),
                { persistent: false },
                () => schedule()
            );
            handle.on('error', () => {
                handle.close();
                watchers.delete(folder);
            });
            watchers.set(folder, handle);
        } catch {
            // The poll still covers it.
        }
    }
}

// One import pass under the job lock (one process at a time on PostgreSQL).
async function scan({ force = false } = {}) {
    const root = await resolveRoot(service.settings().root);
    if (!root) return null;
    const { withJobLock } = require('../../services/jobLock');
    await withJobLock('todo-md-export', () => service.exportTagged());
    const after = await currentSignatures(root);
    watchFolders(root, [...after.keys()]);
    if (!force && !changed(signatures, after)) return null;

    const outcome = await withJobLock('todo-md-import', () =>
        service.importAll()
    );
    // The signatures are taken after the import: a write the import itself
    // made (never the case today) would not trigger another pass.
    signatures = after;
    return outcome.ran ? outcome.result : null;
}

async function safeScan(options) {
    if (running) return null;
    running = true;
    try {
        return await scan(options);
    } catch (error) {
        logError('TODO.md scan failed:', error);
        return null;
    } finally {
        running = false;
    }
}

function schedule() {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
        debounce = null;
        safeScan();
    }, DEBOUNCE_MS);
    debounce.unref();
}

const mergeSummaries = (summaries) =>
    summaries.reduce(
        (all, one) => ({
            projects: all.projects + one.projects,
            created: all.created + one.created,
            updated: all.updated + one.updated,
            removed: all.removed + one.removed,
            errors: [...all.errors, ...one.errors],
        }),
        { projects: 0, created: 0, updated: 0, removed: 0, errors: [] }
    );

// "Relire": always reads, whether or not a signature moved. The
// repositories are read even when the folder root is unreachable.
async function rescanNow() {
    const summaries = [];
    let failure = null;
    if (service.hasRoot()) {
        const root = await resolveRoot(service.settings().root);
        if (root) signatures = await currentSignatures(root);
        try {
            await service.exportTagged();
            summaries.push(await service.importAll());
        } catch (error) {
            failure = error;
        }
    }
    if (configuredRepos().length > 0) summaries.push(await repos.syncAll());
    if (failure) throw failure;
    return mergeSummaries(summaries);
}

// Pushes reach the server through the webhook; this pass catches the ones
// it missed (no webhook, server down at the time).
async function syncRepos() {
    try {
        const { withJobLock } = require('../../services/jobLock');
        await withJobLock('todo-md-git', () => repos.syncAll());
    } catch (error) {
        logError('TODO.md repository sync failed:', error);
    }
}

function start() {
    if (timer || repoTimer || !service.isEnabled()) return;
    logInfo('TODO.md projects enabled');
    if (service.hasRoot()) {
        safeScan({ force: true });
        timer = setInterval(() => safeScan(), POLL_MS);
        timer.unref();
    }
    if (configuredRepos().length > 0) {
        for (const slug of invalidSlugs()) {
            logError(
                `TODO.md repository "${slug}" is not configured completely`
            );
        }
        syncRepos();
        repoTimer = setInterval(() => syncRepos(), REPO_POLL_MS);
        repoTimer.unref();
    }
}

function stop() {
    if (timer) clearInterval(timer);
    if (repoTimer) clearInterval(repoTimer);
    if (debounce) clearTimeout(debounce);
    timer = null;
    repoTimer = null;
    debounce = null;
    for (const handle of watchers.values()) handle.close();
    watchers = new Map();
    signatures = new Map();
}

module.exports = { start, stop, scan: safeScan, rescanNow };
