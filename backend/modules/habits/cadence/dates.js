'use strict';

// Civil dates as 'YYYY-MM-DD' strings, computed on UTC epoch days so no
// timezone or DST ever shifts a date. Mirrors java.time.LocalDate for the
// operations the Cadence rules use (android/domain).

const DAY_MS = 86400000;
const FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
];

function format(d) {
    const y = String(d.getUTCFullYear()).padStart(4, '0');
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parse(date) {
    const match = typeof date === 'string' && FORMAT.exec(date);
    if (!match) throw new Error(`Invalid date: ${date}`);
    const ms = Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
    );
    if (format(new Date(ms)) !== date) {
        throw new Error(`Invalid date: ${date}`);
    }
    return ms;
}

const isDate = (value) => {
    try {
        parse(value);
        return true;
    } catch {
        return false;
    }
};

const epochDay = (date) => Math.round(parse(date) / DAY_MS);
const fromEpochDay = (n) => format(new Date(n * DAY_MS));
const plusDays = (date, n) => fromEpochDay(epochDay(date) + n);
const minusDays = (date, n) => plusDays(date, -n);
const daysBetween = (from, to) => epochDay(to) - epochDay(from);
const weeksBetween = (from, to) => Math.trunc(daysBetween(from, to) / 7);

// 1 (Monday) to 7 (Sunday), like java.time.DayOfWeek.getValue(). Epoch day 0
// (1970-01-01) was a Thursday.
function dayOfWeekValue(date) {
    return ((((epochDay(date) + 3) % 7) + 7) % 7) + 1;
}

const dayOfWeekName = (date) => DAYS[dayOfWeekValue(date) - 1];
const withDayOfMonth1 = (date) => `${date.slice(0, 8)}01`;

// Like LocalDate.plusMonths: the day of month is clamped to the target month.
function plusMonths(date, n) {
    const [y, m, d] = date.split('-').map(Number);
    const index = y * 12 + (m - 1) + n;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = Math.min(d, last);
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const plusWeeks = (date, n) => plusDays(date, 7 * n);

module.exports = {
    DAYS,
    isDate,
    plusDays,
    minusDays,
    plusMonths,
    plusWeeks,
    daysBetween,
    weeksBetween,
    dayOfWeekValue,
    dayOfWeekName,
    withDayOfMonth1,
};
