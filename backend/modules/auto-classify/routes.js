'use strict';

const express = require('express');
const service = require('./service');
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
        logError({ error }, 'Auto-classify request failed');
        res.status(500).json({ error: 'Internal server error' });
    }
};

const user = (req) => req.currentUser;

router.get(
    '/auto-classify/settings',
    handle((req) => service.getSettings(user(req)))
);
router.put(
    '/auto-classify/settings',
    handle((req) => service.updateSettings(user(req), req.body ?? {}))
);
router.get(
    '/auto-classify/runs',
    handle((req) => service.listRuns(user(req)))
);
router.post(
    '/auto-classify/runs/:runId/undo',
    handle((req) => service.undoRun(user(req), req.params.runId))
);
router.post(
    '/auto-classify/changes/:id/undo',
    handle((req) => service.undoChange(user(req), req.params.id))
);
router.get(
    '/auto-classify/marks',
    handle((req) =>
        service.listMarks(user(req), {
            entity: req.query.entity,
            uid: req.query.uid,
        })
    )
);
router.get(
    '/auto-classify/suggestions',
    handle(async (req) => ({
        suggestions: await service.listSuggestions(user(req)),
    }))
);
router.post(
    '/auto-classify/suggestions/:uid/apply',
    handle((req) =>
        service.applySuggestion(user(req), req.params.uid, req.body?.choice)
    )
);
router.post(
    '/auto-classify/suggestions/:uid/dismiss',
    handle((req) => service.dismissSuggestion(user(req), req.params.uid))
);
router.post(
    '/auto-classify/retry',
    handle((req) => service.retryFailed(user(req)))
);
router.post(
    '/auto-classify/dry-run',
    handle((req) => service.dryRun(user(req), req.body ?? {}))
);

module.exports = router;
