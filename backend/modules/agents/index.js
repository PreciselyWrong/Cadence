'use strict';

const routes = require('./routes');
const agentsService = require('./service');

module.exports = {
    routes,
    runRequest: agentsService.runRequest,
    denyRun: agentsService.denyRun,
};
