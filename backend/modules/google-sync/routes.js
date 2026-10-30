'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./controller');

router.get('/google', controller.status);
router.get('/google/connect', controller.connect);
router.get('/google/oauth/callback', controller.callback);
router.delete('/google', controller.disconnect);
router.patch('/google/settings', controller.updateSettings);
router.post('/google/sync', controller.syncNow);
router.get('/google/log', controller.log);
router.patch('/google/calendars/:uid', controller.updateCalendar);
router.post('/google/events', controller.createEvent);
router.patch('/google/events/:calendarUid/:eventId', controller.updateEvent);
router.delete('/google/events/:calendarUid/:eventId', controller.deleteEvent);

module.exports = router;
