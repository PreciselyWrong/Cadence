import {
    bucketHorizons,
    horizonOf,
    horizonPatch,
    monthStartOf,
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
