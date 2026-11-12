'use strict';

const express = require('express');
const contentLinks = require('./service');
const { peopleService } = require('../people');
const { getAuthenticatedUserId } = require('../../utils/request-utils');
const { hasAccess } = require('../../middleware/authorize');
const { extractUidFromSlug } = require('../../utils/slug-utils');
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
        logError({ error }, 'Content links request failed');
        res.status(500).json({ error: 'Internal server error' });
    }
};

const userId = (req) => getAuthenticatedUserId(req);

router.get(
    '/note/:uid/backlinks',
    hasAccess('ro', 'note', (req) => extractUidFromSlug(req.params.uid), {
        notFoundMessage: 'Note not found.',
    }),
    handle((req) =>
        contentLinks.backlinks(
            userId(req),
            'note',
            extractUidFromSlug(req.params.uid)
        )
    )
);

router.get(
    '/task/:uid/backlinks',
    hasAccess('ro', 'task', (req) => req.params.uid, {
        notFoundMessage: 'Task not found.',
    }),
    handle((req) => contentLinks.backlinks(userId(req), 'task', req.params.uid))
);

// Anyone who may open the person may see who mentions them, among the
// notes and tasks they can read themselves.
router.get(
    '/people/:uid/backlinks',
    handle(async (req) => {
        await peopleService.getByUid(userId(req), req.params.uid);
        return contentLinks.backlinks(userId(req), 'person', req.params.uid);
    })
);

router.post(
    '/content-links/resolve',
    handle((req) => contentLinks.resolve(userId(req), req.body))
);

module.exports = router;
