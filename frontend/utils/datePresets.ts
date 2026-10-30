import { DateShortcut, shortcutDate } from './dateShortcuts';

const pad = (n: number) => String(n).padStart(2, '0');

// Local calendar day as YYYY-MM-DD (never UTC, which shifts the day).
export const toYmd = (d: Date): string =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const datePresets = (
    now: Date,
    firstDayOfWeek = 0
): Record<DateShortcut, string> => ({
    today: toYmd(shortcutDate('today', now, firstDayOfWeek)),
    tomorrow: toYmd(shortcutDate('tomorrow', now, firstDayOfWeek)),
    weekend: toYmd(shortcutDate('weekend', now, firstDayOfWeek)),
    next_week: toYmd(shortcutDate('next_week', now, firstDayOfWeek)),
});

export interface MonthCell {
    date: string;
    inMonth: boolean;
}

// Six full weeks, so the grid keeps one height from month to month.
export const buildMonthGrid = (
    year: number,
    month: number,
    firstDayOfWeek = 0
): MonthCell[] => {
    const lead = (new Date(year, month, 1).getDay() - firstDayOfWeek + 7) % 7;
    return Array.from({ length: 42 }, (_, i) => {
        const d = new Date(year, month, 1 - lead + i);
        return { date: toYmd(d), inMonth: d.getMonth() === month };
    });
};

const NO_TIME = new Set(['', '00:00', '0:00']);

// "30 Oct 2026", plus the time when there is one. Midnight is how a whole-day
// date is stored, so it reads as no time.
export const formatDateLabel = (
    date: string,
    time: string | null | undefined,
    locale?: string
): string => {
    const [y, m, d] = date.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return date;
    const hasTime = !!time && !NO_TIME.has(time);
    const [hh, mm] = hasTime ? time!.split(':').map(Number) : [0, 0];
    const value = new Date(y, m - 1, d, hh, mm);
    const dateOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    };
    return hasTime
        ? value.toLocaleString(locale, {
              ...dateOptions,
              hour: 'numeric',
              minute: '2-digit',
          })
        : value.toLocaleDateString(locale, dateOptions);
};
