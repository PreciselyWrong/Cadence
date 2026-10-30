'use strict';

const routes = require('./routes');
const service = require('./service');
const guards = require('./guards');
const syncHook = require('./syncHook');
const watcher = require('./watcher');

module.exports = { routes, service, guards, syncHook, watcher };
