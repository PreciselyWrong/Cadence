/**
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

// Loads public/sw.js (and the offline-core.js it imports) with in-memory
// stand-ins for Cache Storage, IndexedDB and the network, so its handlers
// can be driven directly. Node supplies the real Request and Response.

const read = (file: string) =>
    fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const SW_SOURCE = read('sw.js');
const CORE_SOURCE = read('offline-core.js');

const ORIGIN = 'https://cadence.example';
const API_CACHE = 'tududi-api-v1';
const OUTBOX = 'tududi-sync-queue';
const REJECTED = 'tududi-rejected';

type Stored = { body: string; status: number; headers: [string, string][] };
const urlOf = (req: any) => (typeof req === 'string' ? req : req.url);
const toResponse = (e: Stored) =>
    new Response(e.body, { status: e.status, headers: e.headers });

function makeCaches() {
    const stores = new Map<string, Map<string, Stored>>();
    const open = async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name)!;
        return {
            put: async (req: any, res: Response) => {
                store.set(urlOf(req), {
                    body: await res.clone().text(),
                    status: res.status,
                    headers: Array.from((res.headers as any).entries()) as [
                        string,
                        string,
                    ][],
                });
            },
            add: async (url: string) => {
                store.set(url, { body: 'shell', status: 200, headers: [] });
            },
            delete: async (req: any) => store.delete(urlOf(req)),
            match: async (req: any) => {
                const e = store.get(urlOf(req));
                return e && toResponse(e);
            },
            keys: async () => [...store.keys()].map((u) => new Request(u)),
        };
    };
    return {
        stores,
        api: {
            open,
            delete: async (name: string) => stores.delete(name),
            keys: async () => [...stores.keys()],
            match: async (req: any, opts?: { cacheName?: string }) => {
                const names = opts?.cacheName
                    ? [opts.cacheName]
                    : [...stores.keys()];
                for (const name of names) {
                    const e = stores.get(name)?.get(urlOf(req));
                    if (e) return toResponse(e);
                }
                return undefined;
            },
        },
    };
}

function makeIndexedDb() {
    type Store = {
        keyPath: string;
        auto: boolean;
        rows: Map<any, any>;
        next: number;
    };
    const stores = new Map<string, Store>();
    const db = {
        objectStoreNames: { contains: (n: string) => stores.has(n) },
        createObjectStore: (n: string, opts: any) => {
            stores.set(n, {
                keyPath: opts.keyPath,
                auto: !!opts.autoIncrement,
                rows: new Map(),
                next: 1,
            });
        },
        transaction: (name: string) => {
            const s = stores.get(name)!;
            const tx: any = {};
            const request = (fn: () => any) => {
                const req: any = {};
                setTimeout(() => {
                    req.result = fn();
                    req.onsuccess?.();
                    setTimeout(() => tx.oncomplete?.());
                });
                return req;
            };
            const clone = (v: any) =>
                v === undefined ? v : structuredClone(v);
            tx.objectStore = () => ({
                add: (v: any) =>
                    request(() => {
                        const key = s.auto ? s.next++ : v[s.keyPath];
                        s.rows.set(key, clone({ ...v, [s.keyPath]: key }));
                        return key;
                    }),
                put: (v: any) =>
                    request(() => {
                        const key = v[s.keyPath];
                        if (typeof key === 'number' && key >= s.next) {
                            s.next = key + 1;
                        }
                        s.rows.set(key, clone(v));
                        return key;
                    }),
                get: (k: any) => request(() => clone(s.rows.get(k))),
                getAll: () => request(() => [...s.rows.values()].map(clone)),
                count: () => request(() => s.rows.size),
                delete: (k: any) =>
                    request(() => s.rows.delete(k) && undefined),
                clear: () => request(() => s.rows.clear()),
            });
            return tx;
        },
    };
    let upgraded = false;
    const rows = (name: string) => [...(stores.get(name)?.rows.values() ?? [])];
    return {
        rows,
        api: {
            open: () => {
                const req: any = { result: db };
                setTimeout(() => {
                    if (!upgraded) {
                        upgraded = true;
                        req.onupgradeneeded?.();
                    }
                    req.onsuccess?.();
                });
                return req;
            },
        },
    };
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const down = () => {
    throw new TypeError('fetch failed');
};

type Server = (req: Request) => Response | Promise<Response>;

function loadWorker(initial: Server) {
    const listeners: Record<string, (event: any) => void> = {};
    const posted: any[] = [];
    const client = { postMessage: (msg: any) => posted.push(msg) };
    const self: any = {
        location: { href: `${ORIGIN}/sw.js`, origin: ORIGIN },
        registration: { scope: `${ORIGIN}/` },
        addEventListener: (type: string, fn: any) => {
            listeners[type] = fn;
        },
        clients: { matchAll: async () => [client], claim: () => undefined },
        skipWaiting: () => undefined,
    };
    const caches = makeCaches();
    const idb = makeIndexedDb();
    let server = initial;
    const seen: Request[] = [];
    const fetchMock = jest.fn(async (input: any, init?: any) => {
        const req = input instanceof Request ? input : new Request(input, init);
        seen.push(req.clone());
        return server(req);
    });
    const importScripts = () => new Function('self', CORE_SOURCE)(self);

    new Function(
        'self',
        'caches',
        'fetch',
        'indexedDB',
        'importScripts',
        SW_SOURCE
    )(self, caches.api, fetchMock, idb.api, importScripts);

    const request = async (url: string, init?: RequestInit) => {
        let pending: Promise<Response> | undefined;
        listeners.fetch({
            request: new Request(`${ORIGIN}${url}`, init),
            respondWith: (p: Promise<Response>) => {
                pending = p;
            },
        });
        return pending!;
    };
    const navigate = async (url: string) => {
        let pending: Promise<Response> | undefined;
        listeners.fetch({
            request: {
                url: `${ORIGIN}${url}`,
                method: 'GET',
                mode: 'navigate',
                headers: new Headers(),
            },
            respondWith: (p: Promise<Response>) => {
                pending = p;
            },
        });
        return pending!;
    };
    const message = async (data: object) => {
        let pending: Promise<unknown> | undefined;
        listeners.message({
            data,
            source: client,
            waitUntil: (p: Promise<unknown>) => {
                pending = p;
            },
        });
        await pending;
    };
    const seed = (url: string, body: unknown) =>
        caches.stores.set(
            API_CACHE,
            new Map([
                ...(caches.stores.get(API_CACHE) ?? new Map()),
                [
                    `${ORIGIN}${url}`,
                    {
                        body: JSON.stringify(body),
                        status: 200,
                        headers: [['content-type', 'application/json']],
                    },
                ],
            ])
        );

    return {
        caches,
        idb,
        posted,
        seen,
        fetchMock,
        request,
        navigate,
        message,
        seed,
        setServer: (next: Server) => {
            server = next;
        },
        outbox: () => idb.rows(OUTBOX),
        rejected: () => idb.rows(REJECTED),
    };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
const patch = (body: object) => ({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'old' },
    body: JSON.stringify(body),
});
const post = (body: object) => ({ ...patch(body), method: 'POST' });

describe('service worker auth responses', () => {
    const restricted = '/api/project/restricted';

    it('keeps the cache and queue on a 403 and drops only that entry', async () => {
        const sw = loadWorker(() => json({}, 403));
        sw.seed(restricted, {});
        sw.seed('/api/tasks', {});
        sw.setServer(down);
        await sw.request('/api/task/t1', patch({ name: 'x' }));
        sw.setServer(() => json({}, 403));
        await sw.message({ type: 'PROBE' });
        sw.posted.length = 0;

        const response = await sw.request(restricted);
        await flush();

        expect(response.status).toBe(403);
        const apiCache = sw.caches.stores.get(API_CACHE)!;
        expect(apiCache.has(`${ORIGIN}${restricted}`)).toBe(false);
        expect(apiCache.has(`${ORIGIN}/api/tasks`)).toBe(true);
    });

    it('clears the cache on a 401, keeps the offline writes and tells the windows', async () => {
        const sw = loadWorker(down);
        sw.seed('/api/tasks', {});
        await sw.request('/api/task/t1', patch({ name: 'typed offline' }));
        sw.setServer((req) =>
            req.url.endsWith('/api/health')
                ? json({ status: 'ok' })
                : json({}, 401)
        );
        await sw.message({ type: 'PROBE' });

        const response = await sw.request('/api/tasks');
        await flush();

        expect(response.status).toBe(401);
        expect(sw.caches.stores.has(API_CACHE)).toBe(false);
        expect(sw.outbox()).toHaveLength(1);
        expect(sw.posted).toContainEqual({ type: 'AUTH_EXPIRED' });
    });
});

describe('service worker reads', () => {
    it('caches answers online and serves them once the server is gone', async () => {
        const sw = loadWorker(() =>
            json({ tasks: [{ uid: 't1', name: 'A' }] })
        );
        expect(
            (await (await sw.request('/api/tasks')).json()).tasks
        ).toHaveLength(1);

        sw.setServer(down);
        const offline = await sw.request('/api/tasks');
        expect(offline.status).toBe(200);
        expect(offline.headers.get('X-Cadence-Offline')).toBe('1');
        expect((await offline.json()).tasks[0].name).toBe('A');

        // Latched: the next read does not wait on the network again.
        const calls = sw.fetchMock.mock.calls.length;
        await sw.request('/api/tasks');
        expect(sw.fetchMock.mock.calls.length).toBe(calls);
        expect(sw.posted).toContainEqual(
            expect.objectContaining({ type: 'OFFLINE_STATE', offline: true })
        );
    });

    it('takes a proxy 502 for an unreachable server', async () => {
        const sw = loadWorker(() => json({}, 502));
        sw.seed('/api/areas', [{ uid: 'a1' }]);
        const response = await sw.request('/api/areas');
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([{ uid: 'a1' }]);
    });

    it('finds a row never read on its own in a cached list', async () => {
        const sw = loadWorker(down);
        sw.seed('/api/tasks?type=today', {
            tasks: [{ uid: 't1', name: 'From the list', note: 'n' }],
        });
        const response = await sw.request('/api/task/t1');
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ name: 'From the list' });
        expect((await sw.request('/api/task/zzz')).status).toBe(503);
    });

    it('answers 503 offline for an answer it never saw', async () => {
        const sw = loadWorker(down);
        const response = await sw.request('/api/tasks/metrics');
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({
            error: 'Offline',
            offline: true,
        });
    });

    it('serves the cached shell for a page offline', async () => {
        const sw = loadWorker(down);
        sw.caches.stores.set(
            'tududi-v4',
            new Map([
                [
                    `${ORIGIN}/`,
                    { body: '<html>shell', status: 200, headers: [] },
                ],
            ])
        );
        const response = await sw.navigate('/today');
        expect(await response.text()).toBe('<html>shell');
    });
});

describe('service worker offline writes', () => {
    it('answers an update with the row as it will be and shows it in lists', async () => {
        const sw = loadWorker(down);
        sw.seed('/api/tasks?type=today', {
            tasks: [{ uid: 't1', name: 'Old', priority: 0 }],
        });

        const response = await sw.request(
            '/api/task/t1',
            patch({ name: 'New' })
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            uid: 't1',
            name: 'New',
            priority: 0,
        });

        const list = await (await sw.request('/api/tasks?type=today')).json();
        expect(list.tasks[0].name).toBe('New');

        const [entry] = sw.outbox();
        expect(entry.op).toEqual({ kind: 'update', entity: 'task', uid: 't1' });
        expect(entry.clock).toMatch(/^\d{13}-0000-web-[0-9a-z]{8}$/);
        expect(entry.key).toBeNull();
    });

    it('gives a create its uid and a temporary id, readable at once', async () => {
        const sw = loadWorker(down);
        sw.seed('/api/tasks?project_id=4', { tasks: [] });

        const response = await sw.request(
            '/api/task',
            post({ name: 'Buy milk', project_id: 4 })
        );
        expect(response.status).toBe(201);
        const made = await response.json();
        expect(made.uid).toMatch(/^[0-9a-z]{15}$/);
        expect(made.id).toBeLessThan(0);
        expect(made).toMatchObject({
            name: 'Buy milk',
            project_id: 4,
            status: 0,
        });

        expect(
            await (await sw.request(`/api/task/${made.uid}`)).json()
        ).toMatchObject({
            name: 'Buy milk',
        });
        const list = await (await sw.request('/api/tasks?project_id=4')).json();
        expect(list.tasks.map((t: any) => t.uid)).toEqual([made.uid]);
        expect(sw.outbox()[0].key).toMatch(/^web-/);
    });

    it('marks a write it cannot describe as queued', async () => {
        const sw = loadWorker(down);
        const response = await sw.request('/api/projects/order', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: '[]',
        });
        expect(response.status).toBe(202);
        expect(response.headers.get('X-Tududi-Queued')).toBe('1');
    });

    it('never queues a sign-in or an AI call', async () => {
        const sw = loadWorker(down);
        const response = await sw.request('/api/login', post({ email: 'a' }));
        expect(response.status).toBe(503);
        expect(sw.outbox()).toHaveLength(0);
    });
});

describe('service worker replay', () => {
    const health = (req: Request) => req.url.endsWith('/api/health');
    const csrf = (req: Request) => req.url.endsWith('/api/csrf-token');

    it('replays in order with its keys, clock and uid, and rewrites temporary ids', async () => {
        const sw = loadWorker(down);
        await sw.message({ type: 'SESSION_UPDATE', sessionId: 7 });
        const made = await (
            await sw.request('/api/project', post({ name: 'Home' }))
        ).json();
        await sw.request(
            '/api/task',
            post({ name: 'Paint', project_id: made.id })
        );

        const replayed: Request[] = [];
        sw.setServer(async (req) => {
            if (health(req)) return json({ status: 'ok' });
            if (csrf(req)) return json({ csrfToken: 'fresh' });
            replayed.push(req);
            const body = await req.json();
            return json({
                ...body,
                id: req.url.endsWith('/project') ? 40 : 41,
            });
        });
        await sw.message({ type: 'PROBE' });
        await flush();

        expect(replayed.map((r) => r.url)).toEqual([
            `${ORIGIN}/api/project`,
            `${ORIGIN}/api/task`,
        ]);
        const [first, second] = replayed;
        expect(first.headers.get('x-csrf-token')).toBe('fresh');
        expect(first.headers.get('Idempotency-Key')).toMatch(/^web-/);
        expect(first.headers.get('X-Cadence-Create-Uid')).toBe(made.uid);
        expect(first.headers.get('X-Cadence-Offline-Clock')).toMatch(
            /^\d{13}-0000-web-/
        );
        expect(second.headers.get('X-Cadence-Offline-Clock')).toMatch(
            /^\d{13}-000[01]-web-/
        );
        expect(sw.outbox()).toHaveLength(0);
        expect(sw.posted).toContainEqual({
            type: 'SYNC_COMPLETE',
            applied: 2,
            rejected: 0,
            stopped: null,
        });
        const sent = sw.seen.filter((r) => r.url.endsWith('/api/task'));
        expect(await sent[sent.length - 1].json()).toMatchObject({
            project_id: 40,
        });
    });

    it('sets refused writes aside, keeps failing ones in order', async () => {
        const statuses: Record<string, number> = {
            '/api/task/forbidden': 403,
            '/api/task/flaky': 500,
            '/api/task/fine': 200,
        };
        const sw = loadWorker(down);
        for (const p of Object.keys(statuses)) {
            await sw.request(p, patch({ name: p }));
        }
        sw.setServer((req) => {
            if (health(req)) return json({ status: 'ok' });
            if (csrf(req)) return json({ csrfToken: 't' });
            const status = statuses[new URL(req.url).pathname] ?? 200;
            return json({ error: `status ${status}` }, status);
        });
        await sw.message({ type: 'PROBE' });
        await flush();

        expect(sw.outbox().map((e) => new URL(e.url).pathname)).toEqual([
            '/api/task/flaky',
            '/api/task/fine',
        ]);
        expect(sw.outbox()[0].attempts).toBe(1);
        expect(sw.rejected()).toEqual([
            expect.objectContaining({ status: 403, error: 'status 403' }),
        ]);
        expect(sw.posted).toContainEqual(
            expect.objectContaining({
                type: 'SYNC_COMPLETE',
                applied: 0,
                rejected: 1,
                stopped: 'error',
            })
        );
        const state = sw.posted.filter((m) => m.type === 'OFFLINE_STATE').pop();
        expect(state).toMatchObject({
            offline: false,
            pending: 2,
            rejected: [
                expect.objectContaining({
                    status: 403,
                    name: '/api/task/forbidden',
                }),
            ],
        });
    });

    it('stops on an expired session and keeps the writes', async () => {
        const sw = loadWorker(down);
        await sw.request('/api/task/t1', patch({ name: 'x' }));
        sw.setServer((req) =>
            health(req) ? json({ status: 'ok' }) : json({}, 401)
        );
        await sw.message({ type: 'PROBE' });
        await flush();
        expect(sw.outbox()).toHaveLength(1);
        expect(sw.posted).toContainEqual(
            expect.objectContaining({ type: 'SYNC_COMPLETE', stopped: 'auth' })
        );
    });

    it('never sends another user writes', async () => {
        const sw = loadWorker(down);
        await sw.message({ type: 'SESSION_UPDATE', sessionId: 1 });
        await sw.request('/api/task/t1', patch({ name: 'by user 1' }));
        sw.setServer((req) =>
            health(req) ? json({ status: 'ok' }) : json({})
        );
        sw.seen.length = 0;
        await sw.message({ type: 'SESSION_UPDATE', sessionId: 2 });
        await sw.message({ type: 'PROBE' });
        await flush();
        expect(sw.seen.some((r) => r.url.endsWith('/api/task/t1'))).toBe(false);
        expect(sw.outbox()).toHaveLength(1);
    });

    it('queues a write behind earlier ones even when online', async () => {
        const sw = loadWorker(down);
        await sw.request('/api/task/t1', patch({ name: 'first' }));
        const order: string[] = [];
        sw.setServer(async (req) => {
            if (health(req) || csrf(req)) return json({ csrfToken: 't' });
            order.push((await req.json()).name);
            return json({});
        });
        await sw.message({ type: 'PROBE' });
        await sw.request('/api/task/t1', patch({ name: 'second' }));
        await flush();
        expect(order).toEqual(['first', 'second']);
        expect(sw.outbox()).toHaveLength(0);
    });

    it('signing out drops the cached answers, not the writes', async () => {
        const sw = loadWorker(down);
        sw.seed('/api/tasks', {});
        await sw.request('/api/task/t1', patch({ name: 'x' }));
        await sw.message({ type: 'CLEAR_CACHE' });
        expect(sw.caches.stores.has(API_CACHE)).toBe(false);
        expect(sw.outbox()).toHaveLength(1);
    });

    it('refreshes the cached lists on WARM and forgets those now refused', async () => {
        const sw = loadWorker(() => json({}));
        sw.seed('/api/tasks?type=today', {
            tasks: [{ uid: 't1', name: 'Old' }],
        });
        sw.seed('/api/project/gone', { uid: 'gone' });
        sw.seed('/api/projects', { projects: [] });
        sw.setServer((req) => {
            if (req.url.endsWith('/api/projects')) return json({}, 404);
            return json({ tasks: [{ uid: 't1', name: 'Fresh' }] });
        });
        await sw.message({ type: 'WARM' });

        const cache = sw.caches.stores.get(API_CACHE)!;
        expect(
            JSON.parse(cache.get(`${ORIGIN}/api/tasks?type=today`)!.body)
        ).toEqual({
            tasks: [{ uid: 't1', name: 'Fresh' }],
        });
        expect(cache.has(`${ORIGIN}/api/projects`)).toBe(false);
        // A row read on its own is refreshed when it is opened, not here.
        expect(sw.seen.some((r) => r.url.endsWith('/api/project/gone'))).toBe(
            false
        );
    });
});
