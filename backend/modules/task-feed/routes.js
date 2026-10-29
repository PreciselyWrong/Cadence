'use strict';

const express = require('express');
const taskFeedService = require('./service');
const { logError } = require('../../services/logService');

// Reachable without signing in: the token in the address is the key.
const publicRoutes = express.Router();
publicRoutes.get('/feeds/tasks/:token.ics', async (req, res) => {
    try {
        const user = await taskFeedService.findUserByToken(req.params.token);
        if (!user) return res.status(404).send('Not found');
        const body = await taskFeedService.buildFeed(user);
        res.set('Content-Type', 'text/calendar; charset=utf-8');
        res.set('Cache-Control', 'private, max-age=300');
        res.send(body);
    } catch (error) {
        logError('Error building task feed:', error);
        res.status(500).send('Internal server error');
    }
});

const handle = (action) => async (req, res) => {
    try {
        res.json(await action(req.currentUser.id));
    } catch (error) {
        logError('Error updating task feed:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const routes = express.Router();
routes.get('/profile/task-feed', handle(taskFeedService.status));
routes.post('/profile/task-feed', handle(taskFeedService.rotate));
routes.delete('/profile/task-feed', handle(taskFeedService.disable));

module.exports = { publicRoutes, routes };
