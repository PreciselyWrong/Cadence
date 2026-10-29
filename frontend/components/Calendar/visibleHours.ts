import { differenceInCalendarDays } from 'date-fns';
import type { CalendarEvent } from './taskEvents';
import { coversDay } from './taskEvents';

// The hours of the day the calendars draw: `start` is the first hour shown,
// `end` the hour the grid stops at (exclusive). Stored in
// ui_settings.calendar.visibleHours.
export interface VisibleHours {
    start: number;
    end: number;
}

export const WHOLE_DAY: VisibleHours = { start: 0, end: 24 };

// Reads a saved range; anything but whole hours with end after start falls
// back to the whole day.
export const readVisibleHours = (saved: unknown): VisibleHours => {
    const value = (saved && typeof saved === 'object' ? saved : {}) as Record<
        string,
        unknown
    >;
    const { start, end } = value;
    if (
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        (start as number) >= 0 &&
        (start as number) <= 23 &&
        (end as number) >= 1 &&
        (end as number) <= 24 &&
        (end as number) > (start as number)
    ) {
        return { start: start as number, end: end as number };
    }
    return WHOLE_DAY;
};

// Timed items of `day` that start before the window (`before`) or end after
// it (`after`), in start order. An item that spans the whole window is in
// both lists. All-day items are not hours and are left out.
export const countOutside = <T extends CalendarEvent>(
    events: T[],
    day: Date,
    hours: VisibleHours
): { before: T[]; after: T[] } => {
    const windowStart = hours.start * 60;
    const windowEnd = hours.end * 60;
    const byStart = (a: T, b: T) => a.start.getTime() - b.start.getTime();
    const dayEvents = events
        .filter((event) => !event.allDay && coversDay(event, day))
        .sort(byStart);
    const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();
    return {
        before: dayEvents.filter(
            (event) => minutesOf(event.start) < windowStart
        ),
        after: dayEvents.filter((event) => {
            const endsToday = differenceInCalendarDays(event.end, day) === 0;
            return (endsToday ? minutesOf(event.end) : 24 * 60) > windowEnd;
        }),
    };
};
