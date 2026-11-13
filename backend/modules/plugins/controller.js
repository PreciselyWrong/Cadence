'use strict';

const service = require('./service');
const registry = require('./registry');
const { getAuthenticatedUserId } = require('../../utils/request-utils');

const handle = (fn) => async (req, res, next) => {
    try {
        res.json(await fn(getAuthenticatedUserId(req), req));
    } catch (error) {
        next(error);
    }
};

const sdkSource = require('./sdk');

const sdk = (req, res) => {
    res.set('Content-Type', 'application/javascript; charset=utf-8');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-cache');
    res.send(sdkSource);
};

const menu = (req, res) =>
    res.json({ items: registry.menuItems(), actions: registry.pageActions() });

module.exports = {
    menu,
    sdk,
    install: handle((userId, req) => service.install(userId, req.body?.url)),
    remove: handle((userId, req) => service.remove(userId, req.params.id)),
    pull: handle((userId, req) => service.pull(userId, req.params.id)),
    list: handle((userId) => service.list(userId)),
    update: handle((userId, req) =>
        service.update(userId, req.params.id, req.body)
    ),
    reloadAll: handle((userId) => service.reloadAll(userId)),
    reloadOne: handle((userId, req) =>
        service.reloadOne(userId, req.params.id)
    ),
    checkUpdate: handle((userId, req) =>
        service.checkUpdate(userId, req.params.id)
    ),
};
