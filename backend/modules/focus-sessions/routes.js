'use strict';

const express = require('express');
const focusSessions = require('./service');
const { logError } = require('../../services/logService');

const router = express.Router();

const handle =
    (action, status = 200) =>
    async (req, res) => {
        try {
            const body = await action(req);
            if (body === undefined) return res.status(204).end();
            res.status(status).json(body);
        } catch (error) {
            if (error.statusCode) {
                return res
                    .status(error.statusCode)
                    .json({ error: error.message });
            }
            logError('Error handling focus sessions:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };

router.get(
    '/focus-sessions/stats',
    handle(async (req) => focusSessions.stats(req.currentUser, req.query.days))
);
router.get(
    '/focus-sessions',
    handle(async (req) => ({
        sessions: await focusSessions.list(req.currentUser, req.query),
    }))
);
router.post(
    '/focus-sessions',
    handle(
        async (req) => ({
            session: await focusSessions.create(req.currentUser, req.body),
        }),
        201
    )
);
router.delete(
    '/focus-sessions/:uid',
    handle(async (req) => {
        await focusSessions.remove(req.currentUser, req.params.uid);
    })
);

module.exports = router;
