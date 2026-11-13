import {
    commitmentClearPatch,
    commitmentOf,
    horizonDuePatch,
    toPlan,
} from '../horizons';
import type { PlanDays } from '../horizons';
import type { Task } from '../../../entities/Task';

const task = (uid: string, fields: Record<string, unknown> = {}): Task =>
    ({ uid, name: uid, status: 0, tags: [], ...fields }) as unknown as Task;

// Thursday 12 November 2026; weeks start on Monday 9 November.
const TODAY = '2026-11-12';

const planned = (entries: Record<string, string[]>): PlanDays =>
    Object.fromEntries(
        Object.entries(entries).map(([date, uids]) => [
            date,
            {
                plan: {
                    items: uids.map((uid, position) => ({
                        task: task(uid),
                        position,
                    })),
                },
            },
        ])
    );

const uids = (tasks: Task[]) => tasks.map((t) => t.uid);

describe('toPlan', () => {
    it('lists past commitments to replan, this week and this month', () => {
        const box = toPlan(
            [
                task('old-week', { week_of: '2026-11-02', project_id: 1 }),
                task('old-month', { month_of: '2026-10-01', project_id: 1 }),
                task('week', { week_of: '2026-11-09' }),
                task('month', { month_of: '2026-11-01' }),
                task('next', { week_of: '2026-11-16' }),
                task('plain'),
            ],
            TODAY,
            1
        );
        expect(uids(box.replan)).toEqual(['old-week', 'old-month']);
        expect(uids(box.week)).toEqual(['week']);
        expect(uids(box.month)).toEqual(['month']);
    });

    it('keeps out of replan what a horizon still holds', () => {
        const box = toPlan(
            [
                // The month still holds after the week passed.
                task('month-holds', {
                    week_of: '2026-11-02',
                    month_of: '2026-11-01',
                }),
                // A due day ahead derives a horizon.
                task('due-ahead', {
                    week_of: '2026-11-02',
                    due_date: '2026-11-20',
                }),
                task('someday', {
                    week_of: '2026-11-02',
                    tags: [{ name: 'someday' }],
                }),
                task('recurring', {
                    week_of: '2026-11-02',
                    recurrence_type: 'weekly',
                }),
                task('done', { week_of: '2026-11-02', status: 2 }),
                task('child', { week_of: '2026-11-02', parent_task_id: 4 }),
            ],
            TODAY,
            1
        );
        expect(uids(box.replan)).toEqual([]);
        expect(uids(box.month)).toEqual(['month-holds']);
    });

    it('drops a stale task planned today or later, not one planned before', () => {
        const box = toPlan(
            [
                task('later', { week_of: '2026-11-02', project_id: 1 }),
                task('before', { week_of: '2026-11-02', project_id: 1 }),
            ],
            TODAY,
            1,
            planned({ '2026-11-16': ['later'], '2026-11-10': ['before'] })
        );
        expect(uids(box.replan)).toEqual(['before']);
    });

    it('leaves out week and month tasks planned on a day of this week', () => {
        const box = toPlan(
            [
                task('week-planned', { week_of: '2026-11-09' }),
                task('week-free', { week_of: '2026-11-09' }),
                task('month-planned', { month_of: '2026-11-01' }),
                task('month-later', { month_of: '2026-11-01' }),
            ],
            TODAY,
            1,
            planned({
                '2026-11-09': ['week-planned'],
                '2026-11-15': ['month-planned'],
                '2026-11-17': ['month-later'],
            })
        );
        expect(uids(box.week)).toEqual(['week-free']);
        expect(uids(box.month)).toEqual(['month-later']);
    });

    it('puts a task of this week and this month in the week only', () => {
        const box = toPlan(
            [
                task('both', { week_of: '2026-11-09', month_of: '2026-11-01' }),
                task('next', { week_of: '2026-11-16', month_of: '2026-11-01' }),
            ],
            TODAY,
            1
        );
        expect(uids(box.week)).toEqual(['both']);
        expect(box.month).toEqual([]);
    });
});

