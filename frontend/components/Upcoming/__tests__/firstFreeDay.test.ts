import { firstFreeDay } from '../firstFreeDay';

// Thursday 19 November, 13:00; days of 8 h (480 min) unless said otherwise.
const TODAY = '2026-11-19';
const day = (date: string, load: number, capacity = 480) => ({
    date,
    load,
    capacity,
});

describe('firstFreeDay', () => {
    it('takes today when what is left of it holds the task', () => {
        expect(
            firstFreeDay(20, [day(TODAY, 100)], {
                today: TODAY,
                nowMinute: 780,
                dayEnd: 1080,
            })
        ).toBe(TODAY);
    });

    it('skips today once its remaining hours are full', () => {
        // 17:30, the day ends at 18:00: 30 min left, 20 planned.
        expect(
            firstFreeDay(
                20,
                [day(TODAY, 20), day('2026-11-20', 470), day('2026-11-21', 0)],
                { today: TODAY, nowMinute: 1050, dayEnd: 1080 }
            )
        ).toBe('2026-11-21');
    });

    it('fits a task exactly into the time left', () => {
        expect(
            firstFreeDay(20, [day('2026-11-20', 460)], {
                today: TODAY,
                nowMinute: 780,
                dayEnd: 1080,
            })
        ).toBe('2026-11-20');
    });

    it('counts 30 minutes for a task without an estimate', () => {
        expect(
            firstFreeDay(null, [day('2026-11-20', 460), day('2026-11-21', 0)], {
                today: TODAY,
                nowMinute: 780,
                dayEnd: 1080,
            })
        ).toBe('2026-11-21');
    });

    it('skips a day with no hours (a day off) and the past', () => {
        expect(
            firstFreeDay(
                20,
                [
                    day('2026-11-18', 0),
                    day('2026-11-20', 0, 0),
                    day('2026-11-21', 0),
                ],
                { today: TODAY, nowMinute: 780, dayEnd: 1080 }
            )
        ).toBe('2026-11-21');
    });

    it('finds nothing when no day has room', () => {
        expect(
            firstFreeDay(600, [day('2026-11-20', 0)], {
                today: TODAY,
                nowMinute: 780,
                dayEnd: 1080,
            })
        ).toBeNull();
    });
});
