'use strict';

const { publicRoutes, routes } = require('./routes');
const taskFeedService = require('./service');

module.exports = { publicRoutes, routes, taskFeedService };
