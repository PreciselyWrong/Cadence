import {
    Decision,
    daysLate,
    dayLoad,
    decisionsToApply,
    notesToSend,
    plannableDays,
    restingCount,
    rowsOf,
    weekSections,
} from '../weekDecisions';
import type {
    WeekChange,
    WeekDay,
    WeekTaskFact,
} from '../../../utils/proposalsService';

const task = (
    uid: string,
    extra: Partial<WeekTaskFact> = {}
): WeekTaskFact => ({
    uid,
    name: uid,
    ...extra,
});

const day = (extra: Partial<WeekDay> = {}): WeekDay => ({
    date: '2026-11-17',
    load_minutes: 0,
    capacity_minutes: 480,
    items: [],
    events: [],
    work: null,
    ...extra,
});

describe('week decisions', () => {
    const changes: WeekChange[] = [
        { task_uid: 'a', op: 'drop', reason: '' },
        { task_uid: 'b', op: 'plan_day', date: '2026-11-18', reason: '' },
        { task_uid: 'c', op: 'due', date: '2026-11-17', reason: '' },
        { task_uid: 'd', op: 'this_week', reason: '' },
        { task_uid: 'e', op: 'later', reason: '' },
        { task_uid: 'f', op: 'plan_day', date: '2026-11-18', reason: '' },
    ];
    const uids = (rows: WeekChange[]) => rows.map((row) => row.task_uid);

    it('applies every decision but the kept ones, dates only when dated', () => {
        const changed = new Map<string, Decision>([
            ['a', { op: 'keep' }],
            ['d', { op: 'due', date: '2026-11-30' }],
        ]);
        expect(decisionsToApply(changes, changed)).toEqual([
            { task_uid: 'b', op: 'plan_day', date: '2026-11-18' },
            { task_uid: 'c', op: 'due', date: '2026-11-17' },
            { task_uid: 'd', op: 'due', date: '2026-11-30' },
            { task_uid: 'e', op: 'later' },
            { task_uid: 'f', op: 'plan_day', date: '2026-11-18' },
        ]);
    });

    it('sends a week, month or next-week choice without a date', () => {
        const committed = new Map<string, Decision>([
            ['a', { op: 'next_week' }],
            ['d', { op: 'this_month' }],
            ['e', { op: 'next_month' }],
        ]);
        expect(decisionsToApply([changes[0]], committed)).toStrictEqual([
            { task_uid: 'a', op: 'next_week' },
        ]);
        expect(
            decisionsToApply([changes[3], changes[4]], committed)
        ).toStrictEqual([
            { task_uid: 'd', op: 'this_month' },
            { task_uid: 'e', op: 'next_month' },
        ]);
    });

    it('takes the remarks that are not blank, in the agent order', () => {
        const notes = new Map([
            ['f', '  Pas ce jour  '],
            ['a', '   '],
            ['b', 'Plutôt le lundi'],
        ]);
        expect(notesToSend(changes, notes)).toEqual([
            { task_uid: 'b', text: 'Plutôt le lundi' },
            { task_uid: 'f', text: 'Pas ce jour' },
        ]);
    });

    it('offers the days of the period from today on', () => {
        expect(
            plannableDays(
                { start: '2026-11-14', end: '2026-11-18' },
                '2026-11-16'
            )
        ).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
    });

    it('gives a task without a change the keep decision, and keeps stray changes', () => {
        const rows = rowsOf(
            [task('x'), task('y')],
            [
                { task_uid: 'y', op: 'drop', reason: 'Plus utile' },
                { task_uid: 'z', op: 'later', reason: '' },
            ]
        );
        expect(rows).toEqual([
            { task_uid: 'x', op: 'keep', reason: '' },
            { task_uid: 'y', op: 'drop', reason: 'Plus utile' },
            { task_uid: 'z', op: 'later', reason: '' },
        ]);
    });

    it('shows the overdue tasks first, then the dated rows by day, then the rest', () => {
        const tasks = new Map([
            ['a', task('a', { overdue: true })],
            ['b', task('b')],
            ['c', task('c')],
            ['d', task('d')],
            ['e', task('e', { overdue: true })],
        ]);
        const rows: WeekChange[] = [
            { task_uid: 'a', op: 'plan_day', date: '2026-11-19', reason: '' },
            { task_uid: 'b', op: 'this_week', reason: '' },
            { task_uid: 'c', op: 'plan_day', date: '2026-11-18', reason: '' },
            { task_uid: 'd', op: 'plan_day', date: '2026-11-17', reason: '' },
            { task_uid: 'e', op: 'keep', reason: '' },
        ];
        const sections = weekSections(rows, tasks, new Map());
        expect(
            sections.map((section) => [section.id, uids(section.rows)])
        ).toEqual([
            ['overdue', ['a', 'e']],
            ['days', ['d', 'c']],
            ['later', ['b']],
        ]);
    });

    it('moves a row to the section of its decision, and leaves empty sections out', () => {
        const rows: WeekChange[] = [
            { task_uid: 'b', op: 'plan_day', date: '2026-11-18', reason: '' },
            { task_uid: 'd', op: 'this_week', reason: '' },
        ];
        const tasks = new Map([['b', task('b')]]);
        const sections = weekSections(
            rows,
            tasks,
            new Map([['b', { op: 'later' }]])
        );
        expect(sections.map((section) => section.id)).toEqual(['later']);
        expect(uids(sections[0].rows)).toEqual(['b', 'd']);
    });

    it('counts the days late of an overdue task, and nothing else', () => {
        const today = '2026-11-16';
        expect(
            daysLate(task('a', { overdue: true, due: '2026-11-15' }), today)
        ).toBe(1);
        expect(
            daysLate(task('a', { overdue: true, due: '2026-11-11' }), today)
        ).toBe(5);
        expect(daysLate(task('a', { due: '2026-11-11' }), today)).toBeNull();
        expect(daysLate(task('a', { overdue: true }), today)).toBeNull();
        expect(daysLate(undefined, today)).toBeNull();
    });

    it('reads a day load from its detail: share, full and busy', () => {
        expect(dayLoad(30)).toEqual({
            minutes: 30,
            share: null,
            full: false,
            busy: false,
        });
        const light = dayLoad(30, day({ load_minutes: 30 }));
        expect(light.share).toBeCloseTo(30 / 480);
        expect(light.full).toBe(false);
        expect(dayLoad(480, day({ load_minutes: 480 })).full).toBe(true);
        const allDay = dayLoad(
            0,
            day({ events: [{ title: 'Congé', all_day: true }] })
        );
        expect(allDay).toMatchObject({ busy: true, full: true, share: 1 });
        // No work time at all is not a full day.
        expect(dayLoad(0, day({ capacity_minutes: 0 })).full).toBe(false);
    });

    it('counts the rows left as they are, not the noted ones', () => {
        const rows: WeekChange[] = [
            { task_uid: 'a', op: 'keep', reason: '' },
            { task_uid: 'b', op: 'keep', reason: '' },
            { task_uid: 'c', op: 'drop', reason: '' },
            { task_uid: 'd', op: 'plan_day', date: '2026-11-17', reason: '' },
        ];
        expect(restingCount(rows, new Map(), new Set(['b']))).toBe(1);
        expect(
            restingCount(rows, new Map([['c', { op: 'keep' }]]), new Set())
        ).toBe(3);
    });
});
