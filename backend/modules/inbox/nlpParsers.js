'use strict';

// Natural-language parsing for inbox capture: due dates ("tomorrow",
// "next fri"), recurrence ("every monday"), @person and ~area references.
// Positions are always reported against the original text so callers can
// cut the matched phrase out of the title.

const chrono = require('chrono-node');
const moment = require('moment-timezone');

const WEEKDAYS = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    tues: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    thur: 4,
    thurs: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
};

const ORDINALS = {
    first: 1,
    '1st': 1,
    second: 2,
    '2nd': 2,
    third: 3,
    '3rd': 3,
    fourth: 4,
    '4th': 4,
    last: 5,
};

// Bare words chrono reads as dates but that are usually just words.
const AMBIGUOUS_DATE_WORDS = new Set([
    'sun',
    'sat',
    'wed',
    'mar',
    'may',
    'mars',
    'mai',
]);

// Words that only introduce a due date ("until next thursday", "due by fri",
// "avant vendredi", "d'ici lundi")
const DATE_LEAD_PATTERN =
    /(^|\s)((?:due\s+(?:by|on|before)|due|until|till|by|before|avant|pour|d['’]ici|jusqu['’](?:à|au))\s+)$/i;

// chrono's French parser reads "après-demain" as "demain", so it is masked to
// "demain" and two days are added back.
const AFTER_TOMORROW_PATTERN = /\bapr[èe]s[- ]demain\b/gi;

// "le 12" alone (chrono needs a month for it). Not followed by a month name
// or a time, which chrono reads on its own.
const FRENCH_LE_DAY_PATTERN =
    /(^|\s)le\s+(\d{1,2})(?:er)?(?=[\s.,;:!?]|$)(?!\s*(?:janv|f[ée]vr|mars|avr|mai|juin|juil|ao[uû]t|sept|oct|nov|d[ée]c))/gi;

const WEEKDAY_PATTERN =
    '(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)';

// Replace #tags, +projects, @people, ~areas and URLs with spaces of equal
// length so the date parsers never match inside them and indexes stay aligned.
const maskTokens = (text) =>
    text.replace(
        /https?:\/\/\S+|(^|\s)([#+@~](?:"[^"]*"|\S+))/g,
        (match, lead = '') =>
            match.startsWith('http')
                ? ' '.repeat(match.length)
                : lead + ' '.repeat(match.length - lead.length)
    );

const todayInTimezone = (timezone) => moment.tz(timezone).format('YYYY-MM-DD');

const formatUtcDate = (date) => date.toISOString().slice(0, 10);

const firstMonthlyWeekday = (todayStr, weekday, weekOfMonth) => {
    const today = new Date(`${todayStr}T00:00:00Z`);
    const occurrenceIn = (year, month) => {
        const first = new Date(Date.UTC(year, month, 1));
        const offset = (weekday - first.getUTCDay() + 7) % 7;
        const target = new Date(Date.UTC(year, month, 1 + offset));
        target.setUTCDate(target.getUTCDate() + (weekOfMonth - 1) * 7);
        if (target.getUTCMonth() !== month) {
            target.setUTCDate(target.getUTCDate() - 7);
        }
        return target;
    };
    let candidate = occurrenceIn(today.getUTCFullYear(), today.getUTCMonth());
    if (candidate < today) {
        candidate = occurrenceIn(
            today.getUTCFullYear(),
            today.getUTCMonth() + 1
        );
    }
    return formatUtcDate(candidate);
};

const lastDayOfMonth = (todayStr) => {
    const today = new Date(`${todayStr}T00:00:00Z`);
    return formatUtcDate(
        new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))
    );
};

