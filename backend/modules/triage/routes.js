'use strict';

const express = require('express');
const triage = require('./service');
const slots = require('./slots');
const { logError } = require('../../services/logService');
const { NotFoundError, ValidationError } = require('../../shared/errors');

const router = express.Router();

const handle = (action) => async (req, res) => {
    try {
        res.json(await action(req));
    } catch (error) {
        if (error instanceof ValidationError) {
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof NotFoundError) {
            return res.status(404).json({ error: error.message });
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

module.exports = router;
