'use strict';

const Holidays = require('date-holidays');

const COUNTRY = /^[A-Z]{2}$/;
const REGION = /^[A-Z0-9]{1,10}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

const isCountry = (value) => typeof value === 'string' && COUNTRY.test(value);
const isRegion = (value) => typeof value === 'string' && REGION.test(value);

// Language codes the app uses that date-holidays knows under another name.
const LANGUAGE = { jp: 'ja', ua: 'uk' };
const languageOf = (language) => LANGUAGE[language] || language || 'en';

function listCountries(language) {
    const countries = new Holidays().getCountries(languageOf(language)) || {};
    return Object.entries(countries)
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function listRegions(country, language) {
    if (!isCountry(country)) return [];
    const regions =
        new Holidays().getStates(country, languageOf(language)) || {};
    return Object.entries(regions)
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Public holidays between two days (YYYY-MM-DD, inclusive) for a country
// and optional region, one entry per day.
function listHolidays({ country, region, start, end, language }) {
    if (!isCountry(country) || !DAY.test(start || '') || !DAY.test(end || '')) {
        return [];
    }
    if (start > end) return [];
    const span = (Date.parse(end) - Date.parse(start)) / 86400000;
    if (span > MAX_DAYS) return [];

    const calendar = isRegion(region)
        ? new Holidays(country, region, { languages: [languageOf(language)] })
        : new Holidays(country, { languages: [languageOf(language)] });
    const years = [];
    for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
        years.push(y);
    }

    const byDay = new Map();
    years
        .flatMap((year) => calendar.getHolidays(year) || [])
        .filter((h) => h.type === 'public')
        .forEach((h) => {
            const date = h.date.slice(0, 10);
            if (date < start || date > end || byDay.has(date)) return;
            byDay.set(date, { date, name: h.name });
        });
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = {
    isCountry,
    isRegion,
    listCountries,
    listRegions,
    listHolidays,
};
