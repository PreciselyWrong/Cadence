'use strict';

const notificationsService = require('./service');
const { UnauthorizedError } = require('../../shared/errors');
const { getAuthenticatedUserId } = require('../../utils/request-utils');
const notificationStream = require('../../utils/notificationStream');

const HEARTBEAT_MS = 25_000;

function requireUserId(req) {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
        throw new UnauthorizedError('Authentication required');
    }
    return userId;
}

const notificationsController = {
    // Server-sent events: one `notification` event per notification released
    // for the desktop or the phone. A comment every 25 s keeps proxies and
    // the phone's radio from closing an idle connection.
    stream(req, res) {
        const userId = requireUserId(req);
        res.status(200).set({
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.flushHeaders();
        res.write('retry: 5000\nevent: ready\ndata: {}\n\n');

        const off = notificationStream.subscribe(userId, (payload) => {
            res.write(
                `event: notification\nid: ${payload.uid}\ndata: ${JSON.stringify(payload)}\n\n`
            );
        });
        const heartbeat = setInterval(
            () => res.write(': ping\n\n'),
            HEARTBEAT_MS
        );
        req.on('close', () => {
            clearInterval(heartbeat);
            off();
        });
    },

    async getTimedReminders(req, res, next) {
        try {
            res.json(
                await notificationsService.getTimedReminders(requireUserId(req))
            );
        } catch (error) {
            next(error);
        }
    },

    async saveTimedReminders(req, res, next) {
        try {
            res.json(
                await notificationsService.saveTimedReminders(
                    requireUserId(req),
                    req.body
                )
            );
        } catch (error) {
            next(error);
        }
    },

    async getAll(req, res, next) {
        try {
            const userId = requireUserId(req);
            const result = await notificationsService.getAll(userId, req.query);
            res.json(result);
        } catch (error) {
            next(error);
        }
    },

    async getUnreadCount(req, res, next) {
        try {
            const userId = requireUserId(req);
            const result = await notificationsService.getUnreadCount(userId);
            res.json(result);
        } catch (error) {
            next(error);
        }
    },

    async markAsRead(req, res, next) {
        try {
            const userId = requireUserId(req);
            const result = await notificationsService.markAsRead(
                userId,
                req.params.uid
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    },

    async markAsUnread(req, res, next) {
        try {
            const userId = requireUserId(req);
            const result = await notificationsService.markAsUnread(
                userId,
                req.params.uid
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    },

    async markAllAsRead(req, res, next) {
        try {
            const userId = requireUserId(req);
            const result = await notificationsService.markAllAsRead(userId);
            res.json(result);
        } catch (error) {
            next(error);
        }
    },

    async dismiss(req, res, next) {
        try {
            const userId = requireUserId(req);
            const result = await notificationsService.dismiss(
                userId,
                req.params.uid
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    },

    async triggerTestNotification(req, res, next) {
        try {
            const userId = requireUserId(req);
            const { channel } = req.body;

            if (!channel) {
                return res
                    .status(400)
                    .json({ error: 'Notification channel is required' });
            }

            const result = await notificationsService.triggerTestNotification(
                userId,
                channel
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    },
};

module.exports = notificationsController;
