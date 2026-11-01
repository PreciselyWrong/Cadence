'use strict';

const routes = require('./routes');
const service = require('./service');
const guards = require('./guards');
const syncHook = require('./syncHook');
const watcher = require('./watcher');
const webhook = require('./webhook');

module.exports = { routes, service, guards, syncHook, watcher, webhook };
