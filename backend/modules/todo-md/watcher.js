'use strict';

const fs = require('fs');
const path = require('path');
const service = require('./service');
const { resolveRoot, listProjectFolders, FILE_NAME } = require('./paths');
const { logInfo, logError } = require('../../services/logService');

// Files are the source of truth and can change at any time (git pull, an
// editor). Bind mounts do not always emit change events, so a poll every
// POLL_MS compares each file's size and modification time; fs.watch only
// makes the reaction faster when the platform does deliver events.
const POLL_MS = 30_000;
const DEBOUNCE_MS = 750;

let timer = null;
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
    const after = await currentSignatures(root);
    watchFolders(root, [...after.keys()]);
    if (!force && !changed(signatures, after)) return null;

    const { withJobLock } = require('../../services/jobLock');
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

// "Relire": always reads, whether or not a signature moved.
async function rescanNow() {
    const root = await resolveRoot(service.settings().root);
    if (root) signatures = await currentSignatures(root);
    return service.importAll();
}

function start() {
    if (timer || !service.isEnabled()) return;
    logInfo('TODO.md projects enabled');
    safeScan({ force: true });
    timer = setInterval(() => safeScan(), POLL_MS);
    timer.unref();
}

function stop() {
    if (timer) clearInterval(timer);
    if (debounce) clearTimeout(debounce);
    timer = null;
    debounce = null;
    for (const handle of watchers.values()) handle.close();
    watchers = new Map();
    signatures = new Map();
}

module.exports = { start, stop, scan: safeScan, rescanNow };
