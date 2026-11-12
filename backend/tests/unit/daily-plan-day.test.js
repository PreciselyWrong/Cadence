const {
    blockingTaskIds,
    planIdsOn,
    buildSuggestions,
} = require('../../modules/daily-plan/day');

describe('daily plan day membership (pure)', () => {
    const today = '2026-11-12';
    const lines = [
        { task_id: 1, plan_date: '2026-11-10' }, // past day only
        { task_id: 2, plan_date: '2026-11-12' }, // today
        { task_id: 3, plan_date: '2026-11-13' }, // tomorrow
        { task_id: 4, plan_date: '2026-11-09' }, // past, also on the day below
        { task_id: 4, plan_date: '2026-11-11' },
    ];

    it('blocks a task planned on the day itself or on any day from today on', () => {
        expect(
            [...blockingTaskIds(lines, { date: '2026-11-12', today })].sort()
        ).toEqual([2, 3]);
    });

    it('for a past day, blocks only that day and later plans', () => {
        expect(
            [...blockingTaskIds(lines, { date: '2026-11-11', today })].sort()
        ).toEqual([2, 3, 4]);
    });

    it('never blocks a task that is only planned on a past day', () => {
        expect(blockingTaskIds(lines, { date: today, today }).has(1)).toBe(
            false
        );
    });

    it('lists the tasks planned on the given day only', () => {
        expect([...planIdsOn(lines, '2026-11-13')]).toEqual([3]);
        expect(planIdsOn(lines, '2026-11-01').size).toBe(0);
    });

    describe('buildSuggestions', () => {
        const task = (uid, extra = {}) => ({ uid, ...extra });
        const candidates = {
            tagged_today: [task('plan-tag'), task('free-tag')],
            in_progress: [task('plan-started')],
            tomorrow: [task('due-soon')],
            suggested: [
                task('week', { week_of: '2026-11-09' }),
                task('view', { in_view: true }),
                task('plain'),
                task('due-now'),
            ],
            suggested_total: 4,
            inbox_count: 2,
        };

        it('splits suggested tasks into this week, in view and the rest', () => {
            const result = buildSuggestions(candidates, {
                weekStart: '2026-11-09',
                excludeUids: new Set(),
            });
            expect(result.this_week.map((t) => t.uid)).toEqual(['week']);
            expect(result.in_view.map((t) => t.uid)).toEqual(['view']);
            expect(result.suggested.map((t) => t.uid)).toEqual([
                'plain',
                'due-now',
            ]);
            expect(result.suggested_total).toBe(4);
            expect(result.inbox_count).toBe(2);
        });

        it('removes excluded tasks from every list, once', () => {
            const result = buildSuggestions(candidates, {
                weekStart: '2026-11-09',
                excludeUids: new Set(['plan-tag', 'plan-started', 'due-now']),
            });
            expect(result.tagged_today.map((t) => t.uid)).toEqual(['free-tag']);
            expect(result.in_progress).toEqual([]);
            expect(result.suggested.map((t) => t.uid)).toEqual(['plain']);
        });
    });
});
