'use strict';

const express = require('express');
const router = express.Router();
const inboxController = require('./controller');
const attachmentRoutes = require('./attachmentRoutes');
const idempotency = require('../../middleware/idempotency');

// All routes require authentication (handled by app.js middleware)

router.get('/inbox', inboxController.list);
// A retried capture (offline queue, flaky network) with the same
// Idempotency-Key answers with the first item instead of adding a copy.
router.post('/inbox', idempotency, inboxController.create);
router.post('/inbox/analyze-text', inboxController.analyzeText);
router.get('/inbox/:uid', inboxController.getOne);
router.patch('/inbox/:uid', inboxController.update);
router.delete('/inbox/:uid', inboxController.delete);
router.patch('/inbox/:uid/process', inboxController.process);

router.use(attachmentRoutes);

module.exports = router;
