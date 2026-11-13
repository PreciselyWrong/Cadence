import {
    buildItems,
    buildRange,
    findPath,
    fromDay,
    linkTarget,
    monthLabelFits,
    shiftDates,
    spareDays,
    summarizeItems,
    toDay,
    weekdayOf,
} from '../timelineLayout';
import { Task } from '../../../../entities/Task';

const task = (uid: string, extra: Partial<Task> = {}): Task =>
    ({ uid, name: uid, status: 0, ...extra }) as Task;

describe('timelineLayout', () => {
    it('round-trips calendar days', () => {
        expect(fromDay(toDay('2026-10-26') as number)).toBe('2026-10-26');
        expect(toDay(null)).toBeNull();
    });

    it('summarizes from the earliest start to the latest finish', () => {
        const { items } = buildItems([
            task('range', { start_date: '2026-11-04', due_date: '2026-11-20' }),
            task('due', { due_date: '2026-11-03' }),
            task('start', { start_date: '2026-12-01' }),
            task('undated'),
        ]);
        expect(summarizeItems(items)).toEqual({
            from: toDay('2026-11-03'),
            to: toDay('2026-12-01'),
        });
        expect(summarizeItems([])).toBeNull();
    });

    it('splits dated and undated tasks and orders by start', () => {
        const { items, undated } = buildItems([
            task('late', { start_date: '2026-11-10', due_date: '2026-11-12' }),
            task('due', { due_date: '2026-11-01' }),
            task('none'),
            task('start', { start_date: '2026-10-28' }),
        ]);
        expect(items.map((i) => i.task.uid)).toEqual(['start', 'due', 'late']);
        expect(items.map((i) => i.kind)).toEqual(['start', 'due', 'range']);
        expect(undated.map((t) => t.uid)).toEqual(['none']);
    });

    it('starts the range on a Monday and pads it', () => {
        const { items } = buildItems([
            task('a', { start_date: '2026-11-04', due_date: '2026-11-06' }),
        ]);
        const today = toDay('2026-11-04') as number;
        const { first, last } = buildRange(items, [], today);
        expect(weekdayOf(first)).toBe(1);
        expect(first).toBeLessThanOrEqual(today - 3);
        expect(last - first + 1).toBeGreaterThanOrEqual(35);
    });

    it('follows the latest blocker back from the last linked task', () => {
        const { items } = buildItems([
            task('lease', { start_date: '2026-10-28', due_date: '2026-11-03' }),
            task('internet', {
                start_date: '2026-11-06',
                due_date: '2026-11-10',
            }),
            task('movers', {
                start_date: '2026-11-05',
                due_date: '2026-11-06',
            }),
            task('pack', { start_date: '2026-11-19', due_date: '2026-11-24' }),
        ]);
        const links = [
            { from_uid: 'lease', to_uid: 'movers' },
            { from_uid: 'lease', to_uid: 'internet' },
            { from_uid: 'movers', to_uid: 'pack' },
        ];
        const path = findPath(items, links);
        expect([...path].sort()).toEqual(['lease', 'movers', 'pack']);

        const spare = spareDays(items, links, path, toDay('2026-11-30'));
        expect(spare.get('internet')).toBe(20);
        expect(spare.has('pack')).toBe(false);
    });

    it('moves, stretches and shortens bars', () => {
        const [range] = buildItems([
            task('r', { start_date: '2026-11-02', due_date: '2026-11-04' }),
        ]).items;
        expect(shiftDates(range, 2, 'move')).toEqual({
            start_date: '2026-11-04',
            due_date: '2026-11-06',
        });
        expect(shiftDates(range, 1, 'end')).toEqual({
            due_date: '2026-11-05',
        });
        expect(shiftDates(range, 5, 'start')).toEqual({
            start_date: '2026-11-04',
        });

        const [dueOnly] = buildItems([
            task('d', { due_date: '2026-11-09' }),
        ]).items;
        expect(shiftDates(dueOnly, -1, 'move')).toEqual({
            due_date: '2026-11-08',
        });
    });
});

describe('monthLabelFits', () => {
    it('keeps the label at the left edge and one that ends inside the chart', () => {
        expect(monthLabelFits(0, 'November 2026', 100)).toBe(true);
        expect(monthLabelFits(60, 'déc. 2026', 200)).toBe(true);
    });

    it('leaves out a label that would run past the right edge', () => {
        expect(monthLabelFits(180, 'déc. 2026', 200)).toBe(false);
    });

    it('draws a week or a month as a bar over the whole period', () => {
        const { items, undated } = buildItems([
            task('week', { week_of: '2026-11-16' }),
            task('month', { month_of: '2026-12-01' } as Partial<Task>),
            task('dated', { due_date: '2026-11-18', week_of: '2026-11-30' }),
        ]);
        expect(undated).toEqual([]);
        const byUid = Object.fromEntries(items.map((i) => [i.task.uid, i]));
        expect(byUid.week).toMatchObject({
            kind: 'week',
            from: toDay('2026-11-16'),
            to: toDay('2026-11-22'),
        });
        expect(byUid.month).toMatchObject({
            kind: 'month',
            from: toDay('2026-12-01'),
            to: toDay('2026-12-31'),
        });
        // Exact dates win over the week
        expect(byUid.dated.kind).toBe('due');
    });

    it('moves a week or a month bar by whole periods', () => {
        const { items } = buildItems([
            task('week', { week_of: '2026-11-16' }),
            task('month', { month_of: '2026-12-01' } as Partial<Task>),
        ]);
        const [week, month] = items;
        // Monday-first weeks: 9 days later lands in the week of the 23rd
        expect(shiftDates(week, 9, 'move', 1)).toEqual({
            week_of: '2026-11-23',
        });
        expect(shiftDates(week, 2, 'move', 1)).toEqual({
            week_of: '2026-11-16',
        });
        expect(shiftDates(month, 31, 'move', 1)).toEqual({
            month_of: '2027-01-01',
        });
    });

    it('finds the bar a link is dropped on, never the one it starts from', () => {
        const { items } = buildItems([
            task('a', { due_date: '2026-11-02' }),
            task('b', { due_date: '2026-11-03' }),
        ]);
        expect(linkTarget(items, 'a', 1)?.task.uid).toBe('b');
        expect(linkTarget(items, 'a', 0)).toBeNull();
        expect(linkTarget(items, 'a', 5)).toBeNull();
        expect(linkTarget(items, 'a', -1)).toBeNull();
    });
});