const firstOccurrence = (recurrence, timezone) => {
    const today = todayInTimezone(timezone);
    if (recurrence.recurrence_type === 'monthly_weekday') {
        return firstMonthlyWeekday(
            today,
            recurrence.recurrence_weekday,
            recurrence.recurrence_week_of_month
        );
    }
    if (recurrence.recurrence_type === 'monthly_last_day') {
        return lastDayOfMonth(today);
    }
    // Required lazily: builders pulls in the models layer.
    const { calculateInitialDueDate } = require('../tasks/core/builders');
    return calculateInitialDueDate(recurrence, timezone);
};

const parseWeekdayList = (list) => {
    const days = list
        .toLowerCase()
        .split(/\s*(?:,|\band\b|&)\s*/)
        .map((word) => WEEKDAYS[word.trim()])
        .filter((day) => day !== undefined);
    return [...new Set(days)].sort((a, b) => a - b);
};

const unitRecurrence = (unit, interval) => {
    const normalized = unit.toLowerCase().replace(/s$/, '');
    const type = { day: 'daily', week: 'weekly', month: 'monthly' }[normalized];
    return type
        ? { recurrence_type: type, recurrence_interval: interval }
        : null;
};

const FRENCH_WEEKDAYS = {
    dimanche: 0,
    lundi: 1,
    mardi: 2,
    mercredi: 3,
    jeudi: 4,
    vendredi: 5,
    samedi: 6,
};

const FRENCH_WEEKDAY_PATTERN =
    '(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?';

const FRENCH_UNITS = { jour: 'day', semaine: 'week', mois: 'month' };

const FRENCH_NUMBER_WORDS = { deux: 2, trois: 3, quatre: 4, cinq: 5 };

const parseFrenchWeekdayList = (list) => {
    const days = list
        .toLowerCase()
        .split(/\s*(?:,|\bet\b|&)\s*/)
        .map((word) => FRENCH_WEEKDAYS[word.trim().replace(/s$/, '')])
        .filter((day) => day !== undefined);
    return [...new Set(days)].sort((a, b) => a - b);
};

const frenchUnitRecurrence = (unit, interval) =>
    unitRecurrence(
        FRENCH_UNITS[unit.toLowerCase().replace(/s$/, '')] ??
            FRENCH_UNITS[unit.toLowerCase()],
        interval
    );

