'use strict';

// Background work for links: capture (find links in a saved row) and the
// metadata fetch. Neither ever runs inside the request that saved the row,
// so a slow or broken site cannot delay or fail a capture. One fetch at a
// time, spaced, so a burst of links does not hammer anyone; the GitHub API
// rate limit pauses only the GitHub lookups.

const { logError } = require('../../services/logService');
const { GithubRateLimited } = require('./core/github');

const STARTUP_BATCH = 200;

const state = {
    enabled: process.env.NODE_ENV !== 'test',
    spacingMs: 1000,
    fetcher: null,
    queue: [],
    queued: new Set(),
    running: null,
    inflight: new Set(),
    githubPausedUntil: 0,
};

function defaultFetcher() {
    return require('./fetcher').fetchLinkMetadata;
}

function configure(options = {}) {
    if ('enabled' in options) state.enabled = options.enabled;
    if ('spacingMs' in options) state.spacingMs = options.spacingMs;
    if ('fetcher' in options) state.fetcher = options.fetcher;
}

function isEnabled() {
    return state.enabled;
}

function track(promise) {
    state.inflight.add(promise);
    promise.finally(() => state.inflight.delete(promise));
    return promise;
}

// Runs `task` after the transaction commits (or on the next tick without
// one); failures are logged, never thrown at the writer.
function afterWrite(transaction, task) {
    if (!state.enabled) return;
    const run = () =>
        track(
            new Promise((resolve) => setImmediate(resolve))
                .then(task)
                .catch((error) => logError({ error }, 'Link capture failed'))
        );
    if (transaction && typeof transaction.afterCommit === 'function') {
        transaction.afterCommit(run);
    } else {
        run();
    }
}

const sleep = (ms) =>
    ms > 0 ? new Promise((r) => setTimeout(r, ms).unref?.()) : null;

async function fetchAndStore(linkId) {
    const { Link } = require('../../models');
    const link = await Link.findByPk(linkId);
    if (!link) return;
    const fetcher = state.fetcher ?? defaultFetcher();
    let meta;
    try {
        meta = await fetcher(link.url, {
            githubPausedUntil: state.githubPausedUntil,
        });
    } catch (error) {
        if (error instanceof GithubRateLimited) {
            state.githubPausedUntil = error.resetAt;
            const wait = Math.max(error.resetAt - Date.now(), 60 * 1000);
            setTimeout(() => enqueueFetch(linkId), wait).unref?.();
            return;
        }
        logError({ error, linkId }, 'Link metadata fetch failed');
        meta = null;
    }
    const now = new Date();
    if (!meta) {
        await link.update({ fetch_status: 'failed', fetched_at: now });
        return;
    }
    await link.update({ ...meta, fetch_status: 'done', fetched_at: now });
}

async function runQueue() {
    while (state.queue.length > 0) {
        const id = state.queue.shift();
        state.queued.delete(id);
        try {
            await fetchAndStore(id);
        } catch (error) {
            logError({ error, linkId: id }, 'Link metadata store failed');
        }
        if (state.queue.length > 0) await sleep(state.spacingMs);
    }
}

function enqueueFetch(linkId) {
    if (!state.enabled || state.queued.has(linkId)) return;
    state.queue.push(linkId);
    state.queued.add(linkId);
    if (!state.running) {
        state.running = track(
            runQueue().finally(() => {
                state.running = null;
            })
        );
    }
}

// Links still waiting for their metadata when the server stopped.
async function initialize() {
    if (!state.enabled) return;
    const { Link } = require('../../models');
    const pending = await Link.findAll({
        where: { fetch_status: 'pending' },
        attributes: ['id'],
        order: [['id', 'ASC']],
        limit: STARTUP_BATCH,
        raw: true,
    });
    pending.forEach((l) => enqueueFetch(l.id));
}

// Waits until no capture or fetch is left (tests).
async function drain() {
    while (state.inflight.size > 0) {
        await Promise.allSettled([...state.inflight]);
    }
}

module.exports = {
    configure,
    isEnabled,
    afterWrite,
    enqueueFetch,
    fetchAndStore,
    initialize,
    drain,
};
