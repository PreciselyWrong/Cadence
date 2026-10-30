import {
    capacityState,
    focusBlockEvents,
    leftoversOf,
    placeLater,
    planAll,
    shiftFollowing,
} from '../autoPlace';
import { DailyPlanItem, FocusBlock } from '../../../utils/dailyPlanService';
import { CalendarEvent } from '../../../utils/calendarFeedsService';

const item = (
    uid: string,
    start: number | null,
    duration = 30,
    status: number | string = 0
): DailyPlanItem => ({
    task_uid: uid,
    position: 0,
    start_minute: start,
    duration_minutes: duration,
    task: { uid, name: uid, status, completed_at: null } as never,
});

const meeting = (start: number, end: number): CalendarEvent => ({
    uid: `m${start}`,
    title: 'Meeting',
    all_day: false,
    busy: true,
    start: '',
    end: '',
    start_minute: start,
    end_minute: end,
    feed_uid: 'f',
    feed_name: 'Google',
    color: null,
});

const work = { start: 9 * 60, end: 17 * 60 };
const startOf = (items: DailyPlanItem[], uid: string) =>
    items.find((i) => i.task_uid === uid)?.start_minute;

describe('planAll', () => {
    it('fills free slots first-fit in the order given', () => {
        const result = planAll(
            [
                { uid: 'a', duration: 60 },
                { uid: 'b', duration: 30 },
            ],
            [],
            [],
            work,
            0
        );
        expect(result).toEqual([
            { uid: 'a', start: 540, duration: 60 },
            { uid: 'b', start: 600, duration: 30 },
        ]);
    });

    it('skips meetings and existing blocks', () => {
        const result = planAll(
            [
                { uid: 'a', duration: 60 },
                { uid: 'b', duration: 30 },
            ],
            [item('x', 540, 30)],
            [meeting(570, 630)],
            work,
            0
        );
        expect(result[0]).toEqual({ uid: 'a', start: 630, duration: 60 });
        expect(result[1]).toEqual({ uid: 'b', start: 690, duration: 30 });
    });

    it('never starts before now, snapped to the grid', () => {
        const result = planAll([{ uid: 'a', duration: 30 }], [], [], work, 612);
        expect(result[0].start).toBe(615);
    });

    it('stays inside working hours and leaves what does not fit untimed', () => {
        const result = planAll(
            [
                { uid: 'a', duration: 420 },
                { uid: 'b', duration: 120 },
                { uid: 'c', duration: 30 },
            ],
            [],
            [],
            work,
            0
        );
        expect(result[0].start).toBe(540);
        expect(result[1].start).toBeNull();
        // A smaller later task may still use the remaining gap.
        expect(result[2].start).toBe(960);
    });

    it('treats focus blocks as reserved time', () => {
        const focus: FocusBlock[] = [
            { id: '1', days: [1], start: 540, end: 660 },
        ];
        const events = focusBlockEvents(focus, '2026-11-02');
        const result = planAll(
            [{ uid: 'a', duration: 30 }],
            [],
            events,
            work,
            0
        );
        expect(result[0].start).toBe(660);
    });

    it('does not mutate its inputs', () => {
        const items = [item('x', 540)];
        planAll([{ uid: 'a', duration: 30 }], items, [], work, 0);
        expect(items).toHaveLength(1);
    });
});

describe('focusBlockEvents', () => {
    const blocks: FocusBlock[] = [
        { id: '1', days: [1, 3], start: 540, end: 660, label: 'Deep work' },
        { id: '2', days: [2], start: 800, end: 860 },
    ];
    it('keeps the blocks that apply to the weekday of the date', () => {
        // 2026-11-02 is a Monday
        const monday = focusBlockEvents(blocks, '2026-11-02');
        expect(monday).toHaveLength(1);
        expect(monday[0]).toMatchObject({
            title: 'Deep work',
            start_minute: 540,
            end_minute: 660,
            busy: true,
            all_day: false,
        });
        expect(focusBlockEvents(blocks, '2026-11-03')).toHaveLength(1);
        expect(focusBlockEvents(blocks, '2026-11-07')).toHaveLength(0);
    });
});

describe('shiftFollowing', () => {
    it('moves the slipped block to now and pushes later blocks only as needed', () => {
        const items = [
            item('a', 540, 60),
            item('b', 600, 60),
            item('c', 720, 60),
        ];
        const result = shiftFollowing(items, 'a', [], work, 630);
        expect(startOf(result, 'a')).toBe(630);
        expect(startOf(result, 'b')).toBe(690);
        expect(startOf(result, 'c')).toBe(750);
    });

    it('keeps done blocks and later blocks that still fit', () => {
        const items = [
            item('a', 540, 30),
            item('done', 570, 30, 2),
            item('b', 900, 30),
        ];
        const result = shiftFollowing(items, 'a', [], work, 600);
        expect(startOf(result, 'done')).toBe(570);
        expect(startOf(result, 'a')).toBe(600);
        expect(startOf(result, 'b')).toBe(900);
    });

    it('works around meetings', () => {
        const items = [item('a', 540, 60), item('b', 600, 30)];
        const result = shiftFollowing(
            items,
            'a',
            [meeting(630, 720)],
            work,
            630
        );
        expect(startOf(result, 'a')).toBe(720);
        expect(startOf(result, 'b')).toBe(780);
    });

    it('drops the time of a block pushed past the end of the day', () => {
        const items = [item('a', 900, 60), item('b', 960, 60)];
        const result = shiftFollowing(items, 'a', [], work, 960);
        expect(startOf(result, 'a')).toBe(960);
        expect(startOf(result, 'b')).toBeNull();
    });
});

describe('placeLater', () => {
    it('re-places one block in the next free slot after now', () => {
        const items = [item('a', 540, 60), item('b', 660, 60)];
        const result = placeLater(items, 'a', [], work, 600);
        expect(startOf(result, 'a')).toBe(600);
        const clash = placeLater(items, 'a', [meeting(600, 660)], work, 600);
        expect(startOf(clash, 'a')).toBe(720);
    });

    it('untimes the block when the day has no room left', () => {
        const items = [item('a', 540, 60)];
        const result = placeLater(items, 'a', [meeting(600, 1020)], work, 600);
        expect(result[0].start_minute).toBeNull();
        expect(result).toHaveLength(1);
    });
});

describe('leftoversOf', () => {
    it('lists open items of yesterday that are not already on today', () => {
        const yesterday = [
            item('done', 540, 30, 2),
            item('open', 600, 30),
            item('cancelled', 660, 30, 'cancelled'),
            item('planned', 700, 30),
        ];
        const today = [item('planned', null)];
        expect(leftoversOf(yesterday, today).map((i) => i.task_uid)).toEqual([
            'open',
        ]);
    });

    it('counts a done recurring occurrence as done', () => {
        const done = { ...item('rec', 540), occurrence_done: true };
        expect(leftoversOf([done], [])).toEqual([]);
    });
});

describe('capacityState', () => {
    it('reports the filled share', () => {
        expect(capacityState(120, 480)).toMatchObject({
            percent: 25,
            over: false,
            overBy: 0,
        });
        expect(capacityState(600, 480)).toMatchObject({
            percent: 125,
            over: true,
            overBy: 120,
        });
    });

    it('is over as soon as anything is planned in a full day', () => {
        expect(capacityState(30, 0)).toMatchObject({ over: true, overBy: 30 });
        expect(capacityState(0, 0)).toMatchObject({ over: false, percent: 0 });
    });
});
