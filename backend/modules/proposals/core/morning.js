'use strict';

const moment = require('moment-timezone');
const { getSafeTimezone } = require('../../../utils/timezone-utils');

const TIME_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Converts a 24-hour "HH:MM" string into minutes since midnight, or null.
function parseTimeMinutes(time) {
    if (typeof time !== 'string' || !TIME_HH_MM.test(time)) return null;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

// The run starts within this many minutes after the chosen time, never later:
// a proposal arriving in the evening is not the morning's.
const WINDOW_MINUTES = 180;

// True when the morning run is enabled and the user's local clock is between
// their chosen time and three hours after it.
function isMorningRunDue({ now = new Date(), timezone, setting }) {
    if (!setting || setting.enabled !== true) return false;
    const targetMinutes = parseTimeMinutes(setting.time);
    if (targetMinutes === null) return false;
    const localNow = moment.tz(now, getSafeTimezone(timezone));
    const currentMinutes = localNow.hours() * 60 + localNow.minutes();
    return (
        currentMinutes >= targetMinutes &&
        currentMinutes < targetMinutes + WINDOW_MINUTES
    );
}

// Pure gate for the morning overdue replan job (docs/47-proposals.md):
// runs at most once per day, only when an agent listens, overdue tasks exist,
// no week proposal is already pending or created today, and the clock is due.
function shouldRunMorningReplan({
    now = new Date(),
    timezone,
    setting,
    hasOverdue,
    agentListening,
    hasWeekProposalTodayOrPending,
}) {
    if (!agentListening) return false;
    if (!hasOverdue) return false;
    if (hasWeekProposalTodayOrPending) return false;
    return isMorningRunDue({ now, timezone, setting });
}

module.exports = {
    parseTimeMinutes,
    isMorningRunDue,
    shouldRunMorningReplan,
};
