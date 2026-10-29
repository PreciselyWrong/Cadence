'use strict';

const secretCipher = require('../../shared/crypto/secretCipher');
const { getGoogleConfig } = require('./config');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const SCOPES = [
    'openid',
    'email',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/tasks',
];

const MAX_RETRIES = 3;
let RETRY_BASE_MS = 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Swappable in tests.
let fetchImpl = (...args) => fetch(...args);
function setFetch(fn, { retryBaseMs } = {}) {
    fetchImpl = fn || ((...args) => fetch(...args));
    if (retryBaseMs !== undefined) RETRY_BASE_MS = retryBaseMs;
}

class GoogleApiError extends Error {
    constructor(status, message, reason) {
        super(message);
        this.name = 'GoogleApiError';
        this.status = status;
        this.reason = reason;
    }
}

// The refresh token was revoked or expired (an app left in "Testing" mode
// loses its tokens after 7 days): the user has to connect again.
class GoogleAuthRevokedError extends Error {
    constructor() {
        super('Google access was revoked or expired. Connect Google again.');
        this.name = 'GoogleAuthRevokedError';
    }
}

async function postForm(url, params) {
    const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
    });
    const text = await response.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = {};
    }
    return { response, data };
}

function buildAuthUrl(redirectUri, state) {
    const { clientId } = getGoogleConfig();
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',
        // Asks again each time so Google always returns a refresh token.
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
    });
    return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCode(code, redirectUri) {
    const { clientId, clientSecret } = getGoogleConfig();
    const { response, data } = await postForm(TOKEN_URL, {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
    });
    if (!response.ok || !data.access_token) {
        throw new GoogleApiError(
            response.status,
            data.error_description || data.error || 'Google sign-in failed'
        );
    }
    if (!data.refresh_token) {
        throw new GoogleApiError(
            400,
            'Google did not return offline access. Remove Tududi from your Google account permissions and connect again.'
        );
    }
    const scopes = String(data.scope || '').split(' ');
    for (const scope of SCOPES.slice(2)) {
        if (!scopes.includes(scope)) {
            throw new GoogleApiError(
                400,
                'Allow access to both Google Calendar and Google Tasks to connect.'
            );
        }
    }
    return data;
}

async function revoke(refreshToken) {
    try {
        await postForm(REVOKE_URL, { token: refreshToken });
    } catch {
        // Disconnecting still removes everything on our side.
    }
}

// One client per account and sync run. Refreshes the access token when it
// is about to expire and stores the new one encrypted.
class GoogleClient {
    constructor(account) {
        this.account = account;
        this.accessToken = account.access_token_encrypted
            ? safeDecrypt(account.access_token_encrypted)
            : null;
        this.expiresAt = account.access_token_expires_at
            ? new Date(account.access_token_expires_at).getTime()
            : 0;
    }

    async token() {
        if (this.accessToken && this.expiresAt - Date.now() > 60 * 1000) {
            return this.accessToken;
        }
        const { clientId, clientSecret } = getGoogleConfig();
        const { response, data } = await postForm(TOKEN_URL, {
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: secretCipher.decrypt(
                this.account.refresh_token_encrypted
            ),
            grant_type: 'refresh_token',
        });
        if (data.error === 'invalid_grant') throw new GoogleAuthRevokedError();
        if (!response.ok || !data.access_token) {
            throw new GoogleApiError(
                response.status,
                data.error_description || 'Could not refresh Google access'
            );
        }
        this.accessToken = data.access_token;
        this.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
        await this.account.update({
            access_token_encrypted: secretCipher.encrypt(data.access_token),
            access_token_expires_at: new Date(this.expiresAt),
        });
        return this.accessToken;
    }

