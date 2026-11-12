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

const menu = (req, res) => res.json({ items: registry.menuItems() });

module.exports = {
    menu,
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
