'use strict';

const express = require('express');
const links = require('./service');
const { logError } = require('../../services/logService');

const router = express.Router();

const handle = (action) => async (req, res) => {
    try {
        res.json(await action(req));
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        logError({ error }, 'Links request failed');
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.get(
    '/links',
    handle((req) => links.list(req.currentUser.id, req.query))
);
router.post(
    '/links',
    handle((req) => links.create(req.currentUser.id, req.body))
);
router.get(
    '/links/lookup',
    handle((req) => links.lookup(req.currentUser, req.query))
);
router.post('/links/task', async (req, res) => {
    try {
        res.status(201).json(
            await links.captureTask(req.currentUser, req.body)
        );
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        logError({ error }, 'Link task capture failed');
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post(
    '/links/import',
    handle((req) => links.importLinks(req.currentUser.id, req.body?.items))
);
router.get(
    '/links/:uid',
    handle(async (req) => ({
        link: await links.get(req.currentUser.id, req.params.uid),
    }))
);
router.patch(
    '/links/:uid',
    handle(async (req) => ({
        link: await links.update(req.currentUser.id, req.params.uid, req.body),
    }))
);
router.delete(
    '/links/:uid',
    handle((req) => links.remove(req.currentUser.id, req.params.uid))
);

module.exports = router;
