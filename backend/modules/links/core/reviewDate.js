'use strict';

const moment = require('moment-timezone');

// A parked link comes back for review this many days after it was parked.
const LATER_REVIEW_DAYS = 30;

const isDay = (value) =>
    typeof value === 'string' && moment(value, 'YYYY-MM-DD', true).isValid();

const laterReviewDay = () =>
    moment().add(LATER_REVIEW_DAYS, 'days').format('YYYY-MM-DD');

module.exports = { isDay, laterReviewDay, LATER_REVIEW_DAYS };
