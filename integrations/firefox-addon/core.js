// What the add-on decides, without the browser: tested with `node --test`.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CadenceCore = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // The address the user typed, as an origin; null when it is not one. Plain
    // http is only accepted on a private network: the token would travel in clear.
    function normalizeServer(input) {
        let url;
        try {
            url = new URL(String(input).trim());
        } catch {
            return null;
        }
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        if (url.protocol === 'http:' && !isPrivateHost(url.hostname)) return null;
        const path = url.pathname.replace(/\/+$/, '');
        return `${url.origin}${path}`;
    }

    function isPrivateHost(host) {
        return (
            host === 'localhost' ||
            host.endsWith('.lan') ||
            host.endsWith('.local') ||
            host.endsWith('.ts.net') ||
            /^127\./.test(host) ||
            /^10\./.test(host) ||
            /^192\.168\./.test(host) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
            /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
        );
    }

    // Only ordinary web pages can be saved, not about:, file: or the add-on pages.
    const isSavable = (url) => /^https?:\/\//i.test(url ?? '');

    const authHeaders = (settings) => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.token}`,
    });

    // A page becomes a task (docs/37-links.md): the server names it from
    // the kind of page unless a name is typed.
    function taskBody({ url, name, title }) {
        const body = { url };
        if (name && name.trim()) body.name = name.trim();
        if (title && title.trim()) body.title = title.trim();
        return body;
    }

    function taskRequest(settings, page) {
        return {
            url: `${settings.server}/api/links/task`,
            options: {
                method: 'POST',
                headers: authHeaders(settings),
                body: JSON.stringify(taskBody(page)),
            },
        };
    }

    // Where the page already is, and the name its task would get.
    function lookupRequest(settings, { url, title }) {
        const query = new URLSearchParams({ url });
        if (title) query.set('title', title);
        return {
            url: `${settings.server}/api/links/lookup?${query}`,
            options: { headers: authHeaders(settings) },
        };
    }

    // The first open task, else project, holding the page, and how many more.
    function firstPlace(found) {
        const tasks = found?.tasks ?? [];
        const projects = found?.projects ?? [];
        const more = tasks.length + projects.length - 1;
        if (tasks[0]) return { name: tasks[0].name, path: `/task/${tasks[0].uid}`, more };
        if (projects[0]) {
            return { name: projects[0].name, path: `/project/${projects[0].uid}`, more };
        }
        return null;
    }

    // What the answer of the server means for the user.
    function outcome(status) {
        if (status === 200 || status === 201) return 'saved';
        if (status === 401 || status === 403) return 'bad_token';
        if (status === 400) return 'refused';
        return 'failed';
    }

    async function addTask(fetchImpl, settings, page) {
        const request = taskRequest(settings, page);
        try {
            const response = await fetchImpl(request.url, request.options);
            return outcome(response.status);
        } catch {
            return 'unreachable';
        }
    }

    // Null when the server cannot say: the task can still be made.
    async function lookup(fetchImpl, settings, page) {
        const request = lookupRequest(settings, page);
        try {
            const response = await fetchImpl(request.url, request.options);
            return response.status === 200 ? await response.json() : null;
        } catch {
            return null;
        }
    }

    // A tab, or every tab of a group, becomes a page of a project.
    function sendPagesRequest(settings, projectUid, tabs) {
        const pages = tabs
            .filter((tab) => isSavable(tab.url))
            .map((tab) => {
                const page = { url: tab.url };
                if (tab.title && tab.title.trim()) page.title = tab.title.trim();
                return page;
            });
        return {
            url: `${settings.server}/api/projects/${encodeURIComponent(projectUid)}/pages`,
            options: {
                method: 'POST',
                headers: authHeaders(settings),
                body: JSON.stringify({ pages }),
            },
        };
    }

    function projectsRequest(settings) {
        return {
            url: `${settings.server}/api/projects`,
            options: { headers: authHeaders(settings) },
        };
    }

    function pagesRequest(settings, projectUid) {
        return {
            url: `${settings.server}/api/projects/${encodeURIComponent(projectUid)}/pages`,
            options: { headers: authHeaders(settings) },
        };
    }

    const CLOSED = ['done', 'cancelled', 'archived'];

    // The projects a page can go to: open ones, by name.
    function openProjects(answer) {
        return (answer?.projects ?? [])
            .filter((project) => !CLOSED.includes(project.status))
            .map(({ uid, name }) => ({ uid, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    const pageUrls = (answer) => (answer?.pages ?? []).map((page) => page.url);

    // Firefox refuses a port in a host pattern; a pattern without one covers
    // the host on any port.
    function originPattern(server) {
        const { protocol, hostname } = new URL(server);
        return `${protocol}//${hostname}/*`;
    }

    return {
        originPattern,
        normalizeServer,
        isSavable,
        taskBody,
        taskRequest,
        lookupRequest,
        firstPlace,
        outcome,
        addTask,
        lookup,
        sendPagesRequest,
        projectsRequest,
        pagesRequest,
        openProjects,
        pageUrls,
    };
});
