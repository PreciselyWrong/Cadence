'use strict';

const accountService = require('./accountService');
const eventsService = require('./eventsService');
const syncLog = require('./syncLog');
const { syncUser } = require('./syncEngine');
const { GoogleApiError, GoogleAuthRevokedError } = require('./client');
const { UnauthorizedError } = require('../../shared/errors');
const { getConfig } = require('../../config/config');
const { logError } = require('../../services/logService');

function requireUser(req) {
    if (!req.currentUser) {
        throw new UnauthorizedError('Authentication required');
    }
    return req.currentUser;
}

// Google errors are the upstream's, not the request's.
const handle = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, requireUser(req));
    } catch (err) {
        if (
            err instanceof GoogleApiError ||
            err instanceof GoogleAuthRevokedError
        ) {
            return res.status(502).json({ error: err.message });
        }
        next(err);
    }
};

const startBackgroundSync = (userId) =>
    syncUser(userId).catch((error) =>
        logError('Google sync after a change failed:', error)
    );

module.exports = {
    status: handle(async (req, res, user) => {
        res.json(await accountService.status(user.id));
    }),

    connect: handle(async (req, res) => {
        const origin =
            typeof req.query.origin === 'string' &&
            /^https?:\/\//.test(req.query.origin)
                ? req.query.origin
                : getConfig().frontendUrl;
        const basePath = req.baseUrl || '/api';
        res.json(
            accountService.startConnect(req.session, { origin, basePath })
        );
    }),

    // Google sends the browser back here; it answers with a redirect.
    callback: async (req, res) => {
        const fallback = `${getConfig().frontendUrl.replace(/\/$/, '')}/calendar`;
        try {
            const user = requireUser(req);
            const { returnTo, account } = await accountService.finishConnect(
                req.session,
                user,
                req.query
            );
            if (account) startBackgroundSync(user.id);
            res.redirect(returnTo);
        } catch (error) {
            logError('Google connection failed:', error);
            res.redirect(
                `${fallback}?google=error&message=${encodeURIComponent(error.message)}`
            );
        }
    },

    disconnect: handle(async (req, res, user) => {
        await accountService.disconnect(user.id);
        res.status(204).end();
    }),

    updateSettings: handle(async (req, res, user) => {
        const result = await accountService.updateSettings(user.id, req.body);
        startBackgroundSync(user.id);
        res.json(result);
    }),

    log: handle(async (req, res, user) => {
        res.json({ entries: await syncLog.list(user.id) });
    }),

    syncNow: handle(async (req, res, user) => {
        await syncUser(user.id);
        res.json(await accountService.status(user.id));
    }),

    updateCalendar: handle(async (req, res, user) => {
        res.json({
            calendar: await accountService.updateCalendar(
                user.id,
                req.params.uid,
                req.body
            ),
        });
    }),

    createEvent: handle(async (req, res, user) => {
        res.status(201).json({
            event: await eventsService.createEvent(user, req.body),
        });
    }),

    updateEvent: handle(async (req, res, user) => {
        res.json({
            event: await eventsService.updateEvent(
                user,
                req.params.calendarUid,
                req.params.eventId,
                req.body
            ),
        });
    }),

    deleteEvent: handle(async (req, res, user) => {
        await eventsService.deleteEvent(
            user,
            req.params.calendarUid,
            req.params.eventId
        );
        res.status(204).end();
    }),
};
