'use strict';

// Site icons for the origin badge of a task (docs/00-tasks-behavior.md,
// Origin badge). The server reads them, never the browser or the phone, so a
// site learns nothing about who looks at the task. Read directly (SSRF guard
// on every hop), kept in memory by host: a found icon for a week, a missing
// one for an hour. SVG is refused: served from this origin it could run
// script when opened on its own.

const https = require('https');
const http = require('http');
const { assertSafeUrl, publicOnlyLookup } = require('../url/ssrfGuard');
const { logError } = require('../../services/logService');

const HOUR_MS = 60 * 60 * 1000;
const FOUND_FOR_MS = 7 * 24 * HOUR_MS;
const MISSING_FOR_MS = HOUR_MS;
const MAX_ENTRIES = 500;
const MAX_ICON_BYTES = 100 * 1024;
const MAX_PAGE_BYTES = 60 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 4000;

const IMAGE_TYPES = new Set([
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'image/png',
    'image/gif',
    'image/jpeg',
    'image/webp',
]);

const state = { fetcher: null, cache: new Map(), inflight: new Map() };

function configure(options = {}) {
    if ('fetcher' in options) state.fetcher = options.fetcher;
}

function clear() {
    state.cache.clear();
    state.inflight.clear();
}

// A public host name: letters, digits, dots and dashes, at least one dot.
function hostOf(raw) {
    if (typeof raw !== 'string') return null;
    const host = raw.trim().toLowerCase();
    if (host.length > 253 || !host.includes('.')) return null;
    if (
        !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
            host
        )
    ) {
        return null;
    }
    return host;
}

// One GET, redirects followed and checked, body capped. Resolves
// { status, type, body } and never throws.
function fetchCapped(url, maxBytes, redirects = 0) {
    return assertSafeUrl(url)
        .then(
            (parsed) =>
                new Promise((resolve) => {
                    const client = parsed.protocol === 'https:' ? https : http;
                    const req = client.get(
                        parsed,
                        {
                            lookup: publicOnlyLookup,
                            timeout: TIMEOUT_MS,
                            headers: {
                                'User-Agent':
                                    'Mozilla/5.0 (compatible; Cadence)',
                                Accept: 'image/*,text/html;q=0.8',
                            },
                        },
                        (res) => {
                            const type = String(
                                res.headers['content-type'] ?? ''
                            );
                            if (
                                [301, 302, 303, 307, 308].includes(
                                    res.statusCode
                                ) &&
                                res.headers.location &&
                                redirects < MAX_REDIRECTS
                            ) {
                                res.resume();
                                const next = new URL(
                                    res.headers.location,
                                    parsed
                                ).href;
                                resolve(
                                    fetchCapped(next, maxBytes, redirects + 1)
                                );
                                return;
                            }
                            const chunks = [];
                            let size = 0;
                            res.on('data', (chunk) => {
                                size += chunk.length;
                                if (size > maxBytes) {
                                    res.destroy();
                                    resolve({ status: 413, type, body: null });
                                    return;
                                }
                                chunks.push(chunk);
                            });
                            res.on('end', () =>
                                resolve({
                                    status: res.statusCode,
                                    type,
                                    body: Buffer.concat(chunks),
                                    url: parsed.href,
                                })
                            );
                            res.on('error', () =>
                                resolve({ status: 0, type, body: null })
                            );
                        }
                    );
                    req.on('timeout', () => req.destroy());
                    req.on('error', () =>
                        resolve({ status: 0, type: '', body: null })
                    );
                })
        )
        .catch(() => ({ status: 0, type: '', body: null }));
}

const fetcher = () => state.fetcher ?? fetchCapped;

function imageOf(answer) {
    if (!answer || answer.status !== 200 || !answer.body?.length) return null;
    const type = answer.type.split(';')[0].trim().toLowerCase();
    return IMAGE_TYPES.has(type) ? { type, body: answer.body } : null;
}

// The icon a page names in its <head>: rel "icon", "shortcut icon" or
// "apple-touch-icon", first one wins.
function iconHrefOf(html) {
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
        const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] ?? '';
        if (!/(^|\s)(icon|apple-touch-icon)(\s|$)/i.test(rel)) continue;
        const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
        if (href) return href;
    }
    return null;
}

async function read(host) {
    const get = fetcher();
    const direct = imageOf(
        await get(`https://${host}/favicon.ico`, MAX_ICON_BYTES)
    );
    if (direct) return direct;
    const page = await get(`https://${host}/`, MAX_PAGE_BYTES);
    if (page?.status !== 200 || !page.body) return null;
    const href = iconHrefOf(page.body.toString('utf8'));
    if (!href) return null;
    let iconUrl;
    try {
        iconUrl = new URL(href, page.url ?? `https://${host}/`).href;
    } catch {
        return null;
    }
    if (!/^https?:/i.test(iconUrl)) return null;
    return imageOf(await get(iconUrl, MAX_ICON_BYTES));
}

function remember(host, icon) {
    if (state.cache.size >= MAX_ENTRIES) {
        state.cache.delete(state.cache.keys().next().value);
    }
    state.cache.set(host, { icon, at: Date.now() });
}

// The icon of a host as { type, body }, or null when it has none.
async function faviconOf(host, now = Date.now()) {
    const cached = state.cache.get(host);
    if (cached) {
        const ttl = cached.icon ? FOUND_FOR_MS : MISSING_FOR_MS;
        if (now - cached.at < ttl) return cached.icon;
    }
    if (!state.inflight.has(host)) {
        const pending = read(host)
            .catch((error) => {
                logError({ error, host }, 'Favicon read failed');
                return null;
            })
            .then((icon) => {
                remember(host, icon);
                return icon;
            })
            .finally(() => state.inflight.delete(host));
        state.inflight.set(host, pending);
    }
    return state.inflight.get(host);
}

module.exports = {
    configure,
    clear,
    hostOf,
    faviconOf,
    iconHrefOf,
    FOUND_FOR_MS,
};
