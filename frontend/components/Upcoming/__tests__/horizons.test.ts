import {
    bucketHorizons,
    horizonOf,
    horizonPatch,
    monthStartOf,
    plannedThisWeek,
    weekDates,
    weekStartOf,
} from '../horizons';
import type { Task } from '../../../entities/Task';

const task = (uid: string, fields: Record<string, unknown> = {}): Task =>
    ({ uid, name: uid, status: 0, tags: [], ...fields }) as unknown as Task;

// Thursday 12 November 2026.
const TODAY = '2026-11-12';

describe('weekStartOf / monthStartOf', () => {
    it('finds the first day of the week for the user week start', () => {
        expect(weekStartOf(TODAY, 1)).toBe('2026-11-09');
        expect(weekStartOf(TODAY, 0)).toBe('2026-11-08');
        expect(weekStartOf('2026-11-09', 1)).toBe('2026-11-09');
        expect(weekStartOf('2026-11-08', 1)).toBe('2026-11-02');
    });

    it('finds the first day of this and next month, across a year', () => {
        expect(monthStartOf(TODAY)).toBe('2026-11-01');
        expect(monthStartOf(TODAY, 1)).toBe('2026-12-01');
        expect(monthStartOf('2026-12-31', 1)).toBe('2027-01-01');
    });
});

describe('bucketHorizons', () => {
    it('sorts open tasks by week, month and #someday', () => {
        const buckets = bucketHorizons(
            [
                task('w', { week_of: '2026-11-09' }),
                task('m', { month_of: '2026-11-01' }),
                task('n', { month_of: '2026-12-01' }),
                task('s', { tags: [{ name: 'someday' }] }),
                task('none'),
            ],
            TODAY,
            1
        );
        expect(buckets.week.map((t) => t.uid)).toEqual(['w']);
        expect(buckets.this_month.map((t) => t.uid)).toEqual(['m']);
        expect(buckets.next_month.map((t) => t.uid)).toEqual(['n']);
        expect(buckets.someday.map((t) => t.uid)).toEqual(['s']);
    });

    it('lets #someday win, then the week over the month', () => {
        const buckets = bucketHorizons(
            [
                task('both', {
                    week_of: '2026-11-09',
                    month_of: '2026-11-01',
                }),
                task('parked', {
                    week_of: '2026-11-09',
                    tags: [{ name: 'Someday' }],
                }),
            ],
            TODAY,
            1
        );
        expect(buckets.week.map((t) => t.uid)).toEqual(['both']);
        expect(buckets.this_month).toEqual([]);
        expect(buckets.someday.map((t) => t.uid)).toEqual(['parked']);
    });

    it('leaves out done tasks, subtasks and past weeks or months', () => {
        const buckets = bucketHorizons(
            [
                task('done', { week_of: '2026-11-09', status: 2 }),
                task('sub', { week_of: '2026-11-09', parent_task_id: 3 }),
                task('oldWeek', { week_of: '2026-11-02' }),
                task('oldMonth', { month_of: '2026-10-01' }),
            ],
            TODAY,
            1
        );
        expect(Object.values(buckets).flat()).toEqual([]);
    });

    it('reads a week stored with a time part', () => {
        const buckets = bucketHorizons(
            [task('w', { week_of: '2026-11-09T00:00:00.000Z' })],
            TODAY,
            1
        );
        expect(buckets.week).toHaveLength(1);
        expect(horizonOf(buckets, 'w')).toBe('week');
        expect(horizonOf(buckets, 'x')).toBeNull();
    });
});

