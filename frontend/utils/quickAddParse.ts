// Quick-add parsing for the Plan page: reads a date, a time, a duration, a
// project, tags and a priority out of one typed line and returns the title
// that is left. Pure: "now" and the projects are passed in.
//
// Keywords are read in French and in English whatever the locale. The locale
// only decides how a numeric date is ordered: "12/11" is 12 November, except
// for en-US where it is 11 December.

export type QuickAddPriority = 'high' | 'medium' | 'low';

export interface QuickAddProject {
    id: number | string;
    name: string;
}

export interface QuickAddOptions {
    now: Date;
    locale: string;
    projects: QuickAddProject[];
}

export interface QuickAddResult {
    name: string;
    /** Local calendar day, YYYY-MM-DD. */
    date?: string;
    /** Minutes after midnight. */
    startMinute?: number;
    durationMinutes?: number;
    projectId?: number | string;
    tags: string[];
    priority?: QuickAddPriority;
}

const END = '(?=$|[\\s,;:!?])';

const PRIORITY_PATTERN = /(^|\s)(?:!([123])|p([123]))(?=$|[\s,;:!?])/gi;
const PRIORITY_BY_DIGIT: Record<string, QuickAddPriority> = {
    '1': 'high',
    '2': 'medium',
    '3': 'low',
};

const AFTER_TOMORROW_PATTERN =
    /(^|\s)(?:apr[èe]s[- ]demain|(?:the\s+)?day\s+after\s+tomorrow|after\s+tomorrow)(?=$|[\s,;:!?])/gi;
const TODAY_PATTERN = /(^|\s)(?:aujourd(?:['’]|\s)?hui|today)(?=$|[\s,;:!?])/gi;
const TOMORROW_PATTERN = /(^|\s)(?:demain|tomorrow)(?=$|[\s,;:!?])/gi;
const IN_DAYS_PATTERN =
    /(^|\s)(?:dans\s+(\d{1,3})\s+jours?|in\s+(\d{1,3})\s+days?)(?=$|[\s,;:!?])/gi;

const WEEKDAY_PATTERN =
    /(^|\s)(?:(?:le|on|next)\s+)?(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:prochain|prochaine|next))?(?=$|[\s,;:!?])/gi;
const WEEKDAY_INDEX: Record<string, number> = {
    dimanche: 0,
    lundi: 1,
    mardi: 2,
    mercredi: 3,
    jeudi: 4,
    vendredi: 5,
    samedi: 6,
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
};

const NUMERIC_DATE_PATTERN =
    /(^|\s)(?:le\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?=$|[\s,;:!?])/gi;

// Full names and common abbreviations. "may" is left out: it is also a verb.
const MONTH =
    '(janvier|janv|jan|january|f[ée]vrier|f[ée]vr|f[ée]v|feb|february|mars|mar|march|avril|avr|apr|april|mai|juin|jun|june|juillet|juil|jul|july|ao[uû]t|aug|august|septembre|sept|sep|september|octobre|oct|october|novembre|nov|november|d[ée]cembre|d[ée]c|dec|december)\\.?';
const MONTH_NUMBER: Record<string, number> = {
    janvier: 1,
    janv: 1,
    jan: 1,
    january: 1,
    fevrier: 2,
    fevr: 2,
    fev: 2,
    feb: 2,
    february: 2,
    mars: 3,
    mar: 3,
    march: 3,
    avril: 4,
    avr: 4,
    apr: 4,
    april: 4,
    mai: 5,
    juin: 6,
    jun: 6,
    june: 6,
    juillet: 7,
    juil: 7,
    jul: 7,
    july: 7,
    aout: 8,
    aug: 8,
    august: 8,
    septembre: 9,
    sept: 9,
    sep: 9,
    september: 9,
    octobre: 10,
    oct: 10,
    october: 10,
    novembre: 11,
    nov: 11,
    november: 11,
    decembre: 12,
    dec: 12,
    december: 12,
};

// "12 nov", "le 1er novembre 2027"
const DAY_MONTH_PATTERN = new RegExp(
    `(^|\\s)(?:le\\s+)?(\\d{1,2})(?:er|re|st|nd|rd|th)?\\s+${MONTH}(?:\\s+(\\d{4}))?${END}`,
    'gi'
);
// "nov 12", "Nov 12th, 2027"
const MONTH_DAY_PATTERN = new RegExp(
    `(^|\\s)(?:on\\s+)?${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${END}`,
    'gi'
);

// "14h", "14h30", "14:30", "2pm", "2:30 pm", with an optional "à"/"at" marker.
const TIME_PATTERN =
    /(^|\s)((?:à|a|at|vers)\s+)?(?:(\d{1,2}):(\d{2})|(\d{1,2})h(\d{2})?|(\d{1,2})\s?(am|pm))(?:\s?(am|pm))?(?=$|[\s,;:!?])/gi;

// "1h", "1h30" (a duration unless marked as a time, see timeOfMatch).
const HOUR_DURATION_PATTERN =
    /(^|\s)((?:pendant|durant|for)\s+)?(\d{1,2})h(\d{1,2})?(?=$|[\s,;:!?])/gi;
// "30min", "45 min", "20mn", "30 minutes". A bare "m" is not a unit here:
// "5m de câble" keeps its word.
const MINUTE_DURATION_PATTERN =
    /(^|\s)((?:pendant|durant|for)\s+)?(\d{1,3})\s?(minutes|minute|mins|min|mn)(?=$|[\s,;:!?])/gi;

const MAX_DURATION_MINUTES = 24 * 60;
const MAX_HASH_WORDS = 8;

interface Span {
    start: number;
    end: number;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

const isoDate = (year: number, month: number, day: number): string =>
    `${year}-${pad2(month)}-${pad2(day)}`;

const todayIso = (now: Date): string =>
    isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());

const isoOffset = (now: Date, days: number): string => {
    const shifted = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + days
    );
    return isoDate(
        shifted.getFullYear(),
        shifted.getMonth() + 1,
        shifted.getDate()
    );
};

const isRealDay = (year: number, month: number, day: number): boolean => {
    const date = new Date(year, month - 1, day);
    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
};

// A day and month without a year: the next time it comes, today included.
const resolveDayMonth = (
    now: Date,
    day: number,
    month: number,
    year?: number
): string | undefined => {
    if (year !== undefined) {
        return isRealDay(year, month, day)
            ? isoDate(year, month, day)
            : undefined;
    }
    const thisYear = now.getFullYear();
    if (!isRealDay(thisYear, month, day)) return undefined;
    const candidate = isoDate(thisYear, month, day);
    if (candidate >= todayIso(now)) return candidate;
    return isRealDay(thisYear + 1, month, day)
        ? isoDate(thisYear + 1, month, day)
        : undefined;
};

const twoDigitYear = (value: string): number =>
    value.length === 2 ? 2000 + Number(value) : Number(value);

const monthOf = (word: string): number | undefined =>
    MONTH_NUMBER[
        word
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/\.$/, '')
    ];

