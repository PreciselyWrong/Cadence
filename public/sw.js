/* global importScripts */
// v2: manifest.json gained a share_target member, and the static cache is
// cache-first — existing installs need the stale copy evicted to pick it up
// v3: push notifications
// v4: offline web UI (docs/fork/WEB-OFFLINE.md): the build's shell is
// precached, API answers come from the cache with the pending writes laid
// over them, and the writes are replayed with their edit time.
// The build replaces CACHE_VERSION and BUILD_ASSETS (webpack.config.js).
const CACHE_VERSION = 'tududi-v4';
const BUILD_ASSETS = [];
const API_CACHE = 'tududi-api-v1';

const DB_NAME = 'tududi-offline';
const DB_VERSION = 2;
const OUTBOX = 'tududi-sync-queue';
const REJECTED = 'tududi-rejected';
const META = 'tududi-meta';

// A Tailscale peer that is off does not refuse connections, it just never
// answers: without a deadline every read would hang for a minute.
const READ_TIMEOUT_MS = 4000;
const WRITE_TIMEOUT_MS = 15000;
// A write the server keeps failing on (500) is set aside after this many
// tries so it does not block the ones queued after it.
const MAX_ATTEMPTS = 3;

// Requests with nothing worth replaying later, or that only make sense
// online: stateless reads that use a POST body, sessions, push
// subscriptions (they belong to the device and session at the time they
// are made), AI and outside services.
const NO_QUEUE_PATHS = [
    '/api/inbox/analyze-text',
    '/api/push/',
    '/api/login',
    '/api/logout',
    '/api/register',
    '/api/auth/',
    '/api/csrf-token',
    '/api/assistant',
    '/api/ai/',
    '/api/auto-classify',
    '/api/url/',
    '/api/caldav',
    '/api/google',
    '/api/calendar-feeds',
    '/api/telegram',
    '/api/mcp',
    '/api/admin',
    '/api/billing',
];

// The development build registers this worker as /sw.js?push-only so push
// notifications can be tried on the dev server. In that mode nothing is
// cached and no request is intercepted, so hot reloading keeps serving
// fresh code.
const PUSH_ONLY = new URL(self.location.href).searchParams.has('push-only');

if (!PUSH_ONLY) importScripts('offline-core.js');
const core = self.OfflineCore;

const STATIC_ASSETS = [
    '',
    'manifest.json',
    'favicon.ico',
    'apple-touch-icon.png',
    'icon-logo.png',
];

// Latched after a request fails to reach the server; cleared by the next
// answer or probe that does. While set, reads are answered locally at once.
let offline = false;
let replaying = null;

const scopeUrl = (path) =>
    new URL(
        path,
        (self.registration && self.registration.scope) ||
            `${self.location.origin}/`
    ).href;

// ─── Install ────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
    if (PUSH_ONLY) {
        self.skipWaiting();
        return;
    }
    // One missing file must not leave the whole shell uncached.
    event.waitUntil(
        caches
            .open(CACHE_VERSION)
            .then((cache) =>
                Promise.allSettled(
                    [...STATIC_ASSETS, ...BUILD_ASSETS].map((path) =>
                        cache.add(scopeUrl(path))
                    )
                )
            )
    );
    self.skipWaiting();
});

// ─── Activate ───────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter(
                            (key) => key !== CACHE_VERSION && key !== API_CACHE
                        )
                        .map((key) => caches.delete(key))
                )
            )
    );
    self.clients.claim();
});

