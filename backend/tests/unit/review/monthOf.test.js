const { ValidationError } = require('../../../shared/errors');
const {
    parseMonthOf,
    applyDecisionFields,
} = require('../../../modules/review/fields');

// "This month" and "next month" are calendar months on the user's clock, the
// same way "this week" is read against today in the user's timezone.
describe('parseMonthOf', () => {
    afterEach(() => jest.useRealTimers());

    const at = (iso) => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        jest.setSystemTime(new Date(iso));
    };

    const zurich = { timezone: 'Europe/Zurich' };

    it('resolves this_month to the first day of the current month', () => {
        at('2026-11-12T12:00:00+01:00');
        expect(parseMonthOf('this_month', zurich)).toBe('2026-11-01');
    });

    it('resolves next_month to the first day of the following month', () => {
        at('2026-11-12T12:00:00+01:00');
        expect(parseMonthOf('next_month', zurich)).toBe('2026-12-01');
    });

    it('rolls next_month over the year end', () => {
        at('2026-12-20T12:00:00+01:00');
        expect(parseMonthOf('next_month', zurich)).toBe('2027-01-01');
    });

    it("reads today in the user's timezone, not the server's", () => {
        // 23:30 on 31 October in Zurich is 12:30 on 1 November in Kiritimati.
        at('2026-10-31T23:30:00+01:00');
        expect(
            parseMonthOf('this_month', { timezone: 'Pacific/Kiritimati' })
        ).toBe('2026-11-01');
        expect(parseMonthOf('this_month', zurich)).toBe('2026-10-01');
    });

    it('normalizes a date to the first day of its month', () => {
        expect(parseMonthOf('2026-03-17', zurich)).toBe('2026-03-01');
        expect(parseMonthOf('2026-03-01', zurich)).toBe('2026-03-01');
    });

    it('clears the month on null or an empty value', () => {
        expect(parseMonthOf(null, zurich)).toBeNull();
        expect(parseMonthOf('', zurich)).toBeNull();
    });

    it.each([['2026-13-01'], ['2026-02-30'], ['this_week'], ['soon'], [42]])(
        'refuses %p with a clear message',
        (value) => {
            expect(() => parseMonthOf(value, zurich)).toThrow(ValidationError);
            expect(() => parseMonthOf(value, zurich)).toThrow(
                'month_of must be a date (YYYY-MM-DD), this_month, next_month or null'
            );
        }
    );
});

describe('applyDecisionFields with month_of', () => {
    const user = { timezone: 'Europe/Zurich', first_day_of_week: 1 };

    it('sets month_of from the body', () => {
        const attrs = {};
        applyDecisionFields(attrs, { month_of: '2026-05-20' }, {}, user);
        expect(attrs.month_of).toBe('2026-05-01');
    });

    it('later clears month_of with the week and the view', () => {
        const attrs = {};
        applyDecisionFields(
            attrs,
            { later: true },
            { in_view_at: new Date() },
            user
        );
        expect(attrs.month_of).toBeNull();
        expect(attrs.week_of).toBeNull();
        expect(attrs.in_view_at).toBeNull();
    });
});
