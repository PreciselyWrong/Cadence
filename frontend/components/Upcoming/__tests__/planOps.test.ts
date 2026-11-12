import {
    applyWritesLocally,
    calendarDropWrites,
    datesHolding,
    touchedDates,
    calendarRange,
    columnDates,
    columnDropWrites,
    dayString,
    inverseWrites,
    planItemUids,
    plannedLine,
    progressOf,
    reorderWrites,
    shiftDay,
    timedSpans,
    withoutMissingAnchors,
} from '../planOps';
import type { DailyPlanItem } from '../../../utils/dailyPlanService';
import type { CalendarEvent } from '../../../utils/calendarFeedsService';
import type { DayLine } from '../../Today/dayModel';
import type { Task } from '../../../entities/Task';
import type { DayResponse, PlanOp } from '../../../utils/dayService';
import { openInboxItems } from '../InboxColumn';
import { InboxItem } from '../../../entities/InboxItem';

const TODAY = '2026-11-12';
const TOMORROW = '2026-11-13';

describe('column drop', () => {
    it('moves a planned card to the target day, leaving its due date', () => {
        expect(
            columnDropWrites({ uid: 'a', date: TODAY, planned: true }, TOMORROW)
        ).toEqual([
            {
                date: TODAY,
                ops: [{ op: 'move', task_uid: 'a', to_date: TOMORROW }],
            },
        ]);
    });

    it('plans a due-only card on the target day with an add', () => {
        expect(
            columnDropWrites(
                { uid: 'b', date: TODAY, planned: false },
                TOMORROW
            )
        ).toEqual([{ date: TOMORROW, ops: [{ op: 'add', task_uid: 'b' }] }]);
    });

    it('does nothing when dropped on its own day', () => {
        expect(
            columnDropWrites({ uid: 'a', date: TODAY, planned: true }, TODAY)
        ).toEqual([]);
    });
});

describe('calendar drop', () => {
    it('gives a slot on the same day without a move', () => {
        expect(
            calendarDropWrites(
                { uid: 'a', date: TODAY, planned: true, duration: 30 },
                { date: TODAY, start: 600 }
            )
        ).toEqual([
            {
                date: TODAY,
                ops: [
                    {
                        op: 'slot',
                        task_uid: 'a',
                        start_minute: 600,
                        duration_minutes: 30,
                    },
                ],
            },
        ]);
    });

    // Each write carries its own day's etag: a move would change the target
    // day too and make the slot that follows fail on a stale etag. The slot
    // comes first so a failed removal leaves the task planned twice, never lost.
    it('slots a planned card on another calendar day, then removes it from its old day', () => {
        const writes = calendarDropWrites(
            { uid: 'a', date: TODAY, planned: true, duration: 45 },
            { date: TOMORROW, start: 540 }
        );
        expect(writes).toEqual([
            {
                date: TOMORROW,
                ops: [
                    {
                        op: 'slot',
                        task_uid: 'a',
                        start_minute: 540,
                        duration_minutes: 45,
                    },
                ],
            },
            {
                date: TODAY,
                ops: [{ op: 'remove', task_uid: 'a' }],
            },
        ]);
        expect(writes.flatMap((w) => w.ops).map((op) => op.op)).not.toContain(
            'move'
        );
    });

    it('touches each day once, so no write reads a stale etag', () => {
        const writes = calendarDropWrites(
            { uid: 'a', date: TODAY, planned: true, duration: 30 },
            { date: '2026-11-15', start: 600 }
        );
        const dates = writes.map((write) => write.date);
        expect(new Set(dates).size).toBe(dates.length);
        expect(dates).toEqual(['2026-11-15', TODAY]);
    });

    it('slots a due-only card on the calendar day without moving it', () => {
        const writes = calendarDropWrites(
            { uid: 'b', date: TODAY, planned: false, duration: 30 },
            { date: TOMORROW, start: 900 }
        );
        expect(writes).toHaveLength(1);
        expect(writes[0].date).toBe(TOMORROW);
        expect(writes[0].ops[0]).toMatchObject({
            op: 'slot',
            start_minute: 900,
        });
    });
});