// ─── Message handler ─────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
    const { type, sessionId } = event.data || {};
    const reply = (promise) =>
        event.waitUntil(
            promise.then(async () => {
                if (event.source)
                    event.source.postMessage(await stateMessage());
            })
        );

    if (type === 'SKIP_WAITING') {
        self.skipWaiting();
        return;
    }
    if (PUSH_ONLY) return;
    if (type === 'SESSION_UPDATE') {
        event.waitUntil(
            metaSet('session', sessionId ? String(sessionId) : null).then(() =>
                offline ? undefined : replay()
            )
        );
        return;
    }
    if (type === 'CLEAR_CACHE') {
        event.waitUntil(clearUserData());
        return;
    }
    if (type === 'GET_STATE') {
        reply(Promise.resolve());
        return;
    }
    if (type === 'PROBE') {
        reply(probe());
        return;
    }
    if (type === 'REPLAY') {
        reply(replay());
        return;
    }
    if (type === 'DISMISS_REJECTED') {
        reply(idbClear(REJECTED));
    }
});

// Sign-out or an expired session: the cached answers go, so the next
// person on this browser cannot read them. Writes not sent yet stay: they
// carry their user's id and are only ever sent for that user, so an expired
// session does not lose what was typed offline.
async function clearUserData() {
    await metaSet('session', null);
    await caches.delete(API_CACHE);
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
    if (PUSH_ONLY) return;

    const { request } = event;
    const url = new URL(request.url);

    if (url.origin !== self.location.origin) return;

    // A shared note stops working the moment its owner turns sharing off, so
    // it must never be answered from a cache.
    if (url.pathname.includes('/api/public/')) return;

    // File uploads go straight to the network. WebKit (every iOS browser)
    // loses the file part of a FormData body when a service worker re-sends
    // the request, so the server gets a cut-off form. They could not be
    // queued offline anyway: the queue stores bodies as text.
    const contentType = request.headers.get('content-type') || '';
    if (contentType.startsWith('multipart/form-data')) return;

    if (url.pathname.includes('/api/')) {
        if (request.method === 'GET') {
            event.respondWith(handleApiGet(request));
        } else if (NO_QUEUE_PATHS.some((p) => url.pathname.includes(p))) {
            event.respondWith(handleApiNoQueue(request));
        } else {
            event.respondWith(handleApiMutation(request));
        }
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(handleNavigate(request));
        return;
    }

    event.respondWith(handleStatic(request));
});

async function fetchWithTimeout(request, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(request, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Resolves to the answer when the server was reached, null when it was not.
async function reachServer(request, ms) {
    if (offline) return null;
    try {
        const response = await fetchWithTimeout(request, ms);
        if (!core.isUnreachableStatus(response.status)) {
            markOnline();
            return response;
        }
    } catch {
        // network error or timeout
    }
    markOffline();
    return null;
}

function markOffline() {
    if (offline) return;
    offline = true;
    broadcastState();
}

function markOnline() {
    if (!offline) return;
    offline = false;
    broadcastState();
    replay();
}

async function handleNavigate(request) {
    const response = await reachServer(request, READ_TIMEOUT_MS);
    if (response) return response;
    const shell = await caches.match(scopeUrl(''));
    return shell || offlineError();
}

async function handleStatic(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') {
        const clone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
    }
    return response;
}

const jsonResponse = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    });

const offlineError = () =>
    jsonResponse({ error: 'Offline', offline: true }, 503);

const OFFLINE_HEADERS = { 'X-Cadence-Offline': '1' };

async function readJson(response) {
    const type = response.headers.get('content-type') || '';
    if (!type.includes('json')) return undefined;
    try {
        return await response.clone().json();
    } catch {
        return undefined;
    }
}

// ─── API GET: network first, local answer when the server is unreachable ────

