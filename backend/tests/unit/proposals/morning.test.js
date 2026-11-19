'use strict';

const {
    parseTimeMinutes,
    isMorningRunDue,
    shouldRunMorningReplan,
} = require('../../../modules/proposals/core/morning');

describe('proposals/core/morning', () => {
    const base = {
        timezone: 'Europe/Paris',
        setting: { enabled: true, time: '06:30' },
        hasOverdue: true,
        agentListening: true,
        hasWeekProposalTodayOrPending: false,
    };

    describe('parseTimeMinutes', () => {
        it('parses valid 24-hour HH:MM strings', () => {
            expect(parseTimeMinutes('00:00')).toBe(0);
            expect(parseTimeMinutes('06:30')).toBe(390);
            expect(parseTimeMinutes('23:59')).toBe(1439);
        });

        it('returns null for invalid times', () => {
            expect(parseTimeMinutes('6:30')).toBeNull();
            expect(parseTimeMinutes('24:00')).toBeNull();
            expect(parseTimeMinutes('12:60')).toBeNull();
            expect(parseTimeMinutes(null)).toBeNull();
        });
    });

    describe('isMorningRunDue', () => {
        it('respects the time window in the user timezone', () => {
            // Europe/Paris is UTC+1 in November (2026-11-19).
            // 06:29 Paris = 05:29 UTC
            expect(
                isMorningRunDue({
                    now: new Date('2026-11-19T05:29:00Z'),
                    timezone: 'Europe/Paris',
                    setting: { enabled: true, time: '06:30' },
                })
            ).toBe(false);

            // 06:30 Paris = 05:30 UTC
            expect(
                isMorningRunDue({
                    now: new Date('2026-11-19T05:30:00Z'),
                    timezone: 'Europe/Paris',
                    setting: { enabled: true, time: '06:30' },
                })
            ).toBe(true);

            // 06:40 Paris = 05:40 UTC
            expect(
                isMorningRunDue({
                    now: new Date('2026-11-19T05:40:00Z'),
                    timezone: 'Europe/Paris',
                    setting: { enabled: true, time: '06:30' },
                })
            ).toBe(true);

            // At 05:30 UTC, America/New_York (UTC-5) is 00:30 local -> not due yet
            expect(
                isMorningRunDue({
                    now: new Date('2026-11-19T05:30:00Z'),
                    timezone: 'America/New_York',
                    setting: { enabled: true, time: '06:30' },
                })
            ).toBe(false);
        });

        it('returns false when disabled', () => {
            expect(
                isMorningRunDue({
                    now: new Date('2026-11-19T08:00:00Z'),
                    timezone: 'UTC',
                    setting: { enabled: false, time: '06:30' },
                })
            ).toBe(false);
        });
    });

    describe('shouldRunMorningReplan', () => {
        const dueNow = new Date('2026-11-19T05:35:00Z'); // 06:35 Europe/Paris

        it('runs when all conditions hold', () => {
            expect(shouldRunMorningReplan({ ...base, now: dueNow })).toBe(true);
        });

        it('skips before the user chosen time', () => {
            expect(
                shouldRunMorningReplan({
                    ...base,
                    now: new Date('2026-11-19T05:25:00Z'), // 06:25 Paris
                })
            ).toBe(false);
        });

        it('skips when already run today or pending', () => {
            expect(
                shouldRunMorningReplan({
                    ...base,
                    now: dueNow,
                    hasWeekProposalTodayOrPending: true,
                })
            ).toBe(false);
        });

        it('skips when setting is off', () => {
            expect(
                shouldRunMorningReplan({
                    ...base,
                    now: dueNow,
                    setting: { enabled: false, time: '06:30' },
                })
            ).toBe(false);
        });

        it('skips when nothing is overdue', () => {
            expect(
                shouldRunMorningReplan({
                    ...base,
                    now: dueNow,
                    hasOverdue: false,
                })
            ).toBe(false);
        });

        it('skips when no agent is listening', () => {
            expect(
                shouldRunMorningReplan({
                    ...base,
                    now: dueNow,
                    agentListening: false,
                })
            ).toBe(false);
        });
    });
    it('does not start in the evening: three hours after the chosen time at most', () => {
        const setting = { enabled: true, time: '06:30' };
        const at = (iso) =>
            isMorningRunDue({
                now: new Date(iso),
                timezone: 'Europe/Zurich',
                setting,
            });
        expect(at('2026-11-19T05:45:00Z')).toBe(true);
        expect(at('2026-11-19T08:29:00Z')).toBe(true);
        expect(at('2026-11-19T08:31:00Z')).toBe(false);
        expect(at('2026-11-19T20:00:00Z')).toBe(false);
    });
});