    async request(method, url, options = {}, retried = false, attempt = 0) {
        const { query, body } = options;
        const target = new URL(url);
        for (const [key, value] of Object.entries(query || {})) {
            if (value !== undefined && value !== null) {
                target.searchParams.set(key, String(value));
            }
        }
        const response = await fetchImpl(target.toString(), {
            method,
            headers: {
                Authorization: `Bearer ${await this.token()}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (response.status === 401 && !retried) {
            this.accessToken = null;
            return this.request(method, url, options, true, attempt);
        }
        if (response.status === 204) return null;
        const text = await response.text();
        // Rate limits (429, or 403 rateLimitExceeded): back off and retry.
        if (
            (response.status === 429 ||
                (response.status === 403 && /rateLimitExceeded/.test(text))) &&
            attempt < MAX_RETRIES
        ) {
            await sleep(RETRY_BASE_MS * 2 ** attempt);
            return this.request(method, url, options, retried, attempt + 1);
        }
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = null;
        }
        if (!response.ok) {
            const error = data?.error || {};
            throw new GoogleApiError(
                response.status,
                error.message || `Google API error ${response.status}`,
                error.errors?.[0]?.reason || error.status
            );
        }
        return data;
    }

    // Follows nextPageToken; returns all items plus the final page's extras.
    async listAll(url, query) {
        const items = [];
        let pageToken;
        let last = {};
        do {
            last =
                (await this.request('GET', url, {
                    query: { ...query, pageToken },
                })) || {};
            items.push(...(last.items || []));
            pageToken = last.nextPageToken;
        } while (pageToken);
        return { items, last };
    }

    userInfo() {
        return this.request('GET', USERINFO_URL);
    }

    // Calendar API
    listCalendars() {
        return this.listAll(`${CALENDAR_API}/users/me/calendarList`, {
            maxResults: 250,
            showHidden: true,
        }).then((r) => r.items);
    }

    createCalendar(summary, timeZone) {
        return this.request('POST', `${CALENDAR_API}/calendars`, {
            body: { summary, timeZone },
        });
    }

    getCalendar(calendarId) {
        return this.request(
            'GET',
            `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}`
        );
    }

    // With a sync token: only changes since. Without: everything from
    // timeMin. Recurring events come expanded into instances.
    async listEvents(calendarId, { syncToken, timeMin } = {}) {
        const query = {
            singleEvents: true,
            maxResults: 2500,
            showDeleted: true,
        };
        if (syncToken) query.syncToken = syncToken;
        else if (timeMin) query.timeMin = timeMin;
        const { items, last } = await this.listAll(
            `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
            query
        );
        return { items, nextSyncToken: last.nextSyncToken };
    }

    insertEvent(calendarId, event) {
        return this.request(
            'POST',
            `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
            { body: event }
        );
    }

    patchEvent(calendarId, eventId, event) {
        return this.request(
            'PATCH',
            `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
            { body: event }
        );
    }

    async deleteEvent(calendarId, eventId) {
        try {
            await this.request(
                'DELETE',
                `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
            );
        } catch (error) {
            // Already gone on Google's side.
            if (error.status !== 404 && error.status !== 410) throw error;
        }
    }

    // Tasks API
    listTasklists() {
        return this.listAll(`${TASKS_API}/users/@me/lists`, {
            maxResults: 100,
        }).then((r) => r.items);
    }

    insertTasklist(title) {
        return this.request('POST', `${TASKS_API}/users/@me/lists`, {
            body: { title },
        });
    }

    patchTasklist(listId, title) {
        return this.request(
            'PATCH',
            `${TASKS_API}/users/@me/lists/${encodeURIComponent(listId)}`,
            { body: { title } }
        );
    }

    listTasks(listId, { updatedMin } = {}) {
        return this.listAll(
            `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks`,
            {
                maxResults: 100,
                showCompleted: true,
                showHidden: true,
                showDeleted: Boolean(updatedMin),
                updatedMin,
            }
        ).then((r) => r.items);
    }

    insertTask(listId, task, { parent, previous } = {}) {
        return this.request(
            'POST',
            `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks`,
            { query: { parent, previous }, body: task }
        );
    }

    patchTask(listId, taskId, task) {
        return this.request(
            'PATCH',
            `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
            { body: task }
        );
    }

    moveTask(listId, taskId, { parent } = {}) {
        return this.request(
            'POST',
            `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}/move`,
            { query: { parent } }
        );
    }

    async deleteTask(listId, taskId) {
        try {
            await this.request(
                'DELETE',
                `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`
            );
        } catch (error) {
            if (error.status !== 404 && error.status !== 410) throw error;
        }
    }
}

function safeDecrypt(value) {
    try {
        return secretCipher.decrypt(value);
    } catch {
        return null;
    }
}

module.exports = {
    GoogleClient,
    GoogleApiError,
    GoogleAuthRevokedError,
    buildAuthUrl,
    exchangeCode,
    revoke,
    setFetch,
    SCOPES,
};
