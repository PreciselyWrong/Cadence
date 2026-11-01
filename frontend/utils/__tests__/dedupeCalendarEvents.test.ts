import { dedupeCalendarEvents } from '../dedupeCalendarEvents';
import type { CalendarRangeEvent } from '../calendarFeedsService';

const event = (
    uid: string,
    feed: string,
    over: Partial<CalendarRangeEvent> = {}
): CalendarRangeEvent => ({
    uid,
    title: 'Dentiste',
    all_day: false,
    busy: true,
    start: '2026-10-30T09:00:00',
    end: '2026-10-30T10:00:00',
    start_minute: 540,
    end_minute: 600,
    feed_uid: feed,
    feed_name: feed,
    color: null,
    date: '2026-10-30',
    ...over,
});

describe('dedupeCalendarEvents', () => {
    it('keeps one event carried by two calendars, ignoring case and spaces', () => {
        const result = dedupeCalendarEvents([
            event('a', 'f1'),
            event('b', 'f2', { title: '  dentiste ' }),
        ]);
        expect(result.map((e) => e.uid)).toEqual(['a']);
    });

    it('prefers the listed priority calendar, else the first', () => {
        const events = [event('a', 'f1'), event('b', 'f2')];
        expect(dedupeCalendarEvents(events, ['f2']).map((e) => e.uid)).toEqual([
            'b',
        ]);
        expect(dedupeCalendarEvents(events).map((e) => e.uid)).toEqual(['a']);
    });

    it('keeps same title at another time or another day', () => {
        const result = dedupeCalendarEvents([
            event('a', 'f1'),
            event('b', 'f2', { start_minute: 660, end_minute: 720 }),
            event('c', 'f2', { date: '2026-10-31' }),
        ]);
        expect(result).toHaveLength(3);
    });

    it('merges all-day duplicates but not an all-day with a timed event', () => {
        const allDay = { all_day: true, start_minute: null, end_minute: null };
        expect(
            dedupeCalendarEvents([
                event('a', 'f1', allDay),
                event('b', 'f2', allDay),
            ])
        ).toHaveLength(1);
        expect(
            dedupeCalendarEvents([event('a', 'f1', allDay), event('b', 'f2')])
        ).toHaveLength(2);
    });

    it('never merges two events of the same calendar', () => {
        expect(
            dedupeCalendarEvents([event('a', 'f1'), event('b', 'f1')])
        ).toHaveLength(2);
    });

    it('keeps both when the locations differ, merges when one is empty', () => {
        const a = event('a', 'f1', { location: 'Room A' });
        const b = event('b', 'f2', { location: 'room b' });
        const c = event('c', 'f2', { location: null });
        expect(dedupeCalendarEvents([a, b])).toHaveLength(2);
        expect(dedupeCalendarEvents([a, c])).toHaveLength(1);
    });

    it('keeps recurring instances apart by day', () => {
        const result = dedupeCalendarEvents([
            event('a', 'f1', { date: '2026-10-30' }),
            event('a', 'f1', { date: '2026-10-31' }),
            event('b', 'f2', { date: '2026-10-30' }),
            event('b', 'f2', { date: '2026-10-31' }),
        ]);
        expect(result.map((e) => `${e.uid}${e.date}`)).toEqual([
            'a2026-10-30',
            'a2026-10-31',
        ]);
    });
});
