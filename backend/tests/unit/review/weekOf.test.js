const { parseWeekOf } = require('../../../modules/review/fields');

// "This week" is the calendar week containing today, by the user's first day
// of week, including on its last day: the Review "This week" tab, Today's
// suggestions and the chips all read week_of against the current week, so a
// task decided on Sunday must still show there. The coming week is next_week.
describe('parseWeekOf', () => {
    afterEach(() => jest.useRealTimers());

    const at = (iso) => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        jest.setSystemTime(new Date(iso));
    };

    describe('Monday-start user', () => {
        const user = { timezone: 'Europe/Zurich', first_day_of_week: 1 };

        it('keeps the current week on Sunday, its last day', () => {
            at('2026-11-01T18:00:00+01:00'); // Sunday
            expect(parseWeekOf('this_week', user)).toBe('2026-10-26');
            expect(parseWeekOf('next_week', user)).toBe('2026-11-02');
        });

        it('starts the week on Monday itself', () => {
            at('2026-11-02T08:00:00+01:00'); // Monday
            expect(parseWeekOf('this_week', user)).toBe('2026-11-02');
        });

        it('defaults to Monday when the setting is missing', () => {
            at('2026-11-01T18:00:00+01:00');
            expect(
                parseWeekOf('this_week', { timezone: 'Europe/Zurich' })
            ).toBe('2026-10-26');
        });
    });

    describe('Sunday-start user', () => {
        const user = { timezone: 'Europe/Zurich', first_day_of_week: 0 };

        it('opens a new week on Sunday', () => {
            at('2026-11-01T18:00:00+01:00'); // Sunday
            expect(parseWeekOf('this_week', user)).toBe('2026-11-01');
            expect(parseWeekOf('next_week', user)).toBe('2026-11-08');
        });

        it('keeps the current week on Saturday, its last day', () => {
            at('2026-10-31T18:00:00+01:00'); // Saturday
            expect(parseWeekOf('this_week', user)).toBe('2026-10-25');
        });
    });

    it("uses the user's day, not the server's (late Sunday in Zurich)", () => {
        at('2026-11-01T23:30:00+01:00');
        const user = { timezone: 'Pacific/Kiritimati', first_day_of_week: 1 };
        // 23:30 in Zurich is Monday 12:30 in Kiritimati (UTC+14).
        expect(parseWeekOf('this_week', user)).toBe('2026-11-02');
    });
});
