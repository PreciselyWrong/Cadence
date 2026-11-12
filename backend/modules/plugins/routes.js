'use strict';

const express = require('express');
const controller = require('./controller');
const registry = require('./registry');

const router = express.Router();

// Admin only (checked in the service).
router.get('/plugins', controller.list);
router.post('/plugins/install', controller.install);
router.delete('/plugins/:id', controller.remove);
router.post('/plugins/:id/pull', controller.pull);
router.post('/plugins/reload', controller.reloadAll);
router.patch('/plugins/:id', controller.update);
router.post('/plugins/:id/reload', controller.reloadOne);
router.post('/plugins/:id/check-update', controller.checkUpdate);

// For any signed-in user: sidebar entries, and what a running plugin serves.
router.get('/plugins/menu', controller.menu);
router.get('/plugins/sdk.js', controller.sdk);
router.use('/plugins/:id/ui', registry.uiHandler);
router.use('/plugins/:id/x', registry.routeHandler);

module.exports = router;
