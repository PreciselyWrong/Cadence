'use strict';

const moment = require('moment-timezone');
const { getSafeTimezone } = require('./timezone-utils');

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(value) {
    const match = TIME_PATTERN.exec(value || '');
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// Returns {enabled, start, end} with valid HH:mm strings, or null when the
// value is not a quiet-hours setting.
function normalizeQuietHours(value) {
    if (!value || typeof value !== 'object') return null;
    if (toMinutes(value.start) === null || toMinutes(value.end) === null) {
        return null;
    }
    return {
        enabled: value.enabled === true,
        start: value.start,
        end: value.end,
    };
}

// The instant the user's quiet window ends when `now` falls inside it,
// otherwise null. The window is read in the user's timezone and may cross
// midnight (22:00 to 07:00).
function getQuietUntil(user, now = new Date()) {
    const quiet = normalizeQuietHours(user && user.quiet_hours);
    if (!quiet || !quiet.enabled) return null;

    const start = toMinutes(quiet.start);
    const end = toMinutes(quiet.end);
    if (start === end) return null;

    const local = moment.tz(now, getSafeTimezone(user.timezone));
    const minutes = local.hours() * 60 + local.minutes();
    const overnight = start > end;
    const inside = overnight
        ? minutes >= start || minutes < end
        : minutes >= start && minutes < end;
    if (!inside) return null;

    const endsTomorrow = overnight && minutes >= start;
    const until = local.clone();
    if (endsTomorrow) until.add(1, 'day');
    until.set({
        hour: Math.floor(end / 60),
        minute: end % 60,
        second: 0,
        millisecond: 0,
    });
    return until.toDate();
}

module.exports = { normalizeQuietHours, getQuietUntil };
