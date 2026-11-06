// What the add-on decides, without the browser: tested with `node --test`.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CadenceCore = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STATUSES = ['new', 'to_evaluate', 'tested', 'kept'];

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

    function parseTags(text) {
        return [
            ...new Set(
                String(text ?? '')
                    .split(',')
                    .map((tag) => tag.trim().replace(/^#/, ''))
                    .filter(Boolean)
            ),
        ];
    }

    function linkBody({ url, title, note, status, tags }) {
        const body = { url };
        if (title && title.trim()) body.title = title.trim();
        if (note && note.trim()) body.note = note.trim();
        if (STATUSES.includes(status)) body.status = status;
        const parsed = parseTags(tags);
        if (parsed.length > 0) body.tags = parsed;
        return body;
    }

    function saveRequest(settings, link) {
        return {
            url: `${settings.server}/api/links`,
            options: {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${settings.token}`,
                },
                body: JSON.stringify(linkBody(link)),
            },
        };
    }

    // What the answer of the server means for the user.
    function outcome(status, body) {
        if (status === 200) return body?.created ? 'saved' : 'already';
        if (status === 401 || status === 403) return 'bad_token';
        if (status === 400) return 'refused';
        return 'failed';
    }

    async function save(fetchImpl, settings, link) {
        const request = saveRequest(settings, link);
        try {
            const response = await fetchImpl(request.url, request.options);
            const body = await response.json().catch(() => null);
            return outcome(response.status, body);
        } catch {
            return 'unreachable';
        }
    }

    // Firefox refuses a port in a host pattern; a pattern without one covers
    // the host on any port.
    function originPattern(server) {
        const { protocol, hostname } = new URL(server);
        return `${protocol}//${hostname}/*`;
    }

    // The server keeps what a saved page already holds: say so if the user
    // typed something for nothing.
    function resultKey(result, { note, tags }) {
        const typed = (note ?? '').trim() || (tags ?? '').trim();
        return result === 'already' && typed
            ? 'result_already_not_merged'
            : `result_${result}`;
    }

    return {
        STATUSES,
        originPattern,
        resultKey,
        normalizeServer,
        isSavable,
        parseTags,
        linkBody,
        saveRequest,
        outcome,
        save,
    };
});