describe('reorder', () => {
    it('places a card right after the card it passed downward', () => {
        // Display order before the drop: a, b, c. Drag a onto c: a goes after c.
        expect(
            reorderWrites(
                { uid: 'a', date: TODAY, planned: true },
                'c',
                ['a', 'b', 'c'],
                ['a', 'b', 'c']
            )
        ).toEqual([
            {
                date: TODAY,
                ops: [{ op: 'reorder', task_uid: 'a', before_uid: null }],
            },
        ]);
    });

    it('places a card before the card it moved above', () => {
        expect(
            reorderWrites(
                { uid: 'c', date: TODAY, planned: true },
                'a',
                ['a', 'b', 'c'],
                ['a', 'b', 'c']
            )
        ).toEqual([
            {
                date: TODAY,
                ops: [{ op: 'reorder', task_uid: 'c', before_uid: 'a' }],
            },
        ]);
    });

    it('adds a due-only card at its new place', () => {
        expect(
            reorderWrites(
                { uid: 'x', date: TODAY, planned: false },
                'b',
                ['a', 'b', 'x'],
                ['a', 'b']
            )
        ).toEqual([
            {
                date: TODAY,
                ops: [{ op: 'add', task_uid: 'x', before_uid: 'b' }],
            },
        ]);
    });

    it('does nothing on itself', () => {
        expect(
            reorderWrites(
                { uid: 'a', date: TODAY, planned: true },
                'a',
                ['a'],
                ['a']
            )
        ).toEqual([]);
    });
});

describe('calendar range and helpers', () => {
    it('widens the day hours to whole hours around every span and the clock', () => {
        expect(
            calendarRange(
                { start: 480, end: 1080 },
                [{ start: 1200, end: 1290 }],
                500
            )
        ).toEqual({ start: 480, end: 1320 });
    });

    it('shifts a day by whole days', () => {
        expect(shiftDay(TODAY, 1)).toBe(TOMORROW);
        expect(shiftDay(TODAY, -1)).toBe('2026-11-11');
    });
});

describe('inbox items', () => {
    it('keeps only the items still waiting', () => {
        const items = [
            { uid: 'a', content: 'one', status: 'added' },
            { uid: 'b', content: 'two', status: 'processed' },
            { uid: 'c', content: 'three', status: 'trashed' },
            { uid: 'd', content: 'four' },
        ] as InboxItem[];
        expect(openInboxItems(items).map((item) => item.uid)).toEqual([
            'a',
            'd',
        ]);
    });
});

describe('date helpers', () => {
    it('formats a date as yyyy-MM-dd in the given timezone', () => {
        // 23:30 UTC on the 12th is already the 13th in Paris.
        const late = new Date('2026-11-12T23:30:00Z');
        expect(dayString(late, 'UTC')).toBe('2026-11-12');
        expect(dayString(late, 'Europe/Paris')).toBe('2026-11-13');
    });

    it('lists consecutive days starting at the anchor', () => {
        expect(columnDates(TODAY, 3)).toEqual([TODAY, TOMORROW, '2026-11-14']);
    });

    it('lists no days for a zero count', () => {
        expect(columnDates(TODAY, 0)).toEqual([]);
    });
});

describe('progressOf', () => {
    const line = (uid: string, done = false): DayLine => ({
        uid,
        task: { uid, name: uid, status: 0 } as Task,
        planned: true,
        start: null,
        dueMinute: null,
        duration: 30,
        durationKnown: true,
        done,
    });

    it('counts done lines against open and done ones', () => {
        expect(
            progressOf({
                timed: [line('a')],
                anytime: [line('b')],
                done: [line('c', true)],
            })
        ).toEqual({ done: 1, total: 3 });
    });

    it('is empty for an empty day', () => {
        expect(progressOf({ timed: [], anytime: [], done: [] })).toEqual({
            done: 0,
            total: 0,
        });
    });
});

