/* global module */
// Pure rules of the offline web UI, shared by the service worker (sw.js,
// through importScripts) and its tests. Nothing here touches the network or
// storage. See docs/fork/WEB-OFFLINE.md.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.OfflineCore = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Answers a proxy gives when the Cadence server behind it is down
    // (nginx, Tailscale serve, Cloudflare). 503 is left out: the app itself
    // answers it for a missing provider, and that is not an outage.
    const UNREACHABLE = new Set([502, 504, 520, 521, 522, 523, 524, 530]);

    function isUnreachableStatus(status) {
        return UNREACHABLE.has(status);
    }

    // REST resources of the synced entities: `one` is the path of a row
    // (`/task/:uid`), `create` the path a POST creates one on, `lists` the
    // collection paths whose answers list them and the keys they sit under.
    const ENTITIES = {
        task: {
            one: 'task',
            create: 'task',
            lists: ['tasks'],
            keys: ['tasks'],
        },
        note: {
            one: 'note',
            create: 'note',
            lists: ['notes'],
            keys: ['notes'],
        },
        project: {
            one: 'project',
            create: 'project',
            lists: ['projects'],
            keys: ['projects'],
        },
        area: {
            one: 'areas',
            create: 'areas',
            lists: ['areas'],
            keys: ['areas'],
        },
        tag: { one: 'tag', create: 'tag', lists: ['tags'], keys: ['tags'] },
        inbox_item: {
            one: 'inbox',
            create: 'inbox',
            lists: ['inbox'],
            keys: ['items'],
        },
        goal: {
            one: 'goals',
            create: 'goals',
            lists: ['goals'],
            keys: ['goals'],
        },
        link: { one: 'links', create: null, lists: ['links'], keys: ['links'] },
    };

    // The path after `/api/` (or `/api/v1/`), split, whatever the base path.
    function apiSegments(url) {
        const { pathname } = new URL(url, 'http://local');
        const at = pathname.indexOf('/api/');
        if (at < 0) return null;
        const parts = pathname
            .slice(at + 5)
            .split('/')
            .filter(Boolean);
        if (parts[0] === 'v1') parts.shift();
        return parts.map(decodeURIComponent);
    }

    function describeMutation(method, url) {
        const parts = apiSegments(url);
        if (!parts) return { kind: 'other' };
        const verb = method.toUpperCase();
        for (const [entity, def] of Object.entries(ENTITIES)) {
            if (
                parts.length === 1 &&
                verb === 'POST' &&
                parts[0] === def.create
            ) {
                return { kind: 'create', entity };
            }
            if (parts.length === 2 && parts[0] === def.one) {
                if (verb === 'PATCH' || verb === 'PUT') {
                    return { kind: 'update', entity, uid: parts[1] };
                }
                if (verb === 'DELETE') {
                    return { kind: 'delete', entity, uid: parts[1] };
                }
            }
        }
        return { kind: 'other' };
    }

    // The uid of a row read on its own (`GET /api/task/:uid`), or null.
    function detailUid(url) {
        const parts = apiSegments(url);
        if (!parts || parts.length !== 2) return null;
        const isRow = Object.values(ENTITIES).some(
            (def) => def.one === parts[0]
        );
        return isRow ? parts[1] : null;
    }

    const isObject = (value) =>
        value !== null && typeof value === 'object' && !Array.isArray(value);

    // Walks every object and array of an answer.
    function walk(value, visit) {
        if (Array.isArray(value)) {
            value.forEach((item) => walk(item, visit));
            visit(value);
        } else if (isObject(value)) {
            Object.values(value).forEach((item) => walk(item, visit));
            visit(value);
        }
    }

    // The outbox keeps request bodies as text.
    function patchFields(body) {
        let parsed = body;
        if (typeof body === 'string') {
            try {
                parsed = JSON.parse(body);
            } catch {
                parsed = null;
            }
        }
        const fields = { ...(isObject(parsed) ? parsed : {}) };
        delete fields.uid;
        delete fields.id;
        return fields;
    }

    function sameId(a, b) {
        return a !== undefined && a !== null && String(a) === String(b);
    }

    // Whether a task made offline belongs in the task list at `url`. Only
    // filters the overlay can judge are trusted; any other list (today,
    // upcoming, …) shows the task after the reconnect.
    function taskFitsList(url, task) {
        const params = new URL(url, 'http://local').searchParams;
        const project = params.get('project_id') ?? params.get('project_uid');
        if (project === null) return false;
        return (
            sameId(task.project_id, project) ||
            sameId(task.project_uid, project)
        );
    }

    function insertCreate(answer, url, entity, synth) {
        const def = ENTITIES[entity];
        const parts = apiSegments(url) || [];
        const holds = (list) =>
            list.some((row) => row && row.uid === synth.uid);
        const add = (list) => {
            if (!holds(list)) list.unshift({ ...synth });
        };

        // A project's own page lists its tasks.
        if (entity === 'task' && parts[0] === 'project' && parts.length === 2) {
            if (!isObject(answer)) return;
            const own =
                sameId(synth.project_id, answer.id) ||
                sameId(synth.project_uid, answer.uid);
            const key = Array.isArray(answer.tasks) ? 'tasks' : 'Tasks';
            if (own && Array.isArray(answer[key])) add(answer[key]);
            return;
        }

        if (parts.length !== 1 || !def.lists.includes(parts[0])) return;
        if (entity === 'task' && !taskFitsList(url, synth)) return;
        if (Array.isArray(answer)) {
            add(answer);
            return;
        }
        if (!isObject(answer)) return;
        const key = def.keys.find((k) => Array.isArray(answer[k]));
        if (key) add(answer[key]);
    }

    // Lays the pending writes, oldest first, over a copy of an answer. A
    // detail answer of a row deleted offline becomes null.
    function applyOverlay(answer, url, entries) {
        let out = JSON.parse(JSON.stringify(answer));
        for (const entry of entries) {
            const { op } = entry;
            if (!op || out === null) continue;
            if (op.kind === 'update') {
                const fields = patchFields(entry.body);
                walk(out, (node) => {
                    if (isObject(node) && node.uid === op.uid) {
                        Object.assign(node, fields);
                    }
                });
            } else if (op.kind === 'delete') {
                if (isObject(out) && out.uid === op.uid) {
                    out = null;
                    continue;
                }
                walk(out, (node) => {
                    if (!Array.isArray(node)) return;
                    for (let i = node.length - 1; i >= 0; i -= 1) {
                        if (isObject(node[i]) && node[i].uid === op.uid) {
                            node.splice(i, 1);
                        }
                    }
                });
            } else if (op.kind === 'create' && entry.synth) {
                insertCreate(out, url, op.entity, entry.synth);
            }
        }
        return out;
    }

    // The answer a create gets offline: what was sent, plus what the server
    // would have added. The id is temporary (negative) until the replay.
    function synthesizeCreate(entity, body, { uid, tempId, now }) {
        const out = {
            ...(isObject(body) ? body : {}),
            uid,
            id: tempId,
            created_at: now,
            updated_at: now,
        };
        if (entity === 'task' && out.status === undefined) out.status = 0;
        return out;
    }

    const ID_KEY = /(^|_)id$/;
    const UID_KEY = /(^|_)uid$/;

    // Writes made after an offline create may name its temporary id (or the
    // uid the browser chose, when the server kept its own); once the create
    // has reached the server they must name the real ones. `idMap` maps
    // temporary ids (as strings) and replaced uids to the server's.
    function rewriteTempIds(entry, idMap) {
        const known = (key, value) =>
            (ID_KEY.test(key) && typeof value === 'number' && value < 0) ||
            (UID_KEY.test(key) && typeof value === 'string');
        let changed = false;

        const url = entry.url.replace(
            /\/([^/?#]+)(?=\/|\?|#|$)/g,
            (match, segment) => {
                if (!Object.prototype.hasOwnProperty.call(idMap, segment)) {
                    return match;
                }
                changed = true;
                return `/${idMap[segment]}`;
            }
        );

        let body = entry.body;
        try {
            const parsed = JSON.parse(entry.body);
            walk(parsed, (node) => {
                if (!isObject(node)) return;
                for (const [key, value] of Object.entries(node)) {
                    if (
                        known(key, value) &&
                        Object.prototype.hasOwnProperty.call(
                            idMap,
                            String(value)
                        )
                    ) {
                        node[key] = idMap[String(value)];
                        changed = true;
                    }
                }
            });
            if (changed) body = JSON.stringify(parsed);
        } catch {
            // not JSON: only the url can name an id
        }
        return changed ? { ...entry, url, body } : entry;
    }

    // The fullest copy of a row in a set of cached answers, or null.
    function findByUid(answers, uid) {
        let best = null;
        for (const answer of answers) {
            walk(answer, (node) => {
                if (!isObject(node) || node.uid !== uid) return;
                if (
                    !best ||
                    Object.keys(node).length > Object.keys(best).length
                ) {
                    best = node;
                }
            });
        }
        return best ? JSON.parse(JSON.stringify(best)) : null;
    }

    // Same alphabet and length as the server's backend/utils/uid.js.
    const UID_ALPHABET = '0123456789abcdefghijkmnpqrstuvwxyz';

    function newUid() {
        const bytes = new Uint8Array(15);
        crypto.getRandomValues(bytes);
        return Array.from(
            bytes,
            (b) => UID_ALPHABET[b % UID_ALPHABET.length]
        ).join('');
    }

    // "<13-digit ms>-<4-digit counter>-<node>", as backend/modules/sync/hlc.js.
    function formatClock(ms, counter, node) {
        return `${String(ms).padStart(13, '0')}-${String(counter % 10000).padStart(4, '0')}-${node}`;
    }

    return {
        isUnreachableStatus,
        describeMutation,
        detailUid,
        applyOverlay,
        synthesizeCreate,
        rewriteTempIds,
        findByUid,
        newUid,
        formatClock,
    };
});
