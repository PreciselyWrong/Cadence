'use strict';

// In-memory stand-in for the Google Calendar and Tasks APIs, enough for the
// google-sync module. Install with client.setFetch(fake.fetch).
function createFakeGoogle() {
    let counter = 0;
    let clock = 0;
    const nextId = (prefix) => `${prefix}${++counter}`;
    // Never behind the real clock, which stamps Tududi's own updated_at.
    const tick = () => {
        clock = Math.max(Date.now(), clock + 1);
        return new Date(clock).toISOString();
    };

    const state = {
        calendars: new Map(),
        lists: new Map(),
        defaultListId: null,
        calls: [],
        tokenRevoked: false,
    };

    function addCalendar(meta) {
        const id = meta.id || nextId('cal');
        state.calendars.set(id, {
            meta: { accessRole: 'owner', ...meta, id },
            events: new Map(),
            log: [],
        });
        return id;
    }

    function addList(title) {
        const id = nextId('list');
        state.lists.set(id, { id, title, tasks: new Map() });
        if (!state.defaultListId) state.defaultListId = id;
        return id;
    }

    function touchEvent(calendar, event) {
        event.updated = tick();
        event.etag = `"${counter++}"`;
        calendar.events.set(event.id, event);
        calendar.log.push(event.id);
    }

    function putEvent(calendarId, fields) {
        const calendar = state.calendars.get(calendarId);
        const event = {
            id: fields.id || nextId('evt'),
            status: 'confirmed',
            ...fields,
        };
        touchEvent(calendar, event);
        return event;
    }

    function putTask(listId, fields) {
        const list = state.lists.get(listId);
        const task = {
            id: fields.id || nextId('gt'),
            status: 'needsAction',
            ...fields,
            updated: tick(),
        };
        list.tasks.set(task.id, task);
        return task;
    }

    const json = (status, data) => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => (data === undefined ? '' : JSON.stringify(data)),
    });

    function merge(target, patch) {
        for (const [key, value] of Object.entries(patch)) {
            if (value === null) delete target[key];
            else if (typeof value === 'object' && !Array.isArray(value)) {
                target[key] = merge({ ...(target[key] || {}) }, value);
            } else target[key] = value;
        }
        return target;
    }

    async function fetch(rawUrl, options = {}) {
        const url = new URL(rawUrl);
        const method = options.method || 'GET';
        const body =
            options.body &&
            options.headers?.['Content-Type'] === 'application/json'
                ? JSON.parse(options.body)
                : null;
        const path = decodeURIComponent(url.pathname);
        state.calls.push(`${method} ${path}`);
        const q = url.searchParams;

        if (url.host === 'oauth2.googleapis.com') {
            const form = new URLSearchParams(options.body);
            if (path === '/revoke') return json(200, {});
            if (state.tokenRevoked)
                return json(400, { error: 'invalid_grant' });
            if (form.get('grant_type') === 'authorization_code') {
                return json(200, {
                    access_token: 'access-1',
                    refresh_token: 'refresh-1',
                    expires_in: 3600,
                    scope: 'openid email https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks',
                });
            }
            return json(200, {
                access_token: `access-${++counter}`,
                expires_in: 3600,
            });
        }
        if (url.host === 'openidconnect.googleapis.com') {
            return json(200, { email: 'me@gmail.com' });
        }

        let m;
        // Calendar API
        if (path === '/calendar/v3/users/me/calendarList') {
            return json(200, {
                items: [...state.calendars.values()].map((c) => c.meta),
            });
        }
        if (path === '/calendar/v3/calendars' && method === 'POST') {
            const id = addCalendar({
                summary: body.summary,
                accessRole: 'owner',
            });
            return json(200, { id, summary: body.summary });
        }
        if ((m = path.match(/^\/calendar\/v3\/calendars\/([^/]+)$/))) {
            const calendar = state.calendars.get(m[1]);
            return calendar
                ? json(200, calendar.meta)
                : json(404, { error: { message: 'Not Found' } });
        }
        if (
            (m = path.match(
                /^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/
            ))
        ) {
            const calendar = state.calendars.get(m[1]);
            if (!calendar)
                return json(404, { error: { message: 'Not Found' } });
            const eventId = m[2];
            if (method === 'GET') {
                const token = q.get('syncToken');
                let ids;
                if (token) {
                    if (token === 'expired')
                        return json(410, { error: { message: 'Gone' } });
                    const from = Number(token.split(':')[1]);
                    ids = [...new Set(calendar.log.slice(from))];
                } else {
                    ids = [...calendar.events.keys()].filter(
                        (id) => calendar.events.get(id).status !== 'cancelled'
                    );
                }
                return json(200, {
                    items: ids.map((id) => calendar.events.get(id)),
                    nextSyncToken: `seq:${calendar.log.length}`,
                });
            }
            if (method === 'POST') return json(200, putEvent(m[1], body));
            const event = calendar.events.get(eventId);
            if (!event || event.status === 'cancelled') {
                return json(method === 'DELETE' ? 410 : 404, {
                    error: { message: 'Gone' },
                });
            }
            if (method === 'PATCH') {
                merge(event, body);
                touchEvent(calendar, event);
                return json(200, event);
            }
            if (method === 'DELETE') {
                event.status = 'cancelled';
                touchEvent(calendar, event);
                return json(204);
            }
        }

        // Tasks API
        if (path === '/tasks/v1/users/@me/lists') {
            if (method === 'POST') {
                const id = addList(body.title);
                return json(200, { id, title: body.title });
            }
            return json(200, {
                items: [...state.lists.values()].map(({ id, title }) => ({
                    id,
                    title,
                })),
            });
        }
        if (path === '/tasks/v1/users/@me/lists/@default') {
            const list = state.lists.get(state.defaultListId);
            return json(200, { id: list.id, title: list.title });
        }
        if (
            (m = path.match(
                /^\/tasks\/v1\/lists\/([^/]+)\/tasks(?:\/([^/]+))?(\/move)?$/
            ))
        ) {
            const list = state.lists.get(m[1]);
            if (!list) return json(404, { error: { message: 'Not Found' } });
            if (m[3]) {
                const task = list.tasks.get(m[2]);
                if (q.get('parent')) task.parent = q.get('parent');
                else delete task.parent;
                task.updated = tick();
                return json(200, task);
            }
            if (!m[2] && method === 'GET') {
                const updatedMin = q.get('updatedMin');
                const items = [...list.tasks.values()].filter(
                    (task) =>
                        (!updatedMin || task.updated >= updatedMin) &&
                        (q.get('showDeleted') === 'true' || !task.deleted)
                );
                return json(200, { items });
            }
            if (!m[2] && method === 'POST') {
                const fields = { ...body };
                for (const key of Object.keys(fields))
                    if (fields[key] === null) delete fields[key];
                if (q.get('parent')) fields.parent = q.get('parent');
                return json(200, putTask(m[1], fields));
            }
            const task = list.tasks.get(m[2]);
            if (!task || task.deleted)
                return json(404, { error: { message: 'Not Found' } });
            if (method === 'PATCH') {
                merge(task, body);
                task.updated = tick();
                return json(200, task);
            }
            if (method === 'DELETE') {
                task.deleted = true;
                task.updated = tick();
                return json(204);
            }
        }
        throw new Error(`fake google: unhandled ${method} ${rawUrl}`);
    }

    return {
        state,
        fetch,
        addCalendar,
        addList,
        putEvent,
        putTask,
        touchEvent,
    };
}

module.exports = { createFakeGoogle };
