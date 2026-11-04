'use strict';

const express = require('express');
const agentsController = require('./controller');

const router = express.Router();

router.get('/agents/settings', agentsController.getSettings);
router.put('/agents/settings', agentsController.saveSettings);
router.post('/agents/test', agentsController.test);

module.exports = router;
