'use strict';

const {
    addDays,
    weekday,
    timelineDates,
    localDay,
    isWithinLookback,
} = require('../../../../modules/daily-plan/brief/rules/dates');

describe('dates', () => {
    it('adds days across month, year and leap days', () => {
        expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
        expect(addDays('2026-11-04', -7)).toBe('2026-10-28');
    });

    it('gives the weekday with Sunday as 0', () => {
        expect(weekday('2026-11-04')).toBe(3);
        expect(weekday('2026-11-01')).toBe(0);
    });

    it('lists the timeline from today', () => {
        expect(timelineDates('2026-12-30', 3)).toEqual([
            '2026-12-30',
            '2026-12-31',
            '2027-01-01',
        ]);
    });

    it('takes the local day of an instant in the user timezone', () => {
        expect(localDay('2026-11-03T23:30:00Z', 'Europe/Paris')).toBe(
            '2026-11-04'
        );
        expect(localDay(null, 'Europe/Paris')).toBeNull();
    });

    it('checks the closed-task lookback in local days', () => {
        const options = {
            timezone: 'Europe/Paris',
            today: '2026-11-04',
            days: 7,
        };
        expect(isWithinLookback('2026-10-28T10:00:00Z', options)).toBe(true);
        expect(isWithinLookback('2026-10-27T10:00:00Z', options)).toBe(false);
    });
});
