'use strict';

const express = require('express');
const service = require('./service');
const repos = require('./repos');
const watcher = require('./watcher');
const { sendError } = require('./guards');
const { logError } = require('../../services/logService');

const router = express.Router();

const isOwner = async (req) => {
    const owner = await service.ownerUser();
    return Boolean(owner && owner.id === req.currentUser.id);
};

// Only the account the projects belong to may act on them (or see the
// repositories). `action(req)` returns the JSON answer.
const ownerOnly = (label, action) => async (req, res) => {
    try {
        if (!service.isEnabled()) {
            return res.status(404).json({
                error: 'TODO.md projects are not enabled',
                code: 'todo_md_disabled',
            });
        }
        if (!(await isOwner(req))) {
            return res.status(403).json({
                error: 'Only the account that owns the TODO.md projects can do this',
                code: 'todo_md_forbidden',
            });
        }
        res.json(await action(req));
    } catch (error) {
        if (error instanceof service.TodoMdError) {
            return sendError(res, error);
        }
        logError(`TODO.md ${label} failed:`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Whether the feature is on, when the folders were last read and, for the
// owner, the state of each git repository.
router.get('/todo-md/status', async (req, res) => {
    try {
        const includeRepos = service.isEnabled() && (await isOwner(req));
        res.json(await service.status({ includeRepos }));
    } catch (error) {
        logError('TODO.md status failed:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// "Relire": read every project folder and repository again now.
router.post(
    '/todo-md/rescan',
    ownerOnly('rescan', () => watcher.rescanNow())
);

// Pending edits of a repository: push them again, or forget them.
router.post(
    '/todo-md/repos/:slug/retry',
    ownerOnly('retry', (req) => repos.retry(req.params.slug))
);
router.post(
    '/todo-md/repos/:slug/discard',
    ownerOnly('discard', (req) => repos.discard(req.params.slug))
);

module.exports = router;
