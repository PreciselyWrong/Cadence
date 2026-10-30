import { toLocalDateString } from '../../utils/dateUtils';

export const addDaysToToday = (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return toLocalDateString(date);
};

// A short local date for a YYYY-MM-DD day or an ISO instant.
export const formatDay = (value: string | null | undefined, locale: string) => {
    if (!value) return '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
};