const weekdayIso = (now: Date, weekday: number, forceNext: boolean): string => {
    let diff = (weekday - now.getDay() + 7) % 7;
    if (diff === 0 && forceNext) diff = 7;
    return isoOffset(now, diff);
};

// Numeric dates read day first, except for en-US.
const isMonthFirst = (locale: string): boolean => /^en(?:-US)?$/i.test(locale);

// 14h / 14:30 / 2pm, as clock times (minutes after midnight). A bare "1h30"
// or "2h" with no marker and an hour under 7 is a duration, not a time.
const timeOfMatch = (match: RegExpMatchArray): number | undefined => {
    const hasMarker = match[2] !== undefined;
    let hour: number;
    let minute = 0;
    if (match[3] !== undefined) {
        hour = Number(match[3]);
        minute = Number(match[4]);
    } else if (match[5] !== undefined) {
        hour = Number(match[5]);
        minute = match[6] !== undefined ? Number(match[6]) : 0;
    } else {
        hour = Number(match[7]);
    }
    const meridiem = (match[8] ?? match[9])?.toLowerCase();
    if (minute > 59) return undefined;
    if (meridiem) {
        if (hour < 1 || hour > 12) return undefined;
        hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0);
    } else if (hour > 23) {
        return undefined;
    } else if (match[5] !== undefined && !hasMarker && hour < 7) {
        return undefined;
    }
    return hour * 60 + minute;
};

const durationOfHours = (match: RegExpMatchArray): number | undefined => {
    const hours = Number(match[3]);
    const minutes = match[4] !== undefined ? Number(match[4]) : 0;
    if (minutes > 59) return undefined;
    const total = hours * 60 + minutes;
    return total > 0 && total <= MAX_DURATION_MINUTES ? total : undefined;
};

const durationOfMinutes = (match: RegExpMatchArray): number | undefined => {
    const total = Number(match[3]);
    return total > 0 && total <= MAX_DURATION_MINUTES ? total : undefined;
};

const normalizeText = (value: string): string =>
    value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

const findProject = (
    projects: QuickAddProject[],
    label: string
): QuickAddProject | undefined => {
    const wanted = normalizeText(label);
    if (!wanted) return undefined;
    return projects.find((project) => normalizeText(project.name) === wanted);
};

// Replaces [start, end) with spaces, keeping every other position.
const blank = (text: string, start: number, end: number): string =>
    text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);

const stripTrailingPunctuation = (value: string): string =>
    value.replace(/[.,;:!?]+$/, '');

interface HashCandidate {
    label: string;
    end: number;
}

