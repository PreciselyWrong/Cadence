const moment = require('moment-timezone');
const {
    calculateNextDueDate,
    nextDueDateSkippingExdates,
} = require('../../../../modules/tasks/recurringTaskService');
const {
    planOccurrenceAdvance,
} = require('../../../../modules/tasks/operations/recurring');

const TZ = 'Europe/Zurich';

const at = (local) => moment.tz(local, 'YYYY-MM-DD HH:mm', TZ).toDate();
const local = (date) => moment.utc(date).tz(TZ).format('YYYY-MM-DD HH:mm');

const timed = (fields) => ({ due_has_time: true, ...fields });

describe('calculateNextDueDate - timed recurrences across Europe/Zurich DST', () => {
    describe('spring forward (last Sunday of March, 2026-03-29)', () => {
        it('keeps 09:00 for a daily task', () => {
            const next = calculateNextDueDate(
                timed({ recurrence_type: 'daily', recurrence_interval: 1 }),
                at('2026-03-28 09:00'),
                TZ
            );
            expect(local(next)).toBe('2026-03-29 09:00');
            expect(next.toISOString()).toBe('2026-03-29T07:00:00.000Z');
        });

        it('keeps 09:00 for a weekly task on Sunday', () => {
            const next = calculateNextDueDate(
                timed({
                    recurrence_type: 'weekly',
                    recurrence_interval: 1,
                    recurrence_weekday: 0,
                }),
                at('2026-03-22 09:00'),
                TZ
            );
            expect(local(next)).toBe('2026-03-29 09:00');
        });

        it('keeps 09:00 for a weekly task on Monday across the switch', () => {
            const next = calculateNextDueDate(
                timed({
                    recurrence_type: 'weekly',
                    recurrence_interval: 1,
                    recurrence_weekday: 1,
                }),
                at('2026-03-23 09:00'),
                TZ
            );
            expect(local(next)).toBe('2026-03-30 09:00');
        });

        it('keeps 09:00 for a monthly task', () => {
            const next = calculateNextDueDate(
                timed({
                    recurrence_type: 'monthly',
                    recurrence_interval: 1,
                    recurrence_month_day: 15,
                }),
                at('2026-03-15 09:00'),
                TZ
            );
            expect(local(next)).toBe('2026-04-15 09:00');
        });

        it('keeps 09:00 for a monthly task landing on the switch day', () => {
            const next = calculateNextDueDate(
                timed({
                    recurrence_type: 'monthly',
                    recurrence_interval: 1,
                    recurrence_month_day: 29,
                }),
                at('2026-02-28 09:00'),
                TZ
            );
            expect(local(next)).toBe('2026-03-29 09:00');
        });

        it('keeps 09:00 for a monthly last-day task', () => {
            const next = calculateNextDueDate(
                timed({ recurrence_type: 'monthly_last_day' }),
                at('2026-02-28 09:00'),
                TZ
            );
            expect(local(next)).toBe('2026-03-31 09:00');
        });

        it('keeps 09:00 for a monthly weekday task', () => {
            const next = calculateNextDueDate(
                timed({
                    recurrence_type: 'monthly_weekday',
                    recurrence_weekday: 0,
                    recurrence_week_of_month: 5,
                }),
                at('2026-02-22 09:00'),
                TZ
            );
            expect(local(next)).toBe('2026-03-29 09:00');
        });
    });

    describe('fall back (last Sunday of October, 2026-10-25)', () => {
        it('keeps 09:00 for a daily task', () => {
            const next = calculateNextDueDate(
                timed({ recurrence_type: 'daily', recurrence_interval: 1 }),
                at('2026-10-24 09:00'),
                TZ
            );
            expect(local(next)).toBe('2026-10-25 09:00');
            expect(next.toISOString()).toBe('2026-10-25T08:00:00.000Z');
        });

        it('keeps 09:00 for a weekly task spanning several weeks of interval', () => {
            const next = calculateNextDueDate(
                timed({
                    recurrence_type: 'weekly',
                    recurrence_interval: 2,
                    recurrence_weekday: 1,
                }),
                at('2026-10-19 09:00'),
                TZ
            );
            expect(local(next)).toBe('2026-11-02 09:00');
        });

        it('keeps 09:00 for a weekly multi-weekday task', () => {
            const next = calculateNextDueDate(
                timed({
                    recurrence_type: 'weekly',
                    recurrence_interval: 1,
                    recurrence_weekdays: [5, 0],
                }),
                at('2026-10-23 09:00'),
                TZ
            );
            expect(local(next)).toBe('2026-10-25 09:00');
        });

        it('keeps 09:00 for a monthly task', () => {
            const next = calculateNextDueDate(
                timed({
                    recurrence_type: 'monthly',
                    recurrence_interval: 1,
                    recurrence_month_day: 15,
                }),
                at('2026-10-15 09:00'),
                TZ
            );
            expect(local(next)).toBe('2026-11-15 09:00');
        });

        it('keeps a late-evening time on the right local day', () => {
            const next = calculateNextDueDate(
                timed({ recurrence_type: 'daily', recurrence_interval: 1 }),
                at('2026-10-24 23:30'),
                TZ
            );
            expect(local(next)).toBe('2026-10-25 23:30');
        });
    });

    it('steps over exdates while keeping the local time', () => {
        const next = nextDueDateSkippingExdates(
            timed({
                recurrence_type: 'daily',
                recurrence_interval: 1,
                recurrence_exdates: ['2026-03-29'],
            }),
            at('2026-03-28 09:00'),
            TZ
        );
        expect(local(next)).toBe('2026-03-30 09:00');
    });

    it('keeps 09:00 when completing a timed daily task across the switch', () => {
        const plan = planOccurrenceAdvance(
            timed({
                recurrence_type: 'daily',
                recurrence_interval: 1,
                due_date: at('2026-03-28 09:00'),
            }),
            { timezone: TZ, now: at('2026-03-28 10:00') }
        );
        expect(plan.hasNext).toBe(true);
        expect(local(plan.nextDueDate)).toBe('2026-03-29 09:00');
    });

    it('leaves date-only tasks on the existing UTC arithmetic', () => {
        const from = new Date(Date.UTC(2026, 2, 28, 0, 0, 0));
        const next = calculateNextDueDate(
            { recurrence_type: 'daily', recurrence_interval: 1 },
            from,
            TZ
        );
        expect(next.toISOString()).toBe('2026-03-29T00:00:00.000Z');
    });
});
