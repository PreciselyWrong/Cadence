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

router.post(
    '/links',
    handle((req) => links.create(req.currentUser.id, req.body))
);
router.get(
    '/projects/:uid/pages',
    handle((req) => links.listPages(req.currentUser, req.params.uid))
);
router.post('/projects/:uid/pages', async (req, res) => {
    try {
        const { status, body } = await links.addPages(
            req.currentUser,
            req.params.uid,
            req.body
        );
        res.status(status).json(body);
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        logError({ error }, 'Project pages request failed');
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post(
    '/projects/:uid/pages/check',
    handle((req) => links.checkPages(req.currentUser, req.params.uid))
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