// Ordered most specific first; the first rule that matches wins.
const RECURRENCE_RULES = [
    {
        pattern: new RegExp(
            `\\bevery\\s+(first|second|third|fourth|last|1st|2nd|3rd|4th)\\s+(${WEEKDAY_PATTERN})(?:\\s+of\\s+(?:the\\s+)?month)?\\b`,
            'i'
        ),
        build: (m) => ({
            recurrence_type: 'monthly_weekday',
            recurrence_interval: 1,
            recurrence_weekday: WEEKDAYS[m[2].toLowerCase()],
            recurrence_week_of_month: ORDINALS[m[1].toLowerCase()],
        }),
    },
    {
        pattern: /\bevery\s+last\s+day(?:\s+of\s+(?:the\s+)?month)?\b/i,
        build: () => ({
            recurrence_type: 'monthly_last_day',
            recurrence_interval: 1,
        }),
    },
    {
        pattern:
            /\bevery\s+month\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b|\bevery\s+(\d{1,2})(?:st|nd|rd|th)\b/i,
        build: (m) => {
            const day = Number(m[1] || m[2]);
            if (day < 1 || day > 31) return null;
            return {
                recurrence_type: 'monthly',
                recurrence_interval: 1,
                recurrence_month_day: day,
            };
        },
    },
    {
        pattern: /\bevery\s+(?:weekday|workday)\b/i,
        build: () => ({
            recurrence_type: 'weekly',
            recurrence_interval: 1,
            recurrence_weekdays: [1, 2, 3, 4, 5],
        }),
    },
    {
        pattern: new RegExp(
            `\\bevery\\s+(${WEEKDAY_PATTERN}(?:\\s*(?:,|\\band\\b|&)\\s*${WEEKDAY_PATTERN})*)\\b`,
            'i'
        ),
        build: (m) => {
            const weekdays = parseWeekdayList(m[1]);
            if (weekdays.length === 0) return null;
            return {
                recurrence_type: 'weekly',
                recurrence_interval: 1,
                recurrence_weekdays: weekdays,
            };
        },
    },
    {
        pattern: /\bevery\s+(\d{1,3})\s+(days?|weeks?|months?)\b/i,
        build: (m) => {
            const interval = Number(m[1]);
            if (interval < 1) return null;
            return unitRecurrence(m[2], interval);
        },
    },
    {
        pattern: /\bevery\s+(other\s+)?(day|week|month)\b/i,
        build: (m) => unitRecurrence(m[2], m[1] ? 2 : 1),
    },
    {
        pattern:
            /\b(?:tous\s+les|chaque)\s+jours?\s+(?:ouvr[ée]s?|ouvrables?|de\s+semaine)\b/i,
        build: () => ({
            recurrence_type: 'weekly',
            recurrence_interval: 1,
            recurrence_weekdays: [1, 2, 3, 4, 5],
        }),
    },
    {
        pattern: new RegExp(
            `\\b(?:tous\\s+les|chaque)\\s+(${FRENCH_WEEKDAY_PATTERN}(?:\\s*(?:,|\\bet\\b|&)\\s*${FRENCH_WEEKDAY_PATTERN})*)\\b`,
            'i'
        ),
        build: (m) => {
            const weekdays = parseFrenchWeekdayList(m[1]);
            if (weekdays.length === 0) return null;
            return {
                recurrence_type: 'weekly',
                recurrence_interval: 1,
                recurrence_weekdays: weekdays,
            };
        },
    },
    {
        pattern:
            /\b(?:tous|toutes)\s+les\s+(\d{1,3}|deux|trois|quatre|cinq)\s+(jours?|semaines?|mois)\b/i,
        build: (m) => {
            const interval =
                FRENCH_NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1]);
            if (interval < 1) return null;
            return frenchUnitRecurrence(m[2], interval);
        },
    },
    {
        pattern:
            /\b(?:tous\s+les\s+(jours|mois)|toutes\s+les\s+(semaines)|chaque\s+(jour|semaine|mois))\b/i,
        build: (m) => frenchUnitRecurrence(m[1] || m[2] || m[3], 1),
    },
    {
        // Bare "daily" only at the end, so "write weekly report" stays a title.
        pattern: /\b(daily|weekly|monthly)[.!]?\s*$/i,
        build: (m) =>
            unitRecurrence(
                { daily: 'day', weekly: 'week', monthly: 'month' }[
                    m[1].toLowerCase()
                ],
                1
            ),
    },
];

const parseRecurrence = (text, { timezone = 'UTC' } = {}) => {
    const masked = maskTokens(text);
    for (const rule of RECURRENCE_RULES) {
        const match = rule.pattern.exec(masked);
        if (!match) continue;
        const recurrence = rule.build(match);
        if (!recurrence) continue;
        return {
            recurrence,
            date: firstOccurrence(recurrence, timezone),
            text: text.substr(match.index, match[0].length),
            index: match.index,
            removable: true,
        };
    }
    return null;
};

