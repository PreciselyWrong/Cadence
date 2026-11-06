'use strict';

// The same choices as ReminderLead on the phone.
const LEAD_MINUTES = [0, 5, 10, 15, 30];
const MAX_LEAD_MINUTES = Math.max(...LEAD_MINUTES);
const DEFAULT_TIMED_REMINDERS = { enabled: true, lead_minutes: 0 };

function normalizeTimedReminders(value) {
    if (
        typeof value?.enabled !== 'boolean' ||
        !LEAD_MINUTES.includes(value.lead_minutes)
    ) {
        return null;
    }
    return { enabled: value.enabled, lead_minutes: value.lead_minutes };
}

function readTimedReminders(uiSettings) {
    let settings = uiSettings;
    if (typeof settings === 'string') {
        try {
            settings = JSON.parse(settings);
        } catch {
            settings = null;
        }
    }
    return (
        normalizeTimedReminders(settings?.timedReminders) || {
            ...DEFAULT_TIMED_REMINDERS,
        }
    );
}

module.exports = {
    MAX_LEAD_MINUTES,
    normalizeTimedReminders,
    readTimedReminders,
};
