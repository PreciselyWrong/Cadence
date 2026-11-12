import { todayCalendarPlacement } from '../calendarPlacement';
import { DRAWER_BELOW } from '../../Upcoming/boardDates';

describe('todayCalendarPlacement', () => {
    it('opens the calendar as a drawer on a 1024 px window', () => {
        expect(todayCalendarPlacement(1024, true)).toBe('drawer');
        expect(todayCalendarPlacement(DRAWER_BELOW - 1, true)).toBe('drawer');
    });

    it('puts it beside the list on a wide window', () => {
        expect(todayCalendarPlacement(DRAWER_BELOW, true)).toBe('split');
        expect(todayCalendarPlacement(1440, true)).toBe('split');
    });

    it('falls back to the drawer when both panes do not fit', () => {
        expect(todayCalendarPlacement(1440, false)).toBe('drawer');
    });

    it('keeps the split before the window is measured', () => {
        expect(todayCalendarPlacement(0, true)).toBe('split');
    });
});
