'use strict';

const routes = require('./routes');
const dispatcher = require('./dispatcher');
const taskEvents = require('./taskEvents');
const captureEvents = require('./captureEvents');

taskEvents.register();
captureEvents.register();

module.exports = { routes, dispatcher };