async function handleApiGet(request) {
    const response = await reachServer(request, READ_TIMEOUT_MS);
    if (!response) return localAnswer(request);

    // A 401 means the session expired or a different user is now active.
    // Clear cached data so the next user cannot see stale responses.
    if (response.status === 401) {
        clearUserData().then(() => {
            self.clients
                .matchAll({ type: 'window' })
                .then((clients) =>
                    clients.forEach((client) =>
                        client.postMessage({ type: 'AUTH_EXPIRED' })
                    )
                );
        });
        return response;
    }

    // A 403 only means this user cannot see this one resource (a
    // restricted project, for example). Keep the rest of the cache and
    // the offline queue, and drop just this response so it does not stay
    // readable offline.
    if (response.status === 403) {
        await caches
            .open(API_CACHE)
            .then((cache) => cache.delete(request))
            .catch(() => undefined);
        return response;
    }

    if (!response.ok) return response;
    const cache = await caches.open(API_CACHE);
    await cache.put(request, response.clone());

    // Writes still waiting for the replay must not vanish from the screen
    // when a fresh answer arrives.
    const entries = await pendingEntries();
    if (entries.length === 0) return response;
    const body = await readJson(response);
    if (body === undefined) return response;
    const answer = core.applyOverlay(body, request.url, entries);
    return answer === null
        ? jsonResponse({ error: 'Not found' }, 404)
        : jsonResponse(answer, 200);
}

async function localAnswer(request) {
    const entries = await pendingEntries();
    const cached = await caches.match(request, { cacheName: API_CACHE });
    let body;
    if (cached) {
        body = await readJson(cached);
        if (body === undefined) return cached;
    } else {
        const uid = core.detailUid(request.url);
        if (uid) body = await findRow(uid, entries);
        if (body === undefined || body === null) return offlineError();
    }
    const answer = core.applyOverlay(body, request.url, entries);
    return answer === null
        ? jsonResponse({ error: 'Not found', offline: true }, 404)
        : jsonResponse(answer, 200, OFFLINE_HEADERS);
}

// A row read on its own offline: made offline, or found in any cached
// answer that lists it.
async function findRow(uid, entries) {
    const made = entries.find(
        (e) => e.op && e.op.kind === 'create' && e.op.uid === uid && e.synth
    );
    if (made) return made.synth;
    const cache = await caches.open(API_CACHE);
    const answers = [];
    for (const key of await cache.keys()) {
        const response = await cache.match(key);
        const body = response && (await readJson(response));
        if (body !== undefined) answers.push(body);
    }
    return core.findByUid(answers, uid);
}

// ─── API calls that are never queued ─────────────────────────────────────────

async function handleApiNoQueue(request) {
    try {
        const response = await fetchWithTimeout(request, WRITE_TIMEOUT_MS);
        if (!core.isUnreachableStatus(response.status)) return response;
    } catch {
        // fall through
    }
    return offlineError();
}

// ─── API writes: straight through when online, otherwise the outbox ──────────

// Sensitive headers that must not be persisted; the browser re-attaches
// session cookies automatically when replaying via fetch().
const SENSITIVE_HEADERS = new Set([
    'authorization',
    'cookie',
    'cookie2',
    'x-auth-token',
]);

function safeHeaders(headers) {
    const out = {};
    for (const [k, v] of headers.entries()) {
        if (!SENSITIVE_HEADERS.has(k.toLowerCase())) out[k] = v;
    }
    return out;
}

async function handleApiMutation(request) {
    const body = await request
        .clone()
        .text()
        .catch(() => '');
    const op = core.describeMutation(request.method, request.url);
    // A create that times out may still have reached the server: the key
    // lets its replay get the first answer instead of a second row.
    const key = request.method === 'POST' ? newKey() : null;

    if (!offline && (await idbCount(OUTBOX)) === 0) {
        const headers = safeHeaders(request.headers);
        if (key) headers['Idempotency-Key'] = key;
        const response = await reachServer(
            new Request(request.url, {
                method: request.method,
                headers,
                body: body || undefined,
                credentials: 'include',
            }),
            WRITE_TIMEOUT_MS
        );
        if (response) return response;
    }
    // Offline, or earlier writes still waiting: this one goes after them.
    const entry = await enqueue(request, body, op, key);
    if (!offline) replay();
    return answerQueued(entry);
}

function newKey() {
    return `web-${core.newUid()}${core.newUid()}`;
}

// One at a time, so clocks, temporary ids and queue order follow the order
// the writes were made in.
let serial = Promise.resolve();
const inOrder = (fn) => {
    const run = serial.then(fn);
    serial = run.catch(() => undefined);
    return run;
};