describe('toPlan replan leaves out Overdue and « Tâches à classer »', () => {
    const stale = { week_of: '2026-11-02', project_id: 1 };
    const replan = (fields: Record<string, unknown>) =>
        uids(toPlan([task('t', { ...stale, ...fields })], TODAY, 1).replan);

    it('keeps a filed task whose week has passed', () => {
        expect(replan({})).toEqual(['t']);
        expect(replan({ project_id: null, area_id: 3 })).toEqual(['t']);
    });

    it('leaves out an overdue task: it is in « En retard »', () => {
        expect(replan({ due_date: '2026-11-11' })).toEqual([]);
    });

    it('leaves out a task with no project nor area', () => {
        expect(replan({ project_id: null })).toEqual([]);
    });

    it('leaves out a task still waiting for « Quand ? »', () => {
        expect(replan({ needs_when: true })).toEqual([]);
    });

    it('keeps an unfiled task the unsorted list skips (in view, deferred)', () => {
        expect(
            replan({ project_id: null, in_view_at: '2026-11-10T08:00:00Z' })
        ).toEqual(['t']);
        expect(
            replan({ project_id: null, defer_until: '2999-01-01T08:00:00Z' })
        ).toEqual(['t']);
    });
});

describe('commitmentOf', () => {
    it('reads the commitment a task holds, never its date', () => {
        expect(commitmentOf(task('a'), TODAY, 1)).toBeNull();
        expect(
            commitmentOf(task('a', { week_of: '2026-11-09' }), TODAY, 1)
        ).toBe('week');
        expect(
            commitmentOf(task('a', { week_of: '2026-11-16' }), TODAY, 1)
        ).toBe('next_week');
        expect(
            commitmentOf(task('a', { month_of: '2026-11-01' }), TODAY, 1)
        ).toBe('this_month');
        expect(
            commitmentOf(task('a', { month_of: '2026-12-01' }), TODAY, 1)
        ).toBe('next_month');
        expect(
            commitmentOf(task('a', { tags: [{ name: 'Someday' }] }), TODAY, 1)
        ).toBe('someday');
    });

    it('says replan once the only commitment has passed', () => {
        expect(
            commitmentOf(task('a', { week_of: '2026-11-02' }), TODAY, 1)
        ).toBe('replan');
        expect(
            commitmentOf(task('a', { month_of: '2026-10-01' }), TODAY, 1)
        ).toBe('replan');
        expect(
            commitmentOf(
                task('a', { week_of: '2026-11-02', month_of: '2026-11-01' }),
                TODAY,
                1
            )
        ).toBe('this_month');
    });
});

describe('horizonDuePatch', () => {
    it('commits the task, clears its date and takes it off its plans', () => {
        expect(horizonDuePatch(null, 'next_month')).toEqual({
            month_of: 'next_month',
            week_of: null,
            due_date: null,
            due_time: null,
            due_has_time: false,
            unplan: true,
        });
        expect(horizonDuePatch('someday', 'week')).toEqual({
            week_of: 'this_week',
            month_of: null,
            later: false,
            due_date: null,
            due_time: null,
            due_has_time: false,
            unplan: true,
        });
        expect(horizonDuePatch(null, 'someday')).toMatchObject({
            later: true,
            due_date: null,
            unplan: true,
        });
    });

    it('still clears the date when the horizon is the current one', () => {
        expect(horizonDuePatch('week', 'week')).toEqual({
            due_date: null,
            due_time: null,
            due_has_time: false,
            unplan: true,
        });
    });
});

describe('commitmentClearPatch', () => {
    it('clears week, month and #someday when a day is picked', () => {
        expect(commitmentClearPatch(task('a'))).toBeNull();
        expect(
            commitmentClearPatch(task('a', { week_of: '2026-11-02' }))
        ).toEqual({ week_of: null, month_of: null });
        expect(
            commitmentClearPatch(task('a', { tags: [{ name: 'someday' }] }))
        ).toEqual({ week_of: null, month_of: null, later: false });
    });
});
