// Pure helpers of the brief timeline: the axis, positions and labels. The
// axis is fixed for now (08:00 to 22:00), see docs/fork/WEB-UX-NOTES.md.

export const AXIS_START = 8 * 60;
export const AXIS_END = 22 * 60;
const AXIS_SPAN = AXIS_END - AXIS_START;

type Translate = (
    key: string,
    fallback: string,
    options?: Record<string, unknown>
) => string;

// "45 min", "2 h", "1 h 05".
export const minutesText = (minutes: number, t: Translate): string => {
    if (minutes < 60) {
        return t('dailyBrief.minutes', '{{count}} min', { count: minutes });
    }
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0
        ? t('dailyBrief.hours', '{{hours}} h', { hours })
        : t('dailyBrief.hoursMinutes', '{{hours}} h {{rest}}', {
              hours,
              rest: String(rest).padStart(2, '0'),
          });
};

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

// Left/width of a span in percent of the axis, clipped to it.
export const spanPercent = (
    start: number,
    end: number
): { left: number; width: number } => {
    const from = clamp(start, AXIS_START, AXIS_END);
    const to = clamp(end, AXIS_START, AXIS_END);
    return {
        left: ((from - AXIS_START) / AXIS_SPAN) * 100,
        width: Math.max(0, ((to - from) / AXIS_SPAN) * 100),
    };
};

// First letter upper-cased: CSS `capitalize` would also upper-case every word
// of a French date ("4 Novembre").
export const capitalizeFirst = (text: string): string =>
    text.charAt(0).toUpperCase() + text.slice(1);

// "ven. 6": the short weekday and the day of a stored date, in the locale.
export const shortDay = (date: string, locale: string): string =>
    new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
    }).format(new Date(`${date}T12:00:00`));

export const formatClock = (minute: number): string => {
    const hours = Math.floor(minute / 60) % 24;
    const minutes = minute % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

// "HH:mm" to minutes after midnight, or null when malformed.
export const parseClock = (value: string | undefined | null): number | null => {
    if (!value) return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(value);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
};

export interface LoadLabel {
    text: string;
    over: boolean;
}

// Task minutes against the free time of the day, emphasised when they exceed
// it. Without a capacity, only the planned minutes.
export const loadLabel = (
    planned: number,
    capacity: number | null,
    format: {
        over: (planned: number, capacity: number) => string;
        ofCapacity: (planned: number, capacity: number) => string;
        planned: (minutes: number) => string;
    }
): LoadLabel => {
    if (capacity === null) {
        return { text: format.planned(planned), over: false };
    }
    if (planned > capacity) {
        return { text: format.over(planned, capacity), over: true };
    }
    return { text: format.ofCapacity(planned, capacity), over: false };
};

// Fraction of the evening window already planned, 0 to 1.
export const eveningFill = (planned: number, capacity: number): number =>
    capacity > 0 ? clamp(planned / capacity, 0, 1) : 0;

// The day and the minute after midnight of an instant, read in an IANA
// timezone (the profile's, not the browser's). The evening review depends on it.
export const localClock = (
    now: Date,
    timezone: string
): { date: string; minute: number } => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(now);
    const read = (type: string) =>
        parts.find((part) => part.type === type)?.value ?? '';
    return {
        date: `${read('year')}-${read('month')}-${read('day')}`,
        minute: Number(read('hour')) * 60 + Number(read('minute')),
    };
};

// The evening review shows from the switch time on, when it is enabled.
export const isEveningTime = (
    evening: { enabled: boolean; switchTime: string } | undefined,
    minute: number
): boolean => {
    if (!evening?.enabled) return false;
    const switchAt = parseClock(evening.switchTime);
    return switchAt !== null && minute >= switchAt;
};

// The day after a YYYY-MM-DD date, in the same format.
export const nextDay = (date: string): string => {
    const [year, month, day] = date.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return next.toISOString().slice(0, 10);
};