function enqueue(request, body, op, key) {
    return inOrder(async () => {
        const now = Date.now();
        const entry = {
            url: request.url,
            method: request.method,
            headers: safeHeaders(request.headers),
            body,
            sessionId: await metaGet('session'),
            timestamp: now,
            key,
            clock: await nextClock(now),
            op: { ...op },
            attempts: 0,
        };
        if (op.kind === 'create') {
            const parsed = parseJson(body);
            entry.op.uid = core.newUid();
            entry.op.tempId = await nextTempId(now);
            entry.synth = core.synthesizeCreate(op.entity, parsed, {
                uid: entry.op.uid,
                tempId: entry.op.tempId,
                now: new Date(now).toISOString(),
            });
        }
        entry.id = await idbAdd(OUTBOX, entry);
        if (self.registration && 'sync' in self.registration) {
            self.registration.sync
                .register('tududi-sync')
                .catch(() => undefined);
        }
        broadcastState();
        return entry;
    });
}

function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

// Every offline write is stamped with when it was made, so the server can
// tell it from a newer change made elsewhere (backend/modules/sync).
async function nextClock(now) {
    let node = await metaGet('node');
    if (!node) {
        node = `web-${core.newUid().slice(0, 8)}`;
        await metaSet('node', node);
    }
    const last = (await metaGet('clock')) || { ms: 0, counter: 0 };
    const next =
        now > last.ms
            ? { ms: now, counter: 0 }
            : { ms: last.ms, counter: last.counter + 1 };
    await metaSet('clock', next);
    return core.formatClock(next.ms, next.counter, node);
}

async function nextTempId(now) {
    const last = (await metaGet('tempId')) || 0;
    const id = Math.min(-now, last - 1);
    await metaSet('tempId', id);
    return id;
}

async function answerQueued(entry) {
    const { op } = entry;
    if (op.kind === 'create') {
        return jsonResponse(entry.synth, 201, OFFLINE_HEADERS);
    }
    if (op.kind === 'update') {
        const entries = await pendingEntries();
        const row = (await findRow(op.uid, entries)) || { uid: op.uid };
        return jsonResponse(
            core.applyOverlay(row, entry.url, entries) || row,
            200,
            OFFLINE_HEADERS
        );
    }
    if (op.kind === 'delete') {
        return jsonResponse({ offline: true }, 200, OFFLINE_HEADERS);
    }
    // Rows the client names itself (habit rows) can be answered as sent.
    const sent = parseJson(entry.body);
    if (sent && typeof sent === 'object' && typeof sent.uid === 'string') {
        return jsonResponse(sent, 200, OFFLINE_HEADERS);
    }
    return jsonResponse({ queued: true, offline: true }, 202, {
        'X-Tududi-Queued': '1',
    });
}

// ─── Replay ──────────────────────────────────────────────────────────────────

self.addEventListener('sync', (event) => {
    if (event.tag === 'tududi-sync') {
        event.waitUntil(replay());
    }
});

async function probe() {
    try {
        const response = await fetchWithTimeout(
            new Request(scopeUrl('api/health')),
            READ_TIMEOUT_MS
        );
        if (core.isUnreachableStatus(response.status)) markOffline();
        else {
            markOnline();
            await replay();
        }
    } catch {
        markOffline();
    }
}

function replay() {
    if (!replaying) {
        replaying = runReplay().finally(() => {
            replaying = null;
        });
    }
    return replaying;
}

const isMine = (entry, user) =>
    entry.sessionId == null || user == null || entry.sessionId === user;

async function freshCsrfToken() {
    try {
        const response = await fetchWithTimeout(
            new Request(scopeUrl('api/csrf-token'), { credentials: 'include' }),
            READ_TIMEOUT_MS
        );
        if (!response.ok) return null;
        return (await response.json()).csrfToken || null;
    } catch {
        return null;
    }
}