// The "#..." token at hash: quoted, or the words that follow it, longest first.
// A word that starts another "#" ends the token.
const hashCandidates = (text: string, hash: number): HashCandidate[] => {
    const after = hash + 1;
    if (after >= text.length || /\s/.test(text[after])) return [];
    if (text[after] === '"') {
        const close = text.indexOf('"', after + 1);
        if (close > after + 1) {
            return [
                {
                    label: text.slice(after + 1, close).trim(),
                    end: close + 1,
                },
            ];
        }
    }
    const words: { text: string; start: number }[] = [];
    for (const match of text.slice(after).matchAll(/\S+/g)) {
        if (match[0].startsWith('#') || words.length >= MAX_HASH_WORDS) break;
        words.push({ text: match[0], start: after + (match.index ?? 0) });
    }
    const candidates: HashCandidate[] = [];
    for (let count = words.length; count >= 1; count -= 1) {
        const cleaned = words
            .slice(0, count)
            .map((word) => stripTrailingPunctuation(word.text));
        const last = cleaned[count - 1];
        if (!last) continue;
        candidates.push({
            label: cleaned.join(' '),
            end: words[count - 1].start + last.length,
        });
    }
    return candidates;
};

/**
 * Reads one quick-add line. Each facet is taken from its first occurrence;
 * the spans that were read are removed from the title, and the title is left
 * empty when nothing else remains (the caller decides what to do then).
 */
export const parseQuickAdd = (
    text: string,
    options: QuickAddOptions
): QuickAddResult => {
    const { now, locale, projects } = options;
    let working = text;

    const take = <V>(
        pattern: RegExp,
        accept: (match: RegExpMatchArray) => V | undefined
    ): V | undefined => {
        for (const match of working.matchAll(pattern)) {
            const value = accept(match);
            if (value === undefined) continue;
            const index = match.index ?? 0;
            const span: Span = {
                start: index + (match[1] ?? '').length,
                end: index + match[0].length,
            };
            working =
                working.slice(0, span.start) +
                ' '.repeat(span.end - span.start) +
                working.slice(span.end);
            return value;
        }
        return undefined;
    };

    const priorityDigit = take(PRIORITY_PATTERN, (match) => {
        const digit = match[2] ?? match[3];
        return PRIORITY_BY_DIGIT[digit];
    });

    const date =
        take(AFTER_TOMORROW_PATTERN, () => isoOffset(now, 2)) ??
        take(TODAY_PATTERN, () => isoOffset(now, 0)) ??
        take(TOMORROW_PATTERN, () => isoOffset(now, 1)) ??
        take(IN_DAYS_PATTERN, (match) =>
            isoOffset(now, Number(match[2] ?? match[3]))
        ) ??
        take(WEEKDAY_PATTERN, (match) =>
            weekdayIso(
                now,
                WEEKDAY_INDEX[match[2].toLowerCase()],
                /next|prochain/i.test(match[0])
            )
        ) ??
        take(NUMERIC_DATE_PATTERN, (match) => {
            const [first, second] = [Number(match[2]), Number(match[3])];
            const [day, month] = isMonthFirst(locale)
                ? [second, first]
                : [first, second];
            const year = match[4] ? twoDigitYear(match[4]) : undefined;
            return resolveDayMonth(now, day, month, year);
        }) ??
        take(DAY_MONTH_PATTERN, (match) => {
            const month = monthOf(match[3]);
            if (month === undefined) return undefined;
            const year = match[4] ? Number(match[4]) : undefined;
            return resolveDayMonth(now, Number(match[2]), month, year);
        }) ??
        take(MONTH_DAY_PATTERN, (match) => {
            const month = monthOf(match[2]);
            if (month === undefined) return undefined;
            const year = match[4] ? Number(match[4]) : undefined;
            return resolveDayMonth(now, Number(match[3]), month, year);
        });

    const startMinute = take(TIME_PATTERN, timeOfMatch);
    const durationMinutes =
        take(HOUR_DURATION_PATTERN, durationOfHours) ??
        take(MINUTE_DURATION_PATTERN, durationOfMinutes);

    const tags: string[] = [];
    const addTag = (label: string) => {
        const wanted = label.toLowerCase();
        if (!tags.some((tag) => tag.toLowerCase() === wanted)) {
            tags.push(label);
        }
    };
    let projectId: number | string | undefined;

    // Positions do not move: every replacement keeps the length of the text.
    const hashes = [...working.matchAll(/(^|\s)#/g)].map(
        (match) => (match.index ?? 0) + (match[1] ?? '').length
    );
    for (const hash of hashes) {
        if (working[hash] !== '#') continue;
        const candidates = hashCandidates(working, hash);
        if (candidates.length === 0) continue;
        const projectHit = candidates
            .map((candidate) => ({
                candidate,
                project: findProject(projects, candidate.label),
            }))
            .find((hit) => hit.project !== undefined);
        if (projectHit?.project && projectId === undefined) {
            projectId = projectHit.project.id;
            working = blank(working, hash, projectHit.candidate.end);
            continue;
        }
        const tag = candidates[candidates.length - 1];
        if (!tag.label) continue;
        addTag(tag.label);
        working = blank(working, hash, tag.end);
    }

    const name = working
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[\s,;:–—-]+$/, '');

    const result: QuickAddResult = { name, tags };
    if (date !== undefined) result.date = date;
    if (startMinute !== undefined) result.startMinute = startMinute;
    if (durationMinutes !== undefined) {
        result.durationMinutes = durationMinutes;
    }
    if (projectId !== undefined) result.projectId = projectId;
    if (priorityDigit !== undefined) result.priority = priorityDigit;
    return result;
};
