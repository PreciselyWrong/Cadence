import {
    DEFAULT_VIEW_OPTIONS,
    loadViewOptions,
    sanitizeViewOptions,
    saveViewOptions,
} from '../viewOptions';

const KEY = 'upcoming.viewOptions';

describe('sanitizeViewOptions', () => {
    it('returns the defaults for missing or non-object input', () => {
        expect(sanitizeViewOptions(null)).toEqual(DEFAULT_VIEW_OPTIONS);
        expect(sanitizeViewOptions('days')).toEqual(DEFAULT_VIEW_OPTIONS);
        expect(sanitizeViewOptions(42)).toEqual(DEFAULT_VIEW_OPTIONS);
    });

    it('drops values outside the allowed choices and keeps the good ones', () => {
        const result = sanitizeViewOptions({
            mode: 'calendar',
            groupBy: 'tag',
            sortBy: 'colour',
            showCompleted: 'yes',
            showInbox: false,
            showCalendar: 0,
            calendarSpan: 5,
        });

        expect(result).toEqual({
            ...DEFAULT_VIEW_OPTIONS,
            groupBy: 'tag',
            showInbox: false,
        });
    });

    it('ignores unknown keys', () => {
        const result = sanitizeViewOptions({ mode: 'horizons', extra: true });

        expect(result).toEqual({ ...DEFAULT_VIEW_OPTIONS, mode: 'horizons' });
        expect(result).not.toHaveProperty('extra');
    });

    it('accepts the numeric calendar spans', () => {
        expect(sanitizeViewOptions({ calendarSpan: 7 }).calendarSpan).toBe(7);
        expect(sanitizeViewOptions({ calendarSpan: '7' }).calendarSpan).toBe(1);
    });
});

describe('loadViewOptions and saveViewOptions', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('returns the defaults when nothing is stored', () => {
        expect(loadViewOptions()).toEqual(DEFAULT_VIEW_OPTIONS);
    });

    it('round-trips a saved choice', () => {
        const chosen = {
            ...DEFAULT_VIEW_OPTIONS,
            mode: 'horizons' as const,
            groupBy: 'priority' as const,
            sortBy: 'name' as const,
            showCompleted: false,
            calendarSpan: 3 as const,
        };

        saveViewOptions(chosen);

        expect(loadViewOptions()).toEqual(chosen);
    });

    it('falls back to the defaults when the stored JSON is broken', () => {
        localStorage.setItem(KEY, '{not json');

        expect(loadViewOptions()).toEqual(DEFAULT_VIEW_OPTIONS);
    });

    it('sanitizes stored values that are stale or hand-edited', () => {
        localStorage.setItem(
            KEY,
            JSON.stringify({ groupBy: 'owner', mode: 'horizons' })
        );

        expect(loadViewOptions()).toEqual({
            ...DEFAULT_VIEW_OPTIONS,
            mode: 'horizons',
        });
    });

    it('does not throw when storage refuses the write', () => {
        const spy = jest
            .spyOn(Storage.prototype, 'setItem')
            .mockImplementation(() => {
                throw new Error('QuotaExceededError');
            });

        expect(() => saveViewOptions(DEFAULT_VIEW_OPTIONS)).not.toThrow();

        spy.mockRestore();
    });
});