function replayRequest(entry, csrf) {
    const headers = { ...entry.headers };
    for (const name of Object.keys(headers)) {
        if (name.toLowerCase() === 'x-csrf-token') delete headers[name];
    }
    if (csrf) headers['x-csrf-token'] = csrf;
    if (entry.key) headers['Idempotency-Key'] = entry.key;
    if (entry.clock) headers['X-Cadence-Offline-Clock'] = entry.clock;
    if (entry.op && entry.op.kind === 'create' && entry.op.uid) {
        headers['X-Cadence-Create-Uid'] = entry.op.uid;
    }
    return new Request(entry.url, {
        method: entry.method,
        headers,
        body: entry.body || undefined,
        credentials: 'include',
    });
}

async function runReplay() {
    const user = await metaGet('session');
    const idMap = (await metaGet('idMap')) || {};
    const result = { applied: 0, rejected: 0, stopped: null };
    let csrf;

    outer: for (;;) {
        const entries = (await idbAll(OUTBOX))
            .filter((e) => isMine(e, user))
            .sort((a, b) => a.id - b.id);
        if (entries.length === 0) break;
        if (csrf === undefined) csrf = await freshCsrfToken();

        for (const stored of entries) {
            const entry = core.rewriteTempIds(stored, idMap);
            let response;
            try {
                response = await fetchWithTimeout(
                    replayRequest(entry, csrf),
                    WRITE_TIMEOUT_MS
                );
            } catch {
                response = null;
            }
            if (!response || core.isUnreachableStatus(response.status)) {
                markOffline();
                result.stopped = 'offline';
                break outer;
            }
            offline = false;
            const { status } = response;
            if (status === 401) {
                result.stopped = 'auth';
                break outer;
            }
            // The first try of this create is still running on the server.
            if (
                status === 409 &&
                (await readJson(response))?.code === 'CONFLICT'
            ) {
                result.stopped = 'busy';
                break outer;
            }
            const gone = status === 404 && entry.method === 'DELETE';
            if (response.ok || gone) {
                if (entry.op && entry.op.kind === 'create') {
                    const made = await readJson(response);
                    if (made && made.id !== undefined) {
                        idMap[String(entry.op.tempId)] = made.id;
                        await metaSet('idMap', idMap);
                    }
                }
                await idbDelete(OUTBOX, stored.id);
                result.applied += 1;
                continue;
            }
            const attempts = (stored.attempts || 0) + 1;
            if (status >= 500 && attempts < MAX_ATTEMPTS) {
                await idbPut(OUTBOX, { ...stored, attempts });
                result.stopped = 'error';
                break outer;
            }
            // Refused for good (4xx: validation, gone, no access, stale
            // ETag) or failing every time: set aside so the user can see it.
            const reply = await readJson(response);
            await idbPut(REJECTED, {
                ...stored,
                status,
                error: (reply && reply.error) || null,
                rejected_at: Date.now(),
            });
            await idbDelete(OUTBOX, stored.id);
            result.rejected += 1;
        }
    }

    if ((await idbCount(OUTBOX)) === 0) await metaSet('idMap', {});
    const clients = await self.clients.matchAll({ type: 'window' });
    const state = await stateMessage();
    clients.forEach((client) => {
        client.postMessage({ type: 'SYNC_COMPLETE', ...result });
        client.postMessage(state);
    });
    return result;
}

// ─── State shown by the page ─────────────────────────────────────────────────

async function pendingEntries() {
    const user = await metaGet('session');
    return (await idbAll(OUTBOX))
        .filter((e) => isMine(e, user))
        .sort((a, b) => a.id - b.id);
}

async function stateMessage() {
    const rejected = await idbAll(REJECTED);
    return {
        type: 'OFFLINE_STATE',
        offline,
        pending: (await pendingEntries()).length,
        rejected: rejected.map((e) => ({
            id: e.id,
            method: e.method,
            url: e.url,
            status: e.status,
            error: e.error,
            entity: e.op ? e.op.entity : null,
            name: rowName(e),
        })),
    };
}