describe('timed spans', () => {
    const event = (fields: Partial<CalendarEvent>): CalendarEvent =>
        ({
            uid: 'e',
            title: 'Event',
            all_day: false,
            busy: true,
            start: '',
            end: '',
            start_minute: 540,
            end_minute: 600,
            feed_uid: 'f',
            feed_name: 'Feed',
            color: null,
            ...fields,
        }) as CalendarEvent;

    it('keeps timed events and drops all-day or untimed ones', () => {
        expect(
            timedSpans([
                event({ uid: 'timed' }),
                event({ uid: 'allday', all_day: true }),
                event({ uid: 'no-start', start_minute: null }),
                event({ uid: 'no-end', end_minute: null }),
            ])
        ).toEqual([{ start: 540, end: 600 }]);
    });
});

describe('plan item uids', () => {
    it('returns task uids in plan position order without mutating the input', () => {
        const items = [
            { task_uid: 'b', position: 2 },
            { task_uid: 'a', position: 1 },
        ] as DailyPlanItem[];
        expect(planItemUids(items)).toEqual(['a', 'b']);
        expect(items[0].task_uid).toBe('b');
    });

    it('is empty for an empty plan', () => {
        expect(planItemUids([])).toEqual([]);
    });
});

const t = (uid: string, fields: Partial<Task> = {}): Task =>
    ({ uid, name: uid, status: 0, estimated_minutes: 20, ...fields }) as Task;

const day = (
    date: string,
    planned: Task[],
    due: Task[] = [],
    overdue: Task[] = []
): DayResponse =>
    ({
        date,
        plan: {
            uid: `p-${date}`,
            date,
            started_at: null,
            items: planned.map((task, position) => ({
                task_uid: task.uid,
                task,
                position,
                start_minute: position === 0 ? 600 : null,
                duration_minutes: 45,
            })),
        },
        etag: 'e',
        due,
        overdue,
        suggestions: null,
        completed: [],
    }) as unknown as DayResponse;

const uidsOf = (d: DayResponse) => ({
    plan: (d.plan?.items ?? []).map((item) => item.task_uid),
    due: d.due.map((task) => task.uid),
    overdue: d.overdue.map((task) => task.uid),
});

describe('touched dates', () => {
    // The review saw a moved card vanish from both columns: only the source
    // day was refreshed after a move.
    it('includes the day a move sends its task to', () => {
        expect(
            touchedDates([
                {
                    date: TODAY,
                    ops: [{ op: 'move', task_uid: 'a', to_date: TOMORROW }],
                },
                { date: TODAY, ops: [{ op: 'remove', task_uid: 'b' }] },
            ])
        ).toEqual([TODAY, TOMORROW]);
    });
});

describe('applyWritesLocally', () => {
    it('shows a moved card on its new day at once, without its slot', () => {
        const a = t('a');
        const days = {
            [TODAY]: day(TODAY, [a]),
            [TOMORROW]: day(TOMORROW, []),
        };
        const next = applyWritesLocally(
            days,
            columnDropWrites(
                { uid: 'a', date: TODAY, planned: true },
                TOMORROW
            ),
            TODAY
        );
        expect(uidsOf(next[TODAY]).plan).toEqual([]);
        expect(next[TOMORROW].plan?.items).toEqual([
            expect.objectContaining({
                task_uid: 'a',
                start_minute: null,
                duration_minutes: 45,
            }),
        ]);
        // The input is not changed.
        expect(uidsOf(days[TODAY]).plan).toEqual(['a']);
    });

    it('takes a due-only card off its due day once planned elsewhere', () => {
        const b = t('b');
        const days = {
            [TODAY]: day(TODAY, [], [b]),
            [TOMORROW]: day(TOMORROW, []),
        };
        const next = applyWritesLocally(
            days,
            columnDropWrites(
                { uid: 'b', date: TODAY, planned: false },
                TOMORROW
            ),
            TODAY
        );
        expect(uidsOf(next[TODAY]).due).toEqual([]);
        expect(uidsOf(next[TOMORROW]).plan).toEqual(['b']);
    });

    it('takes overdue tasks out of the overdue list when planned today', () => {
        const late = t('late');
        const days = { [TODAY]: day(TODAY, [], [], [late]) };
        const next = applyWritesLocally(
            days,
            [{ date: TODAY, ops: [{ op: 'add', task_uid: 'late' }] }],
            TODAY
        );
        expect(uidsOf(next[TODAY])).toEqual({
            plan: ['late'],
            due: [],
            overdue: [],
        });
    });

    it('leaves days that are not loaded alone', () => {
        const days = { [TODAY]: day(TODAY, [t('a')]) };
        const next = applyWritesLocally(
            days,
            columnDropWrites(
                { uid: 'a', date: TODAY, planned: true },
                TOMORROW
            ),
            TODAY
        );
        expect(next[TOMORROW]).toBeUndefined();
        expect(uidsOf(next[TODAY]).plan).toEqual([]);
    });
});

