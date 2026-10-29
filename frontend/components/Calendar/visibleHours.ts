// The hours of the day the calendars draw: `start` is the first hour shown,
// `end` the hour the grid stops at (exclusive). Stored in
// ui_settings.calendar.visibleHours.
export interface VisibleHours {
    start: number;
    end: number;
}

export const WHOLE_DAY: VisibleHours = { start: 0, end: 24 };

// Reads a saved range; anything but whole hours with end after start falls
// back to the whole day.
export const readVisibleHours = (saved: unknown): VisibleHours => {
    const value = (saved && typeof saved === 'object' ? saved : {}) as Record<
        string,
        unknown
    >;
    const { start, end } = value;
    if (
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        (start as number) >= 0 &&
        (start as number) <= 23 &&
        (end as number) >= 1 &&
        (end as number) <= 24 &&
        (end as number) > (start as number)
    ) {
        return { start: start as number, end: end as number };
    }
    return WHOLE_DAY;
};
