const {
    normalizeQuietHours,
    getQuietUntil,
} = require('../../../utils/quietHours');

const user = (quiet, timezone = 'UTC') => ({
    timezone,
    quiet_hours: quiet,
});

describe('quietHours', () => {
    it('is never quiet when disabled or unset', () => {
        const now = new Date('2026-11-01T23:00:00Z');
        expect(getQuietUntil(user(null), now)).toBeNull();
        expect(
            getQuietUntil(
                user({ enabled: false, start: '22:00', end: '07:00' }),
                now
            )
        ).toBeNull();
    });

    it('ends an overnight window the next morning when started tonight', () => {
        const until = getQuietUntil(
            user({ enabled: true, start: '22:00', end: '07:00' }),
            new Date('2026-11-01T23:30:00Z')
        );
        expect(until.toISOString()).toBe('2026-11-02T07:00:00.000Z');
    });

    it('ends an overnight window the same morning after midnight', () => {
        const until = getQuietUntil(
            user({ enabled: true, start: '22:00', end: '07:00' }),
            new Date('2026-11-02T03:00:00Z')
        );
        expect(until.toISOString()).toBe('2026-11-02T07:00:00.000Z');
    });

    it('is not quiet outside the window', () => {
        expect(
            getQuietUntil(
                user({ enabled: true, start: '22:00', end: '07:00' }),
                new Date('2026-11-02T12:00:00Z')
            )
        ).toBeNull();
    });

    it('handles a same-day window with the end excluded', () => {
        const quiet = { enabled: true, start: '13:00', end: '15:00' };
        expect(
            getQuietUntil(
                user(quiet),
                new Date('2026-11-02T14:00:00Z')
            ).toISOString()
        ).toBe('2026-11-02T15:00:00.000Z');
        expect(
            getQuietUntil(user(quiet), new Date('2026-11-02T15:00:00Z'))
        ).toBeNull();
    });

    it('reads the window in the user timezone', () => {
        const quiet = { enabled: true, start: '22:00', end: '07:00' };
        // 21:30 UTC is 22:30 in Paris (CET) on 2026-11-02.
        const until = getQuietUntil(
            user(quiet, 'Europe/Paris'),
            new Date('2026-11-02T21:30:00Z')
        );
        expect(until.toISOString()).toBe('2026-11-03T06:00:00.000Z');
        expect(
            getQuietUntil(
                user(quiet, 'Europe/Paris'),
                new Date('2026-11-02T20:30:00Z')
            )
        ).toBeNull();
    });

    it('treats an empty window as no quiet hours', () => {
        expect(
            getQuietUntil(
                user({ enabled: true, start: '08:00', end: '08:00' }),
                new Date('2026-11-02T08:00:00Z')
            )
        ).toBeNull();
    });

    it('normalizes and rejects malformed settings', () => {
        expect(
            normalizeQuietHours({ enabled: true, start: '22:00', end: '07:00' })
        ).toEqual({ enabled: true, start: '22:00', end: '07:00' });
        expect(
            normalizeQuietHours({ enabled: true, start: '25:00', end: '07:00' })
        ).toBeNull();
        expect(normalizeQuietHours('x')).toBeNull();
    });
});
