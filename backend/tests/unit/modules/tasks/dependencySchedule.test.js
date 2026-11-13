const {
    periodOf,
    pushFor,
} = require('../../../../modules/tasks/dependencies/core/schedule');

// Monday-first weeks unless a test says otherwise.
const MON = 1;

const dates = (from, to = from) => ({ grain: 'day', from, to });
const week = (start) => periodOf({ week_of: start }, MON);
const month = (start) => periodOf({ month_of: start });

describe('periodOf', () => {
    it('spans start to due, or the one date there is', () => {
        expect(periodOf({ start: '2026-11-02', due: '2026-11-05' })).toEqual(
            dates('2026-11-02', '2026-11-05')
        );
        expect(periodOf({ due: '2026-11-05' })).toEqual(dates('2026-11-05'));
        expect(periodOf({ start: '2026-11-02' })).toEqual(dates('2026-11-02'));
    });

    it('prefers exact dates over a week or a month', () => {
        expect(
            periodOf({ due: '2026-11-05', week_of: '2026-11-16' }, MON)
        ).toEqual(dates('2026-11-05'));
    });

    it('covers the whole week or month of a horizon', () => {
        expect(week('2026-11-16')).toEqual({
            grain: 'week',
            from: '2026-11-16',
            to: '2026-11-22',
        });
        expect(month('2026-02-01')).toEqual({
            grain: 'month',
            from: '2026-02-01',
            to: '2026-02-28',
        });
    });

    it('has no period without a date, week or month', () => {
        expect(periodOf({})).toBeNull();
    });
});

describe('pushFor', () => {
    it('leaves a successor that starts after the predecessor ends', () => {
        expect(
            pushFor(dates('2026-11-02', '2026-11-04'), dates('2026-11-05'), MON)
        ).toBeNull();
    });

    it('pushes overlapping dates to the day after, keeping the length', () => {
        expect(
            pushFor(
                dates('2026-11-02', '2026-11-06'),
                dates('2026-11-04', '2026-11-05'),
                MON
            )
        ).toEqual({ shiftDays: 3 });
    });

    it('pushes a successor that starts on the predecessor last day', () => {
        expect(
            pushFor(dates('2026-11-02', '2026-11-04'), dates('2026-11-04'), MON)
        ).toEqual({ shiftDays: 1 });
    });

    it('lets two tasks share a week, and pushes a week left behind', () => {
        expect(pushFor(week('2026-11-16'), week('2026-11-16'), MON)).toBeNull();
        expect(pushFor(week('2026-11-23'), week('2026-11-16'), MON)).toEqual({
            weekOf: '2026-11-23',
        });
    });

    it('compares a dated task and a week by week, moving whole weeks', () => {
        // Thursday of the predecessor's week: same week, fine
        expect(
            pushFor(week('2026-11-16'), dates('2026-11-19'), MON)
        ).toBeNull();
        // Predecessor slips to the next week: the Thursday follows it
        expect(pushFor(week('2026-11-23'), dates('2026-11-19'), MON)).toEqual({
            shiftDays: 7,
        });
        // A dated predecessor ending in a later week drags a week task
        expect(pushFor(dates('2026-11-25'), week('2026-11-16'), MON)).toEqual({
            weekOf: '2026-11-23',
        });
    });

    it('uses the owner first day of the week', () => {
        // Sunday-first: Sun 2026-11-22 starts the week after Sat 11-21
        const sundayWeek = periodOf({ week_of: '2026-11-15' }, 0);
        expect(pushFor(dates('2026-11-22'), sundayWeek, 0)).toEqual({
            weekOf: '2026-11-22',
        });
    });

    it('compares by month when either side is a month', () => {
        expect(
            pushFor(month('2026-11-01'), dates('2026-11-20'), MON)
        ).toBeNull();
        // Days shift by the length of the month(s) crossed
        expect(pushFor(month('2026-12-01'), dates('2026-11-20'), MON)).toEqual({
            shiftDays: 30,
        });
        expect(pushFor(dates('2027-01-10'), month('2026-11-01'), MON)).toEqual({
            monthOf: '2027-01-01',
        });
    });

    it('moves a week task to the first week starting in the month', () => {
        // December 2026 starts on a Tuesday: the first Monday is the 7th
        expect(pushFor(month('2026-12-01'), week('2026-11-16'), MON)).toEqual({
            weekOf: '2026-12-07',
        });
    });
});
