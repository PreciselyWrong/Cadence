import {
    buildMonthGrid,
    datePresets,
    formatDateLabel,
    toYmd,
} from '../datePresets';

// 2026-10-30 is a Friday.
const friday = new Date(2026, 9, 30, 14, 20);

describe('datePresets', () => {
    it('resolves the quick choices against a fixed date (Sunday-first week)', () => {
        expect(datePresets(friday, 0)).toEqual({
            today: '2026-10-30',
            tomorrow: '2026-10-31',
            weekend: '2026-10-31',
            next_week: '2026-11-01',
        });
    });

    it('starts next week on the configured first day', () => {
        expect(datePresets(friday, 1).next_week).toBe('2026-11-02');
        expect(datePresets(friday, 6).next_week).toBe('2026-10-31');
    });

    it('rolls the weekend forward once it has started', () => {
        const saturday = new Date(2026, 9, 31, 9, 0);
        expect(datePresets(saturday, 1).weekend).toBe('2026-11-07');
    });
});

describe('toYmd', () => {
    it('uses the local calendar day, not UTC', () => {
        expect(toYmd(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    });
});

describe('buildMonthGrid', () => {
    it('returns six weeks starting on the first day of week', () => {
        const grid = buildMonthGrid(2026, 9, 1);
        expect(grid).toHaveLength(42);
        // 1 Oct 2026 is a Thursday: a Monday-first grid starts 28 Sep.
        expect(grid[0]).toEqual({ date: '2026-09-28', inMonth: false });
        expect(grid[3]).toEqual({ date: '2026-10-01', inMonth: true });
    });

    it('starts on Sunday when the week starts on Sunday', () => {
        const grid = buildMonthGrid(2026, 9, 0);
        expect(grid[0].date).toBe('2026-09-27');
        expect(grid.filter((c) => c.inMonth)).toHaveLength(31);
    });
});

describe('formatDateLabel', () => {
    it('shows no time when there is none', () => {
        const label = formatDateLabel('2026-10-30', null, 'en-GB');
        expect(label).toBe('30 Oct 2026');
        expect(label).not.toMatch(/at|0:00|00:00/);
    });

    it('treats midnight as no time', () => {
        expect(formatDateLabel('2026-10-30', '00:00', 'en-GB')).toBe(
            '30 Oct 2026'
        );
    });

    it('is locale aware and joins a time without "at"', () => {
        const fr = formatDateLabel('2026-10-30', '14:30', 'fr-FR');
        expect(fr).toContain('30');
        expect(fr).toContain('oct');
        expect(fr).toContain('14:30');
        expect(fr).not.toMatch(/\bat\b/);
    });
});
