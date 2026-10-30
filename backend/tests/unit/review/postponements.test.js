const {
    classifyDueChange,
    collectPushes,
    missedPlanDays,
    summarize,
} = require('../../../modules/review/postponements');

const event = (from, to, at, source = 'web') => ({
    old_value: from ? { due_date: from } : null,
    new_value: to ? { due_date: to } : null,
    created_at: at,
    metadata: { source },
});

describe('classifyDueChange', () => {
    const tz = 'Europe/Zurich';

    it('calls a move later off a day that has come a postponement', () => {
        expect(
            classifyDueChange(
                event(
                    '2026-10-20T21:59:59.000Z',
                    '2026-10-22T21:59:59.000Z',
                    '2026-10-20T15:00:00.000Z'
                ),
                tz
            )
        ).toMatchObject({
            kind: 'postponed',
            from: '2026-10-20',
            to: '2026-10-22',
            at: '2026-10-20',
        });
    });

    it('treats tomorrow as imminent and later days as a plan change', () => {
        const at = '2026-10-19T08:00:00.000Z';
        expect(
            classifyDueChange(event('2026-10-20', '2026-10-22', at), tz).kind
        ).toBe('postponed');
        expect(
            classifyDueChange(event('2026-10-25', '2026-10-28', at), tz).kind
        ).toBe('rescheduled');
    });

    it('keeps time shifts, new dates and earlier moves apart', () => {
        const at = '2026-10-20T08:00:00.000Z';
        expect(
            classifyDueChange(
                event(
                    '2026-10-20T08:00:00.000Z',
                    '2026-10-20T12:00:00.000Z',
                    at
                ),
                tz
            ).kind
        ).toBe('time_shift');
        expect(classifyDueChange(event(null, '2026-10-21', at), tz).kind).toBe(
            'scheduled'
        );
        expect(classifyDueChange(event('2026-10-21', null, at), tz).kind).toBe(
            'unscheduled'
        );
        expect(
            classifyDueChange(event('2026-10-21', '2026-10-20', at), tz).kind
        ).toBe('advanced');
    });

    it('never counts writes that did not come from the user', () => {
        for (const source of ['import', 'google', 'sync', 'recurrence']) {
            expect(
                classifyDueChange(
                    event(
                        '2026-10-20',
                        '2026-10-22',
                        '2026-10-20T08:00:00Z',
                        source
                    ),
                    tz
                ).kind
            ).toBe('automatic');
        }
    });

    it('reads the day in the user timezone', () => {
        // 23:30 UTC on the 20th is already the 21st in Zurich.
        expect(
            classifyDueChange(
                event(
                    '2026-10-20T23:30:00.000Z',
                    '2026-10-23T10:00:00.000Z',
                    '2026-10-20T23:30:00.000Z'
                ),
                tz
            ).from
        ).toBe('2026-10-21');
    });
});

describe('pushes', () => {
    it('counts one push per day given up, plan or due date', () => {
        const pushes = collectPushes(
            [
                { kind: 'postponed', from: '2026-10-10', at: '2026-10-11' },
                { kind: 'rescheduled', from: '2026-10-12', at: '2026-10-11' },
                { kind: 'postponed', from: '2026-10-14', at: '2026-10-14' },
            ],
            ['2026-10-10', '2026-10-16']
        );
        expect(pushes.map((p) => p.day)).toEqual([
            '2026-10-10',
            '2026-10-14',
            '2026-10-16',
        ]);
    });

    it('needs three recent pushes and starts over after a review', () => {
        const pushes = [
            { day: '2026-09-01', at: '2026-09-01' },
            { day: '2026-10-20', at: '2026-10-20' },
            { day: '2026-10-22', at: '2026-10-22' },
            { day: '2026-10-25', at: '2026-10-25' },
        ];
        const today = '2026-10-30';
        expect(summarize(pushes, today, null, 'UTC')).toMatchObject({
            recent_count: 3,
            total_count: 4,
            frequent: true,
            last_postponed_on: '2026-10-25',
        });
        expect(
            summarize(pushes, today, '2026-10-23T10:00:00Z', 'UTC')
        ).toMatchObject({ recent_count: 1, frequent: false });
    });

    it('only counts plan days a one-off task was left unfinished', () => {
        const task = { recurrence_type: 'none', completed_at: null };
        expect(
            missedPlanDays(task, ['2026-10-28', '2026-10-30'], '2026-10-30')
        ).toEqual(['2026-10-28']);
        expect(
            missedPlanDays(
                { ...task, completed_at: '2026-10-28T12:00:00Z' },
                ['2026-10-28'],
                '2026-10-30',
                'UTC'
            )
        ).toEqual([]);
        expect(
            missedPlanDays(
                { recurrence_type: 'daily' },
                ['2026-10-28'],
                '2026-10-30',
                'UTC'
            )
        ).toEqual([]);
    });
});
