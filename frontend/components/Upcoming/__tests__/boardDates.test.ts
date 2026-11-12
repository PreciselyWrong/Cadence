import {
    BOARD_DAYS,
    CALENDAR_MAX,
    CALENDAR_MIN,
    anchorFor,
    boardDates,
    calendarMaxWidth,
    calendarPlacement,
    calendarStart,
    clampCalendarWidth,
    minBoardWidth,
    neighbourDate,
    shiftWeek,
} from '../boardDates';

const TODAY = '2026-11-12';

describe('board dates', () => {
    it('shows two weeks from the anchor', () => {
        const dates = boardDates(TODAY);
        expect(dates).toHaveLength(BOARD_DAYS);
        expect(dates[0]).toBe(TODAY);
        expect(dates[13]).toBe('2026-11-25');
    });

    it('moves by whole weeks', () => {
        expect(shiftWeek(TODAY, 1)).toBe('2026-11-19');
        expect(shiftWeek(TODAY, -1)).toBe('2026-11-05');
    });

    it('keeps the strip when a picked day is on it, else starts there', () => {
        expect(anchorFor(TODAY, '2026-11-20')).toBe(TODAY);
        expect(anchorFor(TODAY, '2026-12-24')).toBe('2026-12-24');
        expect(anchorFor(TODAY, '2026-11-01')).toBe('2026-11-01');
    });

    it('finds the neighbour day, null past either end', () => {
        const dates = boardDates(TODAY, 3);
        expect(neighbourDate(dates, TODAY, 1)).toBe('2026-11-13');
        expect(neighbourDate(dates, TODAY, -1)).toBeNull();
        expect(neighbourDate(dates, '2026-11-14', 1)).toBeNull();
        expect(neighbourDate(dates, 'overdue', 1)).toBeNull();
    });
});

describe('calendar width', () => {
    const minBoard = minBoardWidth(260);

    it('needs room for the inbox and two day columns', () => {
        expect(minBoardWidth(0)).toBeLessThan(minBoard);
        expect(minBoard).toBeGreaterThanOrEqual(260 + 2 * 264);
    });

    it('clamps a stale stored width (1077) to the maximum', () => {
        expect(clampCalendarWidth(1077, 0, minBoard)).toBe(CALENDAR_MAX);
        expect(clampCalendarWidth(1077, 2400, minBoard)).toBe(CALENDAR_MAX);
    });

    it('never goes under the minimum', () => {
        expect(clampCalendarWidth(100, 2400, minBoard)).toBe(CALENDAR_MIN);
    });

    it('leaves the board its two columns', () => {
        const available = minBoard + 400;
        expect(clampCalendarWidth(580, available, minBoard)).toBe(400);
        expect(calendarMaxWidth(available, minBoard)).toBe(400);
    });

    it('falls back to a default for a width that is not a number', () => {
        expect(clampCalendarWidth(NaN, 2400, minBoard)).toBe(360);
    });

    it('becomes a drawer under 1180 px or when the board would be squeezed', () => {
        expect(calendarPlacement(1440, 1200, minBoard)).toBe('split');
        expect(calendarPlacement(1024, 1024, minBoard)).toBe('drawer');
        expect(calendarPlacement(1440, minBoard + 100, minBoard)).toBe(
            'drawer'
        );
        // Not measured yet (tests, first render): beside the board.
        expect(calendarPlacement(0, 0, minBoard)).toBe('split');
    });
});

describe('calendar start', () => {
    it('follows the selected day', () => {
        expect(calendarStart(TODAY, '2026-11-15', 1)).toBe('2026-11-15');
        expect(calendarStart(TODAY, '2026-11-20', 3)).toBe('2026-11-20');
    });

    it('stays when the selected day is already shown', () => {
        expect(calendarStart(TODAY, '2026-11-13', 3)).toBe(TODAY);
    });
});
