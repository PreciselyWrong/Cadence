'use strict';

const dates = require('./dates');

// Patterns over a year of day statuses (computeSummary().calendarDays): which
// weekdays and months the habit holds. Mirrors android/domain HabitPatterns.kt.
const DONE = new Set(['MINIMUM', 'IDEAL', 'ACTIVITY']);
const MISSED = new Set(['MISSED', 'NO_ACTIVITY']);

const rate = (done, counted) =>
    counted === 0 ? null : Math.round((done * 100) / counted);

const tally = () => ({ done: 0, counted: 0 });
const withRate = (t) => ({ ...t, ratePercent: rate(t.done, t.counted) });

// Today still open counts only once done, so the morning never reads as a miss.
function computePatterns(days, today) {
    const weekdays = new Map(dates.DAYS.map((day) => [day, tally()]));
    const months = new Map();
    const year = tally();
    for (const { date, status } of days) {
        const month = date.slice(0, 7);
        if (!months.has(month)) months.set(month, tally());
        const done = DONE.has(status);
        if (!done && !(MISSED.has(status) && date < today)) continue;
        for (const t of [
            weekdays.get(dates.dayOfWeekName(date)),
            months.get(month),
            year,
        ]) {
            t.counted += 1;
            if (done) t.done += 1;
        }
    }
    return {
        weekdays: [...weekdays].map(([day, t]) => ({ day, ...withRate(t) })),
        months: [...months.keys()]
            .sort()
            .map((month) => ({ month, ...withRate(months.get(month)) })),
        year: withRate(year),
    };
}

module.exports = { computePatterns };
