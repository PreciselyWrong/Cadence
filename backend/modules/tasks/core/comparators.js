const moment = require('moment-timezone');

function compareTasksByField(a, b, field, safeTimezone) {
    switch (field) {
        case 'priority':
            return (a.priority || 0) - (b.priority || 0);

        case 'name':
            return (a.name || '').localeCompare(b.name || '');

        case 'due_date':
            if (a.due_date && b.due_date) {
                const timeA = moment.tz(a.due_date, safeTimezone);
                const timeB = moment.tz(b.due_date, safeTimezone);
                return (
                    timeA.hour() * 60 +
                    timeA.minute() -
                    (timeB.hour() * 60 + timeB.minute())
                );
            } else if (a.due_date && !b.due_date) {
                return -1;
            } else if (!a.due_date && b.due_date) {
                return 1;
            }
            return 0;

        case 'created_at':
        default:
            return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    }
}

function pinnedTime(task) {
    if (!task || !task.pinned_at) return null;
    const time = new Date(task.pinned_at).getTime();
    return Number.isNaN(time) ? null : time;
}

// Pinned tasks sort before the rest, the most recently pinned first. Returns
// 0 when neither is pinned so the list's own order applies.
function comparePinned(a, b) {
    const timeA = pinnedTime(a);
    const timeB = pinnedTime(b);
    if (timeA === null && timeB === null) return 0;
    if (timeA === null) return 1;
    if (timeB === null) return -1;
    return timeB - timeA;
}

// ORDER BY entry that puts pinned tasks first, the most recently pinned first.
const PINNED_ORDER = ['pinned_at', 'DESC NULLS LAST'];

module.exports = {
    compareTasksByField,
    comparePinned,
    PINNED_ORDER,
};
