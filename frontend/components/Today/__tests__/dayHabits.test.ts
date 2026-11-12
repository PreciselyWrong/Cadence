import { dayHabits, habitMarks, oneTapAmount } from '../dayHabits';
import type {
    CadenceCalendar,
    CadenceHabit,
} from '../../../utils/cadenceHabitsService';

const habit = (
    uid: string,
    {
        goal = {},
        evaluation = {},
        ...rest
    }: {
        goal?: Record<string, unknown> | null;
        evaluation?: Record<string, unknown>;
        [key: string]: unknown;
    } = {}
): CadenceHabit =>
    ({
        uid,
        name: uid,
        active: true,
        archived: false,
        sort_order: 0,
        color_argb: null,
        goal:
            goal === null
                ? null
                : {
                      direction: 'AT_LEAST',
                      target_minor: 1,
                      goal_type: 'BINARY',
                      ...goal,
                  },
        status: {
            date: '2026-11-12',
            streak: null,
            evaluation: {
                is_planned: true,
                is_paused: false,
                validates_period: false,
                ...evaluation,
            },
        },
        ...rest,
    }) as unknown as CadenceHabit;

describe('dayHabits', () => {
    it('lists the goal habits planned that day, done ones apart, in order', () => {
        const { open, done } = dayHabits([
            habit('b', { sort_order: 2 }),
            habit('a', { sort_order: 1 }),
            habit('done', { evaluation: { validates_period: true } }),
            habit('rest', { evaluation: { is_planned: false } }),
            habit('paused', { evaluation: { is_paused: true } }),
            habit('limit', {
                goal: { direction: 'AT_MOST', target_minor: 3 },
            }),
            habit('quit', { goal: { direction: 'AT_MOST', target_minor: 0 } }),
            habit('tracker', { goal: { direction: 'TRACK_ONLY' } }),
            habit('archived', { archived: true }),
            habit('nogoal', { goal: null }),
        ]);
        expect(open.map((h) => h.uid)).toEqual(['a', 'b']);
        expect(done.map((h) => h.uid)).toEqual(['done']);
    });
});

describe('oneTapAmount', () => {
    it('logs 1 for yes/no, the first quick value, else one unit', () => {
        expect(oneTapAmount(habit('b'))).toBe(1);
        const water = habit('w', {
            goal: {
                goal_type: 'QUANTITY',
                unit_id: 'glass',
                unit_scale_to_canonical: 250,
            },
        });
        expect(
            oneTapAmount(water, [
                { amount_minor: 500 } as never,
                { amount_minor: 250 } as never,
            ])
        ).toBe(500);
        expect(oneTapAmount(habit('c', { goal: { goal_type: 'COUNT' } }))).toBe(
            1
        );
    });
});

describe('habitMarks', () => {
    const calendar = (
        days: Record<string, { time: string | null; done?: boolean }>
    ): CadenceCalendar => ({
        from: '2026-11-12',
        to: '2026-11-12',
        timezone: 'Europe/Paris',
        habits: Object.entries(days).map(([uid, day]) => ({
            uid,
            name: uid,
            icon_id: null,
            color_argb: 0xff3366cc,
            group_uid: null,
            days: [
                {
                    date: '2026-11-12',
                    status: 'NO_ACTIVITY',
                    done: !!day.done,
                    time: day.time,
                },
            ],
        })),
    });

    it('puts the due habits with a time on the calendar, by time', () => {
        const marks = habitMarks(
            calendar({
                late: { time: '21:30' },
                early: { time: '07:05', done: true },
                untimed: { time: null },
                notDue: { time: '08:00' },
            }),
            '2026-11-12',
            [habit('late'), habit('early'), habit('untimed')]
        );
        expect(marks).toEqual([
            {
                uid: 'early',
                name: 'early',
                minute: 425,
                color: '#3366cc',
                done: true,
            },
            {
                uid: 'late',
                name: 'late',
                minute: 1290,
                color: '#3366cc',
                done: false,
            },
        ]);
    });

    it('shows nothing before the calendar loads or on a bad time', () => {
        expect(habitMarks(null, '2026-11-12', [habit('a')])).toEqual([]);
        expect(
            habitMarks(calendar({ a: { time: '25:00' } }), '2026-11-12', [
                habit('a'),
            ])
        ).toEqual([]);
    });
});
