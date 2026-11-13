'use strict';

// Day arithmetic on YYYY-MM-DD strings. Pure: no clock, no I/O. Every rule
// compares local days, so the helpers all work on that string form. UTC
// is used for the arithmetic only, which avoids DST shifts.
const moment = require('moment-timezone');

const DAY_FORMAT = 'YYYY-MM-DD';

const addDays = (day, days) =>
    moment.utc(day, DAY_FORMAT).add(days, 'days').format(DAY_FORMAT);

// Local day of an ISO instant in the user's timezone.
function localDay(iso, timezone) {
    if (!iso) return null;
    const m = moment.tz(iso, timezone);
    return m.isValid() ? m.format(DAY_FORMAT) : null;
}

// Closed in the last `days` days, counted in the user's timezone.
function isWithinLookback(iso, { timezone, today, days }) {
    const day = localDay(iso, timezone);
    return Boolean(day) && day >= addDays(today, -days);
}

module.exports = {
    DAY_FORMAT,
    addDays,
    localDay,
    isWithinLookback,
};
