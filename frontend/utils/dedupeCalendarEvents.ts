import type { CalendarRangeEvent } from './calendarFeedsService';

const normalize = (value: string | null | undefined): string =>
    (value || '').trim().toLowerCase();

const compatibleLocation = (a?: string | null, b?: string | null): boolean => {
    const left = normalize(a);
    const right = normalize(b);
    return !left || !right || left === right;
};

const sameEventKey = (event: CalendarRangeEvent): string =>
    JSON.stringify([
        normalize(event.title),
        event.date,
        event.all_day,
        event.start,
        event.end,
        event.start_minute,
        event.end_minute,
    ]);

/**
 * Shows an event once when several calendars carry it (invited on a personal
 * and a work calendar, a shared calendar subscribed twice). Same key as the
 * Android app: title (trimmed, case-insensitive), day, start, end and all-day
 * flag; two different non-empty locations keep both. Events of the same
 * calendar are never merged. `priority` lists feed uids best first (the
 * owner's primary calendar first); unlisted feeds rank after, in input order.
 */
export const dedupeCalendarEvents = (
    events: CalendarRangeEvent[],
    priority: string[] = []
): CalendarRangeEvent[] => {
    const rank = (event: CalendarRangeEvent): number => {
        const index = priority.indexOf(event.feed_uid);
        return index === -1 ? priority.length : index;
    };
    const ranked = events
        .map((event, order) => ({ event, order }))
        .sort((a, b) => rank(a.event) - rank(b.event) || a.order - b.order);
    const kept = new Map<string, CalendarRangeEvent[]>();
    const survivors = new Set<CalendarRangeEvent>();
    for (const { event } of ranked) {
        const key = sameEventKey(event);
        const group = kept.get(key) ?? [];
        const duplicate = group.some(
            (other) =>
                other.feed_uid !== event.feed_uid &&
                compatibleLocation(other.location, event.location)
        );
        if (!duplicate) {
            group.push(event);
            kept.set(key, group);
            survivors.add(event);
        }
    }
    return events.filter((event) => survivors.has(event));
};
