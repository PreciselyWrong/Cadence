'use strict';

// Previews of web pages, kept by normalized address (docs/37-links.md,
// Previews). A task note, a note or a project page shows the same row; the
// page is read once, directly (SSRF guard, no reading proxy) plus the GitHub
// API for a repository, then again after a month. A failed read is tried
// again after an hour; a new read never erases what an earlier one found.

const { logError } = require('../../services/logService');
const { GithubRateLimited } = require('./core/github');
const { addressKey, classifyKind, isContextUrl } = require('./core/urls');

const HOUR_MS = 60 * 60 * 1000;
const REFRESH_AFTER_MS = 30 * 24 * HOUR_MS;
const RETRY_FAILED_AFTER_MS = HOUR_MS;

const state = { fetcher: null, inflight: new Map(), githubPausedUntil: 0 };

function configure(options = {}) {
    if ('fetcher' in options) state.fetcher = options.fetcher;
}

const fetcher = () => state.fetcher ?? require('./fetcher').fetchLinkMetadata;

// The address as a page: a missing scheme reads as https.
function addressOf(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const text = raw.trim();
    return addressKey(/^https?:\/\//i.test(text) ? text : `https://${text}`);
}

function isFresh(row, now) {
    const age = now - new Date(row.fetched_at).getTime();
    return row.fetch_status === 'done'
        ? age < REFRESH_AFTER_MS
        : age < RETRY_FAILED_AFTER_MS;
}

async function read(url) {
    try {
        return await fetcher()(url, {
            githubPausedUntil: state.githubPausedUntil,
        });
    } catch (error) {
        if (error instanceof GithubRateLimited) {
            state.githubPausedUntil = error.resetAt;
        } else {
            logError({ error, url }, 'Link preview read failed');
        }
        return null;
    }
}

async function refresh(url, row) {
    const { LinkPreview } = require('../../models');
    const meta = await read(url);
    const now = new Date();
    if (!meta) {
        // A page read before stays as it was read.
        const failed = {
            fetch_status: row?.fetch_status === 'done' ? 'done' : 'failed',
            fetched_at: now,
        };
        if (row) return row.update(failed);
        return LinkPreview.create({ url, kind: classifyKind(url), ...failed });
    }
    const found = Object.fromEntries(
        Object.entries(meta).filter(([, value]) => value != null)
    );
    const fields = { ...found, fetch_status: 'done', fetched_at: now };
    if (row) return row.update(fields);
    return LinkPreview.create({ url, kind: classifyKind(url), ...fields });
}

// The preview row of an address, read when missing or stale; null for an
// address that is no public web page. Concurrent asks share one read.
async function previewOf(raw, now = Date.now()) {
    const url = addressOf(raw);
    if (!url || isContextUrl(url)) return null;
    const { LinkPreview } = require('../../models');
    const row = await LinkPreview.findOne({ where: { url } });
    if (row && isFresh(row, now)) return row;
    if (!state.inflight.has(url)) {
        const pending = refresh(url, row)
            .catch(async (error) => {
                // Saved meanwhile by another server process.
                if (error.name !== 'SequelizeUniqueConstraintError') {
                    throw error;
                }
                return LinkPreview.findOne({ where: { url } });
            })
            .finally(() => state.inflight.delete(url));
        state.inflight.set(url, pending);
    }
    return state.inflight.get(url);
}

const iso = (value) =>
    value instanceof Date ? value.toISOString() : (value ?? null);

// The answer of GET /url/title: what the page says, and `error` when
// nothing could be read.
function serializePreview(input, row) {
    const kind = row?.kind ?? classifyKind(addressOf(input) ?? '');
    const answer = {
        url: input,
        title: row?.title ?? null,
        image: row?.image_url ?? null,
        description: row?.description ?? null,
        site_name: row?.site_name ?? null,
        kind,
        github_stars: row?.github_stars ?? null,
        github_language: row?.github_language ?? null,
        github_last_commit: iso(row?.github_last_commit),
    };
    if (!answer.title) answer.error = 'Could not extract metadata';
    return answer;
}

module.exports = { configure, previewOf, serializePreview, addressOf };