describe('datesHolding', () => {
    it('finds the days that show a task or one of its subtasks', () => {
        const parent = t('p', { subtasks: [t('sub')] } as Partial<Task>);
        const days = {
            [TODAY]: day(TODAY, [parent]),
            [TOMORROW]: day(TOMORROW, [], [t('x')]),
        };
        expect(datesHolding(days, 'p')).toEqual([TODAY]);
        expect(datesHolding(days, 'sub')).toEqual([TODAY]);
        expect(datesHolding(days, 'x')).toEqual([TOMORROW]);
        expect(datesHolding(days, 'none')).toEqual([]);
    });
});

describe('a slotted card dropped on another day', () => {
    // Seen in the browser: a card slotted 12:40 on Friday lost its time when
    // dragged to Saturday (a move drops the slot). It is slotted on the new
    // day, then removed from the old one.
    it('keeps its time and length on the new day', () => {
        expect(
            columnDropWrites(
                {
                    uid: 'a',
                    date: TODAY,
                    planned: true,
                    slot: { start: 760, duration: 50 },
                },
                TOMORROW
            )
        ).toEqual([
            {
                date: TOMORROW,
                ops: [
                    {
                        op: 'slot',
                        task_uid: 'a',
                        start_minute: 760,
                        duration_minutes: 50,
                    },
                ],
            },
            { date: TODAY, ops: [{ op: 'remove', task_uid: 'a' }] },
        ]);
    });
});

describe('plannedLine', () => {
    it('finds the first day of the order that plans the task, with its slot', () => {
        const days = {
            [TODAY]: day(TODAY, [t('x'), t('a')]),
            [TOMORROW]: day(TOMORROW, [t('a')]),
        };
        expect(plannedLine(days, 'a', [TODAY, TOMORROW])).toEqual({
            date: TODAY,
            start: null,
            duration: 45,
        });
        expect(plannedLine(days, 'a', [TOMORROW, TODAY])).toEqual({
            date: TOMORROW,
            start: 600,
            duration: 45,
        });
        expect(plannedLine(days, 'none', [TODAY, TOMORROW])).toBeNull();
        expect(plannedLine(days, 'a', ['2026-11-20'])).toBeNull();
    });
});

