'use strict';

const express = require('express');
const triage = require('./service');
const mail = require('./mail');
const settings = require('./settings');
const contexts = require('./contexts');
const { logError } = require('../../services/logService');
const { AppError } = require('../../shared/errors');

const router = express.Router();

// An action that returns nothing answers 204.
const handle = (action) => async (req, res) => {
    try {
        const result = await action(req);
        if (result === undefined) return res.status(204).end();
        res.json(result);
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

router.get(
    '/triage/settings',
    handle((req) => settings.getTriageSettings(req.currentUser))
);
router.put(
    '/triage/settings',
    handle((req) => settings.saveTriageSettings(req.currentUser, req.body))
);

const answer = handle((req) =>
    contexts.answerQuestion(req.currentUser, req.body ?? {})
);
router.post('/triage/answers', answer);
// The path of the retired daily brief, still sent by the Android app up to
// 1.20 (and by answers queued offline before its update): same handler.
router.post('/daily-plan/:date/brief/answers', answer);

router.get(
    '/triage/contexts',
    handle(async (req) => ({
        contexts: await contexts.listContexts(req.currentUser, req.query),
    }))
);
router.patch(
    '/triage/contexts/:uid',
    handle((req) =>
        contexts.updateContext(req.currentUser, req.params.uid, req.body ?? {})
    )
);
router.delete(
    '/triage/contexts/:uid',
    handle((req) => contexts.deleteContext(req.currentUser, req.params.uid))
);

router.post(
    '/triage/mail/:uid/decide',
    handle((req) =>
        mail.decide(req.currentUser, req.params.uid, req.body ?? {})
    )
);

module.exports = router;