describe('bucketHorizons: horizon derived from the date', () => {
    const planDays = (entries: Record<string, Task[]>) =>
        Object.fromEntries(
            Object.entries(entries).map(([date, tasks]) => [
                date,
                {
                    plan: {
                        items: tasks.map((t, position) => ({
                            task: t,
                            position,
                        })),
                    },
                },
            ])
        );

    it('places a task due from today on in the week or month of its due day', () => {
        const buckets = bucketHorizons(
            [
                task('dueToday', { due_date: '2026-11-12' }),
                task('dueSunday', { due_date: '2026-11-15T18:00:00' }),
                task('dueLater', { due_date: '2026-11-25' }),
                task('dueDecember', { due_date: '2026-12-03' }),
                task('dueJanuary', { due_date: '2027-01-04' }),
            ],
            TODAY,
            1
        );
        expect(buckets.week.map((t) => t.uid)).toEqual([
            'dueToday',
            'dueSunday',
        ]);
        expect(buckets.this_month.map((t) => t.uid)).toEqual(['dueLater']);
        expect(buckets.next_month.map((t) => t.uid)).toEqual(['dueDecember']);
    });

    it('takes the week first, across a month end', () => {
        // Friday 27 November 2026: the week runs to Sunday 29.
        const buckets = bucketHorizons(
            [
                task('mon', { due_date: '2026-11-30' }),
                task('tue', { due_date: '2026-12-01' }),
            ],
            '2026-11-27',
            1
        );
        expect(buckets.this_month.map((t) => t.uid)).toEqual(['mon']);
        expect(buckets.next_month.map((t) => t.uid)).toEqual(['tue']);
        // Thursday 29 October: Sunday 1 November is still this week.
        const sameWeek = bucketHorizons(
            [task('sun', { due_date: '2026-11-01' })],
            '2026-10-29',
            1
        );
        expect(sameWeek.week.map((t) => t.uid)).toEqual(['sun']);
    });

    it('derives nothing from a past due date or a recurring due date', () => {
        const buckets = bucketHorizons(
            [
                task('late', { due_date: '2026-11-10' }),
                task('routine', {
                    due_date: '2026-11-13',
                    recurrence_type: 'daily',
                }),
            ],
            TODAY,
            1
        );
        expect(Object.values(buckets).flat()).toEqual([]);
    });

    it('places a task planned after this week by its planned day, before its due day', () => {
        const planned = task('planned', { due_date: '2026-12-10' });
        const buckets = bucketHorizons(
            [planned, task('decPlan')],
            TODAY,
            1,
            planDays({
                '2026-11-20': [planned],
                '2026-12-02': [task('decPlan')],
            })
        );
        expect(buckets.this_month.map((t) => t.uid)).toEqual(['planned']);
        expect(buckets.next_month.map((t) => t.uid)).toEqual(['decPlan']);
    });

    it('leaves a task planned on a day of this week to « Planned on a day »', () => {
        const planned = task('planned', { due_date: '2026-11-25' });
        const days = planDays({ '2026-11-10': [planned] });
        const buckets = bucketHorizons([planned], TODAY, 1, days);
        expect(Object.values(buckets).flat()).toEqual([]);
        expect(
            plannedThisWeek(days, TODAY, 1, buckets.week).map(
                ({ task: t }) => t.uid
            )
        ).toEqual(['planned']);
    });

    it('ignores plans on past weeks and done plan lines', () => {
        const old = task('old', { due_date: '2026-11-25' });
        const done = task('doneLine');
        const buckets = bucketHorizons([old, done], TODAY, 1, {
            '2026-11-02': { plan: { items: [{ task: old, position: 0 }] } },
            '2026-11-20': {
                plan: {
                    items: [{ task: done, position: 0, occurrence_done: true }],
                },
            },
        });
        expect(buckets.this_month.map((t) => t.uid)).toEqual(['old']);
        expect(buckets.week).toEqual([]);
    });

    it('lets an explicit week or month that still holds win over the date', () => {
        const buckets = bucketHorizons(
            [
                task('weekDueDec', {
                    week_of: '2026-11-09',
                    due_date: '2026-12-03',
                }),
                task('nextMonthDueToday', {
                    month_of: '2026-12-01',
                    due_date: '2026-11-12',
                }),
                task('staleWeekDueLater', {
                    week_of: '2026-11-02',
                    due_date: '2026-11-25',
                }),
                task('parkedDue', {
                    due_date: '2026-11-13',
                    tags: [{ name: 'someday' }],
                }),
            ],
            TODAY,
            1
        );
        expect(buckets.week.map((t) => t.uid)).toEqual(['weekDueDec']);
        expect(buckets.next_month.map((t) => t.uid)).toEqual([
            'nextMonthDueToday',
        ]);
        expect(buckets.this_month.map((t) => t.uid)).toEqual([
            'staleWeekDueLater',
        ]);
        expect(buckets.someday.map((t) => t.uid)).toEqual(['parkedDue']);
    });
});

describe('horizonPatch', () => {
    it('commits to the week and clears the month', () => {
        expect(horizonPatch('this_month', 'week')).toEqual({
            week_of: 'this_week',
            month_of: null,
        });
    });

    it('commits to a month and clears the week', () => {
        expect(horizonPatch('week', 'next_month')).toEqual({
            month_of: 'next_month',
            week_of: null,
        });
        expect(horizonPatch(null, 'this_month')).toEqual({
            month_of: 'this_month',
            week_of: null,
        });
    });

    it('parks for later, and removes the tag when leaving Someday', () => {
        expect(horizonPatch('week', 'someday')).toEqual({ later: true });
        expect(horizonPatch('someday', 'week')).toEqual({
            week_of: 'this_week',
            month_of: null,
            later: false,
        });
    });

    it('writes nothing for a drop on its own horizon', () => {
        expect(horizonPatch('week', 'week')).toBeNull();
    });
});

describe('plannedThisWeek', () => {
    const item = (t: Task, position: number, done = false) => ({
        task_uid: t.uid,
        task: t,
        position,
        occurrence_done: done,
    });
    const plan = (...items: ReturnType<typeof item>[]) => ({
        plan: { items },
    });

    it('lists open tasks planned on the days of this week, once each', () => {
        const a = task('a');
        const b = task('b');
        const days = {
            '2026-11-09': plan(item(b, 1), item(a, 0)),
            '2026-11-13': plan(item(a, 0)),
            // Next week: not this week.
            '2026-11-16': plan(item(task('c'), 0)),
        };
        expect(
            plannedThisWeek(days, TODAY, 1).map(({ task: t, date }) => [
                t.uid,
                date,
            ])
        ).toEqual([
            ['a', '2026-11-09'],
            ['b', '2026-11-09'],
        ]);
    });

    it('skips done tasks and those already committed to the week', () => {
        const days = {
            '2026-11-12': plan(
                item(task('done', { status: 2 }), 0),
                item(task('occ'), 1, true),
                item(task('week'), 2),
                item(task('open'), 3)
            ),
        };
        expect(
            plannedThisWeek(days, TODAY, 1, [task('week')]).map(
                ({ task: t }) => t.uid
            )
        ).toEqual(['open']);
    });

    it('lists the seven days of the week from the first day', () => {
        expect(weekDates(TODAY, 1)[0]).toBe('2026-11-09');
        expect(weekDates(TODAY, 0)[6]).toBe('2026-11-14');
    });
});
