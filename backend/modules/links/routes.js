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

module.exports = router;
