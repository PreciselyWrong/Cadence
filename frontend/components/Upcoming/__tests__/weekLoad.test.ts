import { weekLoad } from '../weekLoad';
import type { DayResponse } from '../../../utils/dayService';
import type { DailyPlanItem } from '../../../utils/dailyPlanService';
import type { Task } from '../../../entities/Task';

// Thursday 2026-11-19; weeks start on Monday (1): the week ends Sunday 22.
const TODAY = '2026-11-19';

const line = (uid: string, minutes: number, done = false): DailyPlanItem =>
    ({
        task_uid: uid,
        task: {
            uid,
            name: uid,
            status: done ? 2 : 0,
            tags: [],
        } as unknown as Task,
        position: 0,
        start_minute: null,
        duration_minutes: minutes,
        occurrence_done: done,
    }) as DailyPlanItem;

const day = (
    date: string,
    items: DailyPlanItem[],
    hours: { start: number; end: number } | null = { start: 480, end: 1080 }
): DayResponse =>
    ({
        date,
        plan: { items },
        due: [],
        day_hours: hours,
    }) as unknown as DayResponse;

describe('weekLoad', () => {
    it('adds the open plan lines from today to the end of the week', () => {
        const load = weekLoad(
            {
                '2026-11-18': day('2026-11-18', [line('past', 600)]),
                '2026-11-19': day('2026-11-19', [
                    line('a', 90),
                    line('d', 60, true),
                ]),
                '2026-11-20': day('2026-11-20', [line('b', 30)]),
                '2026-11-21': day('2026-11-21', []),
                '2026-11-22': day('2026-11-22', [line('c', 45)]),
                '2026-11-23': day('2026-11-23', [line('next', 300)]),
            },
            TODAY,
            1,
            480
        );
        // Yesterday, next Monday and done lines do not count.
        expect(load).toEqual({
            planned: 165,
            available: 4 * 600,
            complete: true,
        });
    });

    it('counts the usual day for a day not loaded yet, and says so', () => {
        const load = weekLoad(
            { '2026-11-19': day('2026-11-19', [line('a', 60)], null) },
            TODAY,
            1,
            480
        );
        expect(load).toEqual({
            planned: 60,
            available: 4 * 480,
            complete: false,
        });
    });

    it('ends the week on Saturday when weeks start on Sunday', () => {
        const load = weekLoad({}, TODAY, 0, 480);
        expect(load.available).toBe(3 * 480);
    });
});
