'use strict';

const routes = require('./routes');
const habitsService = require('./service');
const habitsRepository = require('./repository');
const cadenceRoutes = require('./cadence/routes');

module.exports = { routes, cadenceRoutes, habitsService, habitsRepository };
