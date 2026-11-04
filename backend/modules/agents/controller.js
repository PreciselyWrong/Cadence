'use strict';

const agentsService = require('./service');
const { UnauthorizedError } = require('../../shared/errors');

function requireUser(req) {
    if (!req.currentUser) {
        throw new UnauthorizedError('Authentication required');
    }
    return req.currentUser;
}

const agentsController = {
    async getSettings(req, res, next) {
        try {
            res.json(await agentsService.getSettings(requireUser(req)));
        } catch (err) {
            next(err);
        }
    },

    async saveSettings(req, res, next) {
        try {
            res.json(
                await agentsService.saveSettings(requireUser(req), req.body)
            );
        } catch (err) {
            next(err);
        }
    },

    async test(req, res, next) {
        try {
            res.json(await agentsService.testConnection(requireUser(req)));
        } catch (err) {
            next(err);
        }
    },
};

module.exports = agentsController;
