'use strict';

const express = require('express');
const service = require('./service');
const { logError } = require('../../services/logService');
const { AppError, ForbiddenError } = require('../../shared/errors');

const router = express.Router();

// Session and API key both reach these routes through requireAuth (app.js),
// so the agent answers with its key and the user with the app.
const handle = (action) => async (req, res) => {
    try {
        const result = await action(req, res);
        if (result === undefined) return res.status(204).end();
        res.json(result);
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        logError({ error }, 'Proposal request failed');
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.post(
    '/proposals',
    handle(async (req, res) => {
        const { row, created } = await service.createProposal(
            req.currentUser,
            req.body ?? {}
        );
        res.status(created ? 201 : 200);
        return { uid: row.uid, status: row.status };
    })
);

router.get(
    '/proposals',
    handle((req) =>
        service
            .listProposals(req.currentUser, req.query)
            .then((proposals) => ({ proposals }))
    )
);

router.get(
    '/proposals/:uid',
    handle((req) => service.getProposal(req.currentUser, req.params.uid))
);

router.post(
    '/proposals/:uid/answer',
    handle((req) =>
        service.answerProposal(req.currentUser, req.params.uid, req.body ?? {})
    )
);

router.post(
    '/proposals/:uid/reply',
    handle((req) =>
        service.replyProposal(req.currentUser, req.params.uid, req.body ?? {})
    )
);

router.post(
    '/proposals/:uid/apply',
    handle((req) =>
        service.applyProposal(req.currentUser, req.params.uid, req.body ?? {})
    )
);

router.post(
    '/proposals/:uid/send',
    handle((req) =>
        service.sendProposal(req.currentUser, req.params.uid, req.body ?? {})
    )
);

// Only the agent's API key reports events (capgw). A session is refused.
router.post(
    '/proposals/:uid/events',
    handle((req) => {
        if (!req.authToken) {
            throw new ForbiddenError('Events are reported with the agent key');
        }
        return service.reportProposalEvent(
            req.currentUser,
            req.params.uid,
            req.body ?? {}
        );
    })
);

router.post(
    '/proposals/:uid/dismiss',
    handle((req) => service.dismissProposal(req.currentUser, req.params.uid))
);

module.exports = router;
