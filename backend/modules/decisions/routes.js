'use strict';

const express = require('express');
const service = require('./service');
const { logError } = require('../../services/logService');
const { AppError } = require('../../shared/errors');

const router = express.Router();

const handle = (action) => async (req, res) => {
    try {
        const result = await action(req);
        if (result === undefined) return res.status(204).end();
        res.json(result);
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        logError({ error }, 'Decision request failed');
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.get(
    '/decisions',
    handle((req) => service.getPendingDecisions(req.currentUser))
);

router.post(
    '/decisions/:uid/decide',
    handle((req) =>
        service.decide(req.currentUser, req.params.uid, req.body ?? {})
    )
);

module.exports = router;