describe('inverseWrites', () => {
    const NEXT = '2026-11-14';

    it('undoes a move with an add back on the old day, then a removal', () => {
        const days = {
            [TODAY]: day(TODAY, [t('x'), t('a'), t('y')]),
            [TOMORROW]: day(TOMORROW, []),
        };
        expect(
            inverseWrites(
                days,
                [
                    {
                        date: TODAY,
                        ops: [{ op: 'move', task_uid: 'a', to_date: TOMORROW }],
                    },
                ],
                TODAY
            )
        ).toEqual([
            {
                date: TODAY,
                ops: [
                    {
                        op: 'add',
                        task_uid: 'a',
                        start_minute: null,
                        duration_minutes: 45,
                        before_uid: 'y',
                    },
                ],
            },
            { date: TOMORROW, ops: [{ op: 'remove', task_uid: 'a' }] },
        ]);
    });

    it('undoes a slotted move with the slot back on the old day', () => {
        const days = {
            [TODAY]: day(TODAY, [t('a')]),
            [TOMORROW]: day(TOMORROW, []),
        };
        const writes = columnDropWrites(
            {
                uid: 'a',
                date: TODAY,
                planned: true,
                slot: { start: 600, duration: 45 },
            },
            TOMORROW
        );
        expect(inverseWrites(days, writes, TODAY)).toEqual([
            {
                date: TODAY,
                ops: [
                    {
                        op: 'add',
                        task_uid: 'a',
                        start_minute: 600,
                        duration_minutes: 45,
                        before_uid: null,
                    },
                ],
            },
            { date: TOMORROW, ops: [{ op: 'remove', task_uid: 'a' }] },
        ]);
    });

    it('undoes an add with a removal, also on a day that is not loaded', () => {
        const days = { [TODAY]: day(TODAY, []) };
        expect(
            inverseWrites(
                days,
                [
                    { date: TODAY, ops: [{ op: 'add', task_uid: 'a' }] },
                    { date: NEXT, ops: [{ op: 'add', task_uid: 'b' }] },
                ],
                TODAY
            )
        ).toEqual([
            { date: TODAY, ops: [{ op: 'remove', task_uid: 'a' }] },
            { date: NEXT, ops: [{ op: 'remove', task_uid: 'b' }] },
        ]);
    });

    it('puts back the earlier slot, length and order', () => {
        const days = { [TODAY]: day(TODAY, [t('a'), t('b'), t('c')]) };
        const undo = (ops: PlanOp[]) =>
            inverseWrites(days, [{ date: TODAY, ops }], TODAY);
        expect(
            undo([{ op: 'slot', task_uid: 'a', start_minute: 720 }])
        ).toEqual([
            {
                date: TODAY,
                ops: [
                    {
                        op: 'slot',
                        task_uid: 'a',
                        start_minute: 600,
                        duration_minutes: 45,
                    },
                ],
            },
        ]);
        expect(
            undo([{ op: 'slot', task_uid: 'b', start_minute: 720 }])
        ).toEqual([{ date: TODAY, ops: [{ op: 'unslot', task_uid: 'b' }] }]);
        expect(undo([{ op: 'unslot', task_uid: 'a' }])).toEqual([
            {
                date: TODAY,
                ops: [
                    {
                        op: 'slot',
                        task_uid: 'a',
                        start_minute: 600,
                        duration_minutes: 45,
                    },
                ],
            },
        ]);
        expect(
            undo([{ op: 'resize', task_uid: 'b', duration_minutes: 90 }])
        ).toEqual([
            {
                date: TODAY,
                ops: [{ op: 'resize', task_uid: 'b', duration_minutes: 45 }],
            },
        ]);
        expect(
            undo([{ op: 'reorder', task_uid: 'a', before_uid: null }])
        ).toEqual([
            {
                date: TODAY,
                ops: [{ op: 'reorder', task_uid: 'a', before_uid: 'b' }],
            },
        ]);
        expect(undo([{ op: 'remove', task_uid: 'b' }])).toEqual([
            {
                date: TODAY,
                ops: [
                    {
                        op: 'add',
                        task_uid: 'b',
                        start_minute: null,
                        duration_minutes: 45,
                        before_uid: 'c',
                    },
                ],
            },
        ]);
    });

    it('gives nothing to send for a write that changed nothing', () => {
        const days = { [TODAY]: day(TODAY, [t('a')]) };
        expect(
            inverseWrites(
                days,
                [{ date: TODAY, ops: [{ op: 'add', task_uid: 'a' }] }],
                TODAY
            )
        ).toEqual([]);
    });

    it('cannot undo a change to a day it never saw', () => {
        expect(
            inverseWrites(
                {},
                [{ date: NEXT, ops: [{ op: 'unslot', task_uid: 'a' }] }],
                TODAY
            )
        ).toBeNull();
    });
});

describe('withoutMissingAnchors', () => {
    it('drops a before_uid no longer on a loaded day', () => {
        const days = { [TODAY]: day(TODAY, [t('x')]) };
        expect(
            withoutMissingAnchors(days, [
                {
                    date: TODAY,
                    ops: [
                        { op: 'add', task_uid: 'a', before_uid: 'gone' },
                        { op: 'reorder', task_uid: 'x', before_uid: 'x' },
                    ],
                },
            ])
        ).toEqual([
            {
                date: TODAY,
                ops: [
                    { op: 'add', task_uid: 'a', before_uid: null },
                    { op: 'reorder', task_uid: 'x', before_uid: 'x' },
                ],
            },
        ]);
    });
});