function rowName(entry) {
    const row = entry.synth || parseJson(entry.body);
    if (!row || typeof row !== 'object') return null;
    return row.name || row.title || row.content || null;
}

function broadcastState() {
    stateMessage()
        .then((state) =>
            self.clients
                .matchAll({ type: 'window' })
                .then((clients) => clients.forEach((c) => c.postMessage(state)))
        )
        .catch(() => undefined);
}

// ─── Push notifications ──────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch {
        payload = { body: event.data ? event.data.text() : '' };
    }

    // Always show something: iOS revokes the subscription of a site that
    // receives a push without displaying a notification.
    const title = payload.title || 'Cadence';
    event.waitUntil(
        self.registration.showNotification(title, {
            body: payload.body || '',
            icon: '/icon-logo.png',
            badge: '/favicon-48.png',
            tag: payload.tag || undefined,
            data: { url: payload.url || '/' },
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL(
        event.notification.data?.url || '/',
        self.location.origin
    );
    // Only ever open pages of this app.
    const url =
        target.origin === self.location.origin
            ? target.href
            : self.location.origin;

    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then(async (windows) => {
                const existing = windows.find(
                    (client) =>
                        new URL(client.url).origin === self.location.origin
                );
                if (existing) {
                    await existing.focus();
                    if ('navigate' in existing) {
                        return existing.navigate(url).catch(() => undefined);
                    }
                    return undefined;
                }
                return self.clients.openWindow(url);
            })
    );
});

// Browsers that rotate a subscription (Chrome, Firefox) fire this; Safari
// does not, and the app re-sends its subscription on every open instead.
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(
        (async () => {
            let applicationServerKey =
                event.oldSubscription?.options?.applicationServerKey;
            if (!applicationServerKey) {
                const response = await fetch('/api/push/config', {
                    credentials: 'include',
                });
                if (!response.ok) return;
                applicationServerKey = (await response.json()).publicKey;
            }

            const subscription =
                event.newSubscription ||
                (await self.registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey,
                }));

            const csrf = await fetch('/api/csrf-token', {
                credentials: 'include',
            });
            if (!csrf.ok) return;
            const { csrfToken } = await csrf.json();

            await fetch('/api/push/subscriptions', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': csrfToken,
                },
                body: JSON.stringify(subscription.toJSON()),
            });
        })().catch(() => undefined)
    );
});

// ─── IndexedDB ───────────────────────────────────────────────────────────────

let dbPromise = null;

function openDb() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                for (const name of [OUTBOX, REJECTED]) {
                    if (!db.objectStoreNames.contains(name)) {
                        db.createObjectStore(name, {
                            keyPath: 'id',
                            autoIncrement: true,
                        });
                    }
                }
                if (!db.objectStoreNames.contains(META)) {
                    db.createObjectStore(META, { keyPath: 'key' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => {
                dbPromise = null;
                reject(req.error);
            };
        });
    }
    return dbPromise;
}

// One request per transaction: the result is read once it has committed.
async function idbRequest(storeName, mode, makeRequest) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const req = makeRequest(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

const idbAll = (store) => idbRequest(store, 'readonly', (s) => s.getAll());
const idbCount = (store) => idbRequest(store, 'readonly', (s) => s.count());
const idbAdd = (store, value) =>
    idbRequest(store, 'readwrite', (s) => {
        const copy = { ...value };
        delete copy.id;
        return s.add(copy);
    });
const idbPut = (store, value) =>
    idbRequest(store, 'readwrite', (s) => s.put(value));
const idbDelete = (store, key) =>
    idbRequest(store, 'readwrite', (s) => s.delete(key));
const idbClear = (store) => idbRequest(store, 'readwrite', (s) => s.clear());

async function metaGet(key) {
    const row = await idbRequest(META, 'readonly', (s) => s.get(key));
    return row ? row.value : undefined;
}

const metaSet = (key, value) =>
    idbRequest(META, 'readwrite', (s) => s.put({ key, value }));