const addDaysToDate = (dateStr, days) => {
    const date = new Date(`${dateStr}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return formatUtcDate(date);
};

// Next date with this day of the month, today included, in the user timezone.
const nextDayOfMonth = (day, referenceDate, timezone) => {
    if (day < 1 || day > 31) return null;
    const today = moment.tz(referenceDate, timezone);
    for (let offset = 0; offset < 13; offset++) {
        const month = today.clone().startOf('month').add(offset, 'months');
        if (day > month.daysInMonth()) continue;
        const candidate = month.clone().date(day);
        if (candidate.isBefore(today, 'day')) continue;
        return candidate.format('YYYY-MM-DD');
    }
    return null;
};

// One chrono result as a candidate: date, optional time and the span of the
// original text it covers (end is exclusive).
const chronoCandidate = (result, { index, dayOffset = 0, fr = false }) => {
    const start = result.start;
    const date = addDaysToDate(
        [
            String(start.get('year')).padStart(4, '0'),
            String(start.get('month')).padStart(2, '0'),
            String(start.get('day')).padStart(2, '0'),
        ].join('-'),
        dayOffset
    );
    const hasTime = start.isCertain('hour');
    return {
        date,
        time: hasTime
            ? [
                  String(start.get('hour')).padStart(2, '0'),
                  String(start.get('minute') ?? 0).padStart(2, '0'),
              ].join(':')
            : null,
        hasTime,
        index,
        end: result.index + result.text.length,
        text: result.text,
        fr,
    };
};

// A bare "15h" is a time in French; English chrono reads it as a day.
const BARE_FRENCH_TIME = /^\d{1,2}h\d{0,2}$/i;

// "30 min", "1h30", "for 2 hours": a length of time, which chrono would read
// as an offset from now. "in 30 min" keeps its lead word and stays a date.
const BARE_DURATION =
    /^(?:(?:pendant|durant|for)\s+)?\d+(?:[.,]\d+)?\s*(?:hours?|hrs?|heures?|h|minutes?|mins?|mn)(?:\s*\d{1,2})?$/i;

const isUsableChronoResult = (result) => {
    const start = result.start;
    if (!start.isCertain('day') && !start.isCertain('weekday')) return false;
    const phrase = result.text.trim();
    return (
        !AMBIGUOUS_DATE_WORDS.has(phrase.toLowerCase()) &&
        !BARE_FRENCH_TIME.test(phrase) &&
        !BARE_DURATION.test(phrase)
    );
};

// English candidates, as before: the last usable match wins.
const englishCandidates = (masked, reference) =>
    chrono.casual
        .parse(masked, reference, { forwardDate: true })
        .filter(isUsableChronoResult)
        .map((result) => chronoCandidate(result, { index: result.index }));

// French candidates from chrono's French parser, plus "le 12".
const frenchCandidates = (masked, reference, { referenceDate, timezone }) => {
    const spans = [];
    const prepared = masked.replace(AFTER_TOMORROW_PATTERN, (match, offset) => {
        spans.push({ index: offset, end: offset + match.length });
        return ' '.repeat(match.length - 'demain'.length) + 'demain';
    });
    const chronoList = chrono.fr.casual
        .parse(prepared, reference, { forwardDate: true })
        .filter(isUsableChronoResult)
        .map((result) => {
            const span = spans.find(
                (s) => result.index === s.end - 'demain'.length
            );
            return span
                ? chronoCandidate(result, {
                      index: span.index,
                      // chrono has already moved "demain" to tomorrow
                      dayOffset: 1,
                      fr: true,
                  })
                : chronoCandidate(result, { index: result.index, fr: true });
        });

    const dayCandidates = [];
    for (const match of masked.matchAll(FRENCH_LE_DAY_PATTERN)) {
        const date = nextDayOfMonth(
            parseInt(match[2], 10),
            referenceDate,
            timezone
        );
        if (!date) continue;
        dayCandidates.push({
            date,
            time: null,
            hasTime: false,
            index: match.index + match[1].length,
            end: match.index + match[0].length,
            text: match[0].slice(match[1].length),
            fr: true,
        });
    }
    return [...chronoList, ...dayCandidates].sort((a, b) => a.index - b.index);
};

const parseDueDate = (
    text,
    { referenceDate = new Date(), timezone = 'UTC' } = {}
) => {
    const masked = maskTokens(text);
    const reference = {
        instant: referenceDate,
        timezone: moment.tz(referenceDate, timezone).utcOffset(),
    };
    const english = englishCandidates(masked, reference);
    const french = frenchCandidates(masked, reference, {
        referenceDate,
        timezone,
    });
    // The earliest-starting match wins; English wins a tie.
    const englishPick = english[english.length - 1] || null;
    const frenchPick = french[french.length - 1] || null;
    if (!englishPick && !frenchPick) return null;
    const candidate =
        !englishPick || (frenchPick && frenchPick.index < englishPick.index)
            ? frenchPick
            : englishPick;

    // A time in French ("demain 15h") is read as the due time and the whole
    // phrase is cut from the title. English times stay in the title.
    const removable = !candidate.hasTime || candidate.fr;
    // "until", "by" or "due" right before a cut phrase goes with it, so the
    // title does not end in "pay the bill until".
    const lead = removable
        ? DATE_LEAD_PATTERN.exec(masked.slice(0, candidate.index))
        : null;
    const index = lead ? lead.index + lead[1].length : candidate.index;

    return {
        date: candidate.date,
        time: candidate.time,
        text: text.slice(index, candidate.end),
        index,
        // The time is attached to the item, so the phrase stays in the title.
        removable,
    };
};

// @Name or @"Full Name", only at the start of a word so emails never match.
const parsePersonRef = (text) => {
    const match = /(^|\s)@(?:"([^"]+)"|([^\s"@]+))/u.exec(text);
    if (!match) return null;
    const name = (match[2] || match[3] || '').replace(/[.,;:!?)]+$/, '').trim();
    if (!name) return null;
    const start = match.index + match[1].length;
    const raw = match[2] ? match[0].slice(match[1].length) : `@${name}`;
    return { name, text: raw, index: start };
};

// Every ~Area or ~"Full Name", only at the start of a word. Like @person a
// ~word is only a reference once it names a real area, so the caller picks
// the first one that does and the rest stay in the text.
const parseAreaRefs = (text) => {
    const pattern = /(^|\s)~(?:"([^"]+)"|([^\s"~]+))/gu;
    const refs = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
        let name = (match[2] || match[3] || '').trim();
        // Trailing sentence punctuation is not part of an unquoted name
        if (!match[2]) {
            let end = name.length;
            while (end > 0 && '.,;:!?)'.includes(name.charAt(end - 1))) end--;
            name = name.slice(0, end);
        }
        if (!name) continue;
        const raw = match[2] ? match[0].slice(match[1].length) : `~${name}`;
        refs.push({
            name,
            text: raw,
            index: match.index + match[1].length,
        });
    }
    return refs;
};

// A clock time needs a marker: "à"/"at" before it ("à 9h", "at 9am", "à 9h30"),
// a colon ("14:00", "9:30") or am/pm ("9am"). A bare "9h" or "1h30" carries no
// marker and reads as a duration (see parseDuration).
const CLOCK_PATTERNS = [
    /(?<![\w])(?:à|at)\s*(\d{1,2})(?:\s*h(\d{2})?|\s*:\s*(\d{2})(?:\s*(am|pm))?|\s*(am|pm))(?![\w:])/gi,
    /(?<![\w:.,])(\d{1,2}):(\d{2})(?:\s*(am|pm))?(?![\w:])/gi,
    /(?<![\w:.,])(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?![\w])/gi,
];

const toClockTime = (hourText, minuteText, meridiem) => {
    let hour = Number(hourText);
    const minute = minuteText === undefined ? 0 : Number(minuteText);
    if (minute > 59) return null;
    if (meridiem) {
        if (hour < 1 || hour > 12) return null;
        hour = (hour % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0);
    } else if (hour > 23) {
        return null;
    }
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const clockTimes = (masked) => {
    const found = [];
    CLOCK_PATTERNS.forEach((pattern, kind) => {
        for (const match of masked.matchAll(pattern)) {
            const [, hour, a, b, c, d] = match;
            const time =
                kind === 0
                    ? toClockTime(hour, a ?? b, c ?? d)
                    : toClockTime(hour, a, b === undefined ? c : b);
            if (!time) continue;
            found.push({
                time,
                index: match.index,
                end: match.index + match[0].length,
            });
        }
    });
    found.sort((x, y) => x.index - y.index);
    // The marker form and the colon/am-pm forms can match the same text.
    return found.filter(
        (entry, i) => i === 0 || entry.index >= found[i - 1].end
    );
};

// The first clock time in the text, with its span.
const parseClockTime = (text) => {
    const first = clockTimes(maskTokens(text))[0];
    return first
        ? { ...first, text: text.slice(first.index, first.end) }
        : null;
};

const MIN_ESTIMATE_MINUTES = 5;
const MAX_ESTIMATE_MINUTES = 720;

// "1h", "1 h", "1.5h", "30 min", "1h30", "1h 30 min", optionally led by a
// keyword ("pendant 45 min", "for 30 min"). A bare hour count above 12 reads
// as a clock time ("15h") and is not a duration.
const DURATION_PATTERN = new RegExp(
    '(?<![\\w.,:/#-])(?:(pendant|durant|dur[ée]e|duration|for)(?:\\s*:\\s*|\\s+))?' +
        '(?:(\\d{1,2}(?:[.,]\\d+)?)\\s*(?:hours?|hrs?|heures?|h)' +
        '(?:\\s*(\\d{1,2})\\s*(?:minutes?|mins?|mn)|\\s?(\\d{2})(?![\\w:.,]))?' +
        '|(\\d{1,3})\\s*(?:minutes?|mins?|mn))(?![\\w:])',
    'gi'
);

// A rate ("every 30 min", "tous les 2 h") is a recurrence, not a duration.
const RATE_LEAD = /\b(?:every|chaque|les)\s+$/i;

const blankSpans = (text, spans) =>
    spans
        .filter(Boolean)
        .reduce(
            (result, span) =>
                result.slice(0, span.index) +
                ' '.repeat(span.end - span.index) +
                result.slice(span.end),
            text
        );

// Minutes of work in the text, clamped to the task bounds. `ignore` lists
// spans ({index, end}) already claimed by a date, recurrence or time.
const parseDuration = (text, { ignore = [] } = {}) => {
    const masked = blankSpans(maskTokens(text), ignore);
    const blanked = blankSpans(masked, clockTimes(masked));
    for (const match of blanked.matchAll(DURATION_PATTERN)) {
        const [, keyword, hours, minutesA, minutesB, minutesOnly] = match;
        if (RATE_LEAD.test(blanked.slice(0, match.index))) continue;
        let minutes;
        if (minutesOnly !== undefined) {
            minutes = Number(minutesOnly);
        } else {
            const hourCount = Number(hours.replace(',', '.'));
            if (!keyword && hourCount > 12) continue;
            minutes = Math.round(
                hourCount * 60 + Number(minutesA ?? minutesB ?? 0)
            );
        }
        if (!(minutes > 0)) continue;
        return {
            minutes: Math.min(
                MAX_ESTIMATE_MINUTES,
                Math.max(MIN_ESTIMATE_MINUTES, minutes)
            ),
            text: text.slice(match.index, match.index + match[0].length),
            index: match.index,
            end: match.index + match[0].length,
        };
    }
    return null;
};

// Cut the given spans out of the text and collapse the leftover spacing.
const removeSpans = (text, spans) =>
    spans
        .filter(Boolean)
        .sort((a, b) => b.index - a.index)
        .reduce(
            (result, span) =>
                result.slice(0, span.index) +
                ' ' +
                result.slice(span.index + span.text.length),
            text
        )
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/ +\n/g, '\n')
        .replace(/\n +/g, '\n')
        .trim();

module.exports = {
    maskTokens,
    parseDueDate,
    parseRecurrence,
    parseClockTime,
    parseDuration,
    parsePersonRef,
    parseAreaRefs,
    removeSpans,
};
