'use strict';

const express = require('express');
const triage = require('./service');
const slots = require('./slots');
const linkReviews = require('./linkReviews');
const { logError } = require('../../services/logService');
const { AppError } = require('../../shared/errors');

const router = express.Router();

const handle = (action) => async (req, res) => {
    try {
        res.json(await action(req));
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        logError({ error }, 'Triage request failed');
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.get(
    '/triage',
    handle((req) => triage.getQueue(req.currentUser))
);
router.post(
    '/triage/keep',
    handle((req) => triage.keep(req.currentUser, req.body?.task_uid))
);
router.post(
    '/triage/apply',
    handle((req) => triage.apply(req.currentUser, req.body ?? {}))
);

router.post(
    '/triage/slots/:id/accept',
    handle((req) => slots.acceptSlot(req.currentUser, req.params.id))
);
router.post(
    '/triage/slots/:id/refuse',
    handle((req) => slots.refuseSlot(req.currentUser, req.params.id))
);

router.post(
    '/triage/links/:uid/review',
    handle((req) =>
        linkReviews.decide(req.currentUser, req.params.uid, req.body?.decision)
    )
);

module.exports = router;
