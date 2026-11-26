'use strict';

const express = require('express');
const service = require('./service');
const { logError } = require('../../services/logService');
const { AppError } = require('../../shared/errors');
const { requireTaskWriteAccess } = require('../tasks/middleware/access');
const todoMd = require('../todo-md');

const router = express.Router();

const handle =
    (action, status = 200) =>
    async (req, res) => {
        try {
            res.status(status).json(await action(req));
        } catch (error) {
            if (error instanceof AppError) {
                return res
                    .status(error.statusCode)
                    .json({ error: error.message });
            }
            logError({ error }, 'Task breakdown request failed');
            res.status(500).json({ error: 'Internal server error' });
        }
    };

// A task from a TODO.md file gets no subtasks (docs/35-todo-md-projects.md).
const guards = [requireTaskWriteAccess, todoMd.guards.refuseFileTask];

router.get(
    '/breakdown/settings',
    handle((req) => service.getSettings(req.currentUser))
);
router.put(
    '/breakdown/settings',
    handle((req) => service.updateSettings(req.currentUser, req.body ?? {}))
);
router.post(
    '/task/:uid/breakdown',
    guards,
    handle((req) => service.propose(req.currentUser, req.params.uid))
);
router.post(
    '/task/:uid/breakdown/apply',
    guards,
    handle(
        (req) => service.apply(req.currentUser, req.params.uid, req.body),
        201
    )
);

module.exports = router;
