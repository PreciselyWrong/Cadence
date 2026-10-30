'use strict';

const express = require('express');
const service = require('./service');
const watcher = require('./watcher');
const { sendError } = require('./guards');
const { logError } = require('../../services/logService');

const router = express.Router();

// Whether the feature is on, and when the folders were last read.
router.get('/todo-md/status', (req, res) => {
    res.json(service.status());
});

// "Relire": read every project folder again now. Only the account the
// projects belong to may ask.
router.post('/todo-md/rescan', async (req, res) => {
    try {
        if (!service.isEnabled()) {
            return res.status(404).json({
                error: 'TODO.md projects are not enabled',
                code: 'todo_md_disabled',
            });
        }
        const owner = await service.ownerUser();
        if (!owner || owner.id !== req.currentUser.id) {
            return res.status(403).json({
                error: 'Only the account that owns the TODO.md projects can reread them',
                code: 'todo_md_forbidden',
            });
        }
        res.json(await watcher.rescanNow());
    } catch (error) {
        if (error instanceof service.TodoMdError) {
            return sendError(res, error);
        }
        logError('TODO.md rescan failed:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
