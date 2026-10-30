'use strict';

const crypto = require('crypto');
const {
    GoogleAccount,
    GoogleCalendar,
    GoogleEvent,
    GoogleTasklist,
    GoogleTaskLink,
} = require('../../models');
const secretCipher = require('../../shared/crypto/secretCipher');
const { ValidationError, NotFoundError } = require('../../shared/errors');
const { getGoogleConfig, isConfigured } = require('./config');
const client = require('./client');
const {
    isWritable,
    isEditable,
    SYNC_MODES,
    FEED_PREFIX,
} = require('./eventsService');

const CALLBACK_PATH = '/google/oauth/callback';

function serializeCalendar(calendar) {
    return {
        uid: calendar.uid,
        feed_uid: `${FEED_PREFIX}${calendar.uid}`,
        name: calendar.summary,
        color: calendar.color,
        is_primary: calendar.is_primary,
        is_tududi: calendar.is_tududi,
        // Google lets the account write to it (two_way can be chosen).
        can_write: isWritable(calendar) && !calendar.is_tududi,
        writable: isEditable(calendar),
        sync_mode: calendar.sync_mode,
        show_on_calendar: calendar.show_on_calendar,
    };
}

async function status(userId) {
    const account = await GoogleAccount.findOne({ where: { user_id: userId } });
    const base = { configured: isConfigured(), connected: Boolean(account) };
    if (!account) return { ...base, calendars: [] };
    const calendars = await GoogleCalendar.findAll({
        where: { user_id: userId },
        order: [
            ['is_primary', 'DESC'],
            ['summary', 'ASC'],
        ],
    });
    return {
        ...base,
        email: account.email,
        sync_events: account.sync_events,
        sync_tasks: account.sync_tasks,
        last_synced_at: account.last_synced_at,
        last_error: account.last_error,
        calendars: calendars.map(serializeCalendar),
    };
}

// The callback must be registered as an authorised redirect URI of the
// Google OAuth client.
function redirectUriFor(origin, basePath) {
    const { redirectUri } = getGoogleConfig();
    if (redirectUri) return redirectUri;
    return `${origin.replace(/\/$/, '')}${basePath}${CALLBACK_PATH}`;
}

function startConnect(session, { origin, basePath }) {
    if (!isConfigured()) {
        throw new ValidationError(
            'Google is not set up on this server: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET'
        );
    }
    if (!secretCipher.hasKeyMaterial()) {
        throw new ValidationError(
            'Cannot store Google access: set TUDUDI_SESSION_SECRET (or TUDUDI_OIDC_SECRET_ENCRYPTION_KEY) on the server first'
        );
    }
    const redirectUri = redirectUriFor(origin, basePath);
    const state = crypto.randomBytes(24).toString('hex');
    session.googleOAuth = {
        state,
        redirectUri,
        returnTo: `${new URL(redirectUri).origin}/calendar`,
    };
    return { url: client.buildAuthUrl(redirectUri, state) };
}

async function finishConnect(session, user, { code, state, error }) {
    const pending = session.googleOAuth;
    delete session.googleOAuth;
    if (!pending || !state || pending.state !== state) {
        throw new ValidationError(
            'This Google sign-in link is no longer valid'
        );
    }
    if (error) {
        return { returnTo: `${pending.returnTo}?google=denied` };
    }
    const tokens = await client.exchangeCode(code, pending.redirectUri);

    const existing = await GoogleAccount.findOne({
        where: { user_id: user.id },
    });
    const fields = {
        refresh_token_encrypted: secretCipher.encrypt(tokens.refresh_token),
        access_token_encrypted: secretCipher.encrypt(tokens.access_token),
        access_token_expires_at: new Date(
            Date.now() + (tokens.expires_in || 3600) * 1000
        ),
        last_error: null,
    };
    const account = existing
        ? await existing.update(fields)
        : await GoogleAccount.create({ user_id: user.id, ...fields });

    try {
        const info = await new client.GoogleClient(account).userInfo();
        await account.update({ email: info?.email || null });
    } catch {
        // The address is only shown in the profile.
    }
    return { returnTo: `${pending.returnTo}?google=connected`, account };
}

async function updateSettings(userId, body = {}) {
    const account = await GoogleAccount.findOne({ where: { user_id: userId } });
    if (!account) throw new NotFoundError('Google is not connected');
    const updates = {};
    for (const key of ['sync_events', 'sync_tasks']) {
        if (body[key] === undefined) continue;
        if (typeof body[key] !== 'boolean') {
            throw new ValidationError(`${key} must be true or false`);
        }
        updates[key] = body[key];
    }
    await account.update(updates);
    // Turning a side off unlinks it, so turning it on later starts clean
    // instead of deleting what changed meanwhile.
    if (updates.sync_events === false) {
        await GoogleTaskLink.destroy({
            where: { user_id: userId, kind: 'event' },
        });
        await GoogleCalendar.update(
            { sync_token: null },
            { where: { user_id: userId, is_tududi: true } }
        );
    }
    if (updates.sync_tasks === false) {
        await GoogleTaskLink.destroy({
            where: { user_id: userId, kind: 'task' },
        });
        await account.update({ tasks_updated_min: null });
    }
    return status(userId);
}

async function updateCalendar(userId, uid, body = {}) {
    const calendar = await GoogleCalendar.findOne({
        where: { user_id: userId, uid },
    });
    if (!calendar) throw new NotFoundError('Calendar not found');
    const updates = {};
    if (body.show_on_calendar !== undefined) {
        if (typeof body.show_on_calendar !== 'boolean') {
            throw new ValidationError('show_on_calendar must be true or false');
        }
        updates.show_on_calendar = body.show_on_calendar;
    }
    if (body.sync_mode !== undefined) {
        if (!SYNC_MODES.includes(body.sync_mode)) {
            throw new ValidationError(
                `sync_mode must be one of ${SYNC_MODES.join(', ')}`
            );
        }
        if (calendar.is_tududi) {
            throw new ValidationError(
                'The Cadence calendar always syncs both ways'
            );
        }
        if (body.sync_mode === 'two_way' && !isWritable(calendar)) {
            throw new ValidationError(
                'Google does not let you edit this calendar'
            );
        }
        updates.sync_mode = body.sync_mode;
    }
    if (!Object.keys(updates).length) {
        throw new ValidationError('Nothing to change');
    }
    // Hidden: its copies go; showing it again reads it afresh.
    if (updates.sync_mode === 'hidden' && calendar.sync_mode !== 'hidden') {
        await GoogleEvent.destroy({
            where: { google_calendar_id: calendar.id },
        });
        updates.sync_token = null;
    }
    await calendar.update(updates);
    return serializeCalendar(calendar);
}

// Removes the connection and every Google copy kept here. Tududi tasks stay,
// and so does everything on Google.
async function disconnect(userId) {
    const account = await GoogleAccount.findOne({ where: { user_id: userId } });
    if (!account) return;
    try {
        await client.revoke(
            secretCipher.decrypt(account.refresh_token_encrypted)
        );
    } catch {
        // Unreadable token: nothing to revoke.
    }
    await GoogleTaskLink.destroy({ where: { user_id: userId } });
    await GoogleEvent.destroy({ where: { user_id: userId } });
    await GoogleCalendar.destroy({ where: { user_id: userId } });
    await GoogleTasklist.destroy({ where: { user_id: userId } });
    await account.destroy();
}

module.exports = {
    status,
    startConnect,
    finishConnect,
    updateSettings,
    updateCalendar,
    disconnect,
    serializeCalendar,
};
