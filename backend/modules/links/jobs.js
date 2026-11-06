'use strict';

// Background work for links: capture (find links in a saved row) and the
// metadata fetch. Neither ever runs inside the request that saved the row,
// so a slow or broken site cannot delay or fail a capture. One fetch at a
// time, spaced, so a burst of links does not hammer anyone; the GitHub API
// rate limit pauses only the GitHub lookups.

const cron = require('node-cron');
const { Op } = require('sequelize');
const { logError } = require('../../services/logService');
const { GithubRateLimited } = require('./core/github');

const DAY_MS = 24 * 60 * 60 * 1000;
// A read page is read again after a month (GitHub stars, last push, README
// move); a page that could not be read is tried again after a week. A few
// per run, so the GitHub hourly limit is never the bottleneck.
const REFRESH_AFTER_DAYS = 30;
const RETRY_FAILED_AFTER_DAYS = 7;
const REFRESH_BATCH = 25;
const REFRESH_CRON = '0 2 * * *';
let refreshJob = null;

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
        // A page read before stays as it was read; the next try is later.
        await link.update({
            fetch_status: link.fetch_status === 'done' ? 'done' : 'failed',
            fetched_at: now,
        });
        return;
    }
    // A reading never erases what an earlier one found (a page that answers
    // without its image this time keeps the image).
    const read = Object.fromEntries(
        Object.entries(meta).filter(([, value]) => value != null)
    );
    // A title fills a gap only: one given at saving (bookmark, add-on) stays.
    if (link.title) delete read.title;
    await link.update({ ...read, fetch_status: 'done', fetched_at: now });
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
        raw: true,
    });
    pending.forEach((l) => enqueueFetch(l.id));
    await captureExisting();
    scheduleRefresh();
}

// Queues the links whose reading is old (done) or worth retrying (failed),
// oldest reading first. Dropped links are left alone. Returns how many.
async function refreshStale(now = new Date()) {
    if (!state.enabled) return 0;
    const { Link } = require('../../models');
    const stale = await Link.findAll({
        where: {
            status: { [Op.ne]: 'dropped' },
            [Op.or]: [
                {
                    fetch_status: 'done',
                    fetched_at: {
                        [Op.lt]: new Date(now - REFRESH_AFTER_DAYS * DAY_MS),
                    },
                },
                {
                    fetch_status: 'failed',
                    fetched_at: {
                        [Op.lt]: new Date(
                            now - RETRY_FAILED_AFTER_DAYS * DAY_MS
                        ),
                    },
                },
            ],
        },
        attributes: ['id'],
        order: [['fetched_at', 'ASC']],
        limit: REFRESH_BATCH,
        raw: true,
    });
    stale.forEach((l) => enqueueFetch(l.id));
    return stale.length;
}

function captureExisting() {
    return require('./capture').captureExisting();
}

function scheduleRefresh() {
    const { getConfig } = require('../../config/config');
    const config = getConfig();
    if (
        refreshJob ||
        config.environment === 'test' ||
        config.disableScheduler
    ) {
        return;
    }
    refreshJob = cron.schedule(
        REFRESH_CRON,
        () =>
            refreshStale().catch((error) =>
                logError({ error }, 'Link refresh failed')
            ),
        { timezone: 'UTC' }
    );
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
    captureExisting,
    refreshStale,
    drain,
};
