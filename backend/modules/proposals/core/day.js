'use strict';

// Calendar days as YYYY-MM-DD strings. Pure date arithmetic, UTC-based, so
// it never depends on the server's timezone.
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const isDay = (value) =>
    typeof value === 'string' &&
    DAY.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const addDays = (day, count) =>
    new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS)
        .toISOString()
        .slice(0, 10);

const daysBetween = (from, to) =>
    Math.round(
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
            DAY_MS
    );

const listDays = (start, end) => {
    const days = [];
    for (let i = 0; i <= daysBetween(start, end); i += 1) {
        days.push(addDays(start, i));
    }
    return days;
};

module.exports = { isDay, addDays, daysBetween, listDays };
