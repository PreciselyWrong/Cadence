import { Task } from '../../../entities/Task';
import type { CalendarEvent } from '../../../utils/calendarFeedsService';
import { DayLine, DayLines } from '../dayModel';
import {
    buildTodayTimeline,
    fillFreeSlot,
    MIN_FREE_MINUTES,
} from '../todayTimeline';

const task = (uid: string, fields: Partial<Task> = {}): Task =>
    ({
        uid,
        name: `Task ${uid}`,
        status: 0,
        ...fields,
    }) as Task;

const line = (uid: string, fields: Partial<DayLine> = {}): DayLine => ({
    uid,
    task: task(uid),
    planned: true,
    start: null,
    dueMinute: null,
    duration: 30,
    durationKnown: true,
    done: false,
    ...fields,
});

const event = (
    uid: string,
    startMinute: number,
    endMinute: number,
    allDay = false
): CalendarEvent => ({
    uid,
    title: `Event ${uid}`,
    all_day: allDay,
    busy: true,
    start: '',
    end: '',
    start_minute: allDay ? null : startMinute,
    end_minute: allDay ? null : endMinute,
    feed_uid: 'f1',
    feed_name: 'Work',
    color: null,
});

const linesOf = (
    timed: DayLine[],
    anytime: DayLine[] = [],
    done: DayLine[] = []
): DayLines => ({ timed, anytime, done });

describe('buildTodayTimeline', () => {
    it('moves missed timed tasks to the top of toPlace before untimed tasks', () => {
        const lines = linesOf(
            [
                line('missed-late', { start: 540, duration: 30 }), // 09:00-09:30
                line('missed-early', { dueMinute: 480, duration: 30 }), // 08:00-08:30
                line('ongoing', { start: 585, duration: 60 }), // 09:45-10:45
                line('later', { start: 720, duration: 30 }), // 12:00-12:30
            ],
            [line('untimed')]
        );
        const now = 600; // 10:00

        const tl = buildTodayTimeline(lines, [], now);

        expect(tl.toPlace.map((p) => [p.line.uid, p.missedAt])).toEqual([
            ['missed-early', 480],
            ['missed-late', 540],
            ['untimed', null],
        ]);

        const kinds = tl.entries.map((e) =>
            e.kind === 'task'
                ? `task:${e.line.uid}`
                : e.kind === 'event'
                  ? `event:${e.event.uid}`
                  : e.kind
        );
        expect(kinds).toEqual(['task:ongoing', 'now', 'free', 'task:later']);
        const free = tl.entries.find((e) => e.kind === 'free');
        expect(free).toEqual({
            kind: 'free',
            startMinute: 645, // max(now=600, ongoingEnd=645)
            endMinute: 720,
            minutes: 75,
        });
        const laterItem = tl.entries.find(
            (e) => e.kind === 'task' && e.line.uid === 'later'
        );
        expect(laterItem).toMatchObject({ next: true, past: false });
    });

    it('marks past events as past, highlights next item, and marks tasks overlapping an event', () => {
        const lines = linesOf([
            line('overlap', { start: 690, duration: 30 }), // 11:30-12:00 during e2
            line('after', { start: 780, duration: 30 }), // 13:00-13:30
        ]);
        const events = [
            event('allday', 0, 0, true),
            event('past-ev', 480, 540), // 08:00-09:00
            event('e2', 660, 720), // 11:00-12:00
        ];
        const now = 600; // 10:00

        const tl = buildTodayTimeline(lines, events, now);

        expect(tl.entries[0]).toMatchObject({
            kind: 'event',
            event: { uid: 'allday' },
        });
        expect(tl.entries[1]).toMatchObject({
            kind: 'event',
            event: { uid: 'past-ev' },
            past: true,
        });
        expect(tl.entries[2]).toMatchObject({ kind: 'now', minute: 600 });
        expect(tl.entries[3]).toMatchObject({
            kind: 'free',
            startMinute: 600,
            endMinute: 660,
            minutes: 60,
        });
        expect(tl.entries[4]).toMatchObject({
            kind: 'event',
            event: { uid: 'e2' },
            next: true,
            overlaps: false,
        });
        expect(tl.entries[5]).toMatchObject({
            kind: 'task',
            line: { uid: 'overlap' },
            overlaps: true,
            next: false,
        });
    });

    it('omits free slot when gap is shorter than MIN_FREE_MINUTES', () => {
        const lines = linesOf([
            line('soon', { start: 600 + MIN_FREE_MINUTES - 1, duration: 30 }),
        ]);
        const tl = buildTodayTimeline(lines, [], 600);
        expect(tl.entries.some((e) => e.kind === 'free')).toBe(false);
    });

    it('places events before tasks at the same start minute', () => {
        const lines = linesOf([line('t1', { start: 660, duration: 30 })]);
        const events = [event('e1', 660, 720)];
        const tl = buildTodayTimeline(lines, events, 600);
        const items = tl.entries.filter(
            (e) => e.kind === 'event' || e.kind === 'task'
        );
        expect(items.map((e) => e.kind)).toEqual(['event', 'task']);
        expect(items[1]).toMatchObject({ overlaps: true });
    });

    it('handles non-today days (now = null) without now line or missed tasks', () => {
        const lines = linesOf(
            [line('t1', { start: 540, duration: 30 })],
            [line('a1')]
        );
        const tl = buildTodayTimeline(lines, [], null);
        expect(tl.toPlace.map((p) => p.line.uid)).toEqual(['a1']);
        expect(tl.entries.some((e) => e.kind === 'now')).toBe(false);
        expect(tl.entries[0]).toMatchObject({
            kind: 'task',
            line: { uid: 't1' },
            next: true,
        });
    });
});

describe('fillFreeSlot', () => {
    it('packs toPlace tasks from the next quarter hour, skipping ones too long', () => {
        const toPlace = [
            { line: line('a', { duration: 30 }), missedAt: null },
            { line: line('too-long', { duration: 60 }), missedAt: null },
            { line: line('b', { duration: 15 }), missedAt: null },
        ];
        const free = {
            kind: 'free' as const,
            startMinute: 605, // rounds up to 615 (10:15)
            endMinute: 660, // 11:00 -> 45 min available
            minutes: 55,
        };
        expect(fillFreeSlot(toPlace, free)).toEqual([
            { uid: 'a', startMinute: 615, durationMinutes: 30 },
            { uid: 'b', startMinute: 645, durationMinutes: 15 },
        ]);
    });
});
