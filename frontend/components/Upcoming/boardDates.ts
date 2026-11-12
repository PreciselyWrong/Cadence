import { columnDates, shiftDay } from './planOps';

// Layout of the Plan board: a strip of fixed-width day columns that scrolls
// sideways, and a calendar beside it (or over it, as a drawer, when the
// window is too narrow for both).
export const BOARD_DAYS = 14;
export const DAY_COLUMN_WIDTH = 264;
export const COLUMN_GAP = 12;
export const INBOX_WIDTH = 260;
export const INBOX_COLLAPSED_WIDTH = 44;
// Left and right padding of the board pane (pl-5 pr-2) and of the strip (p-1).
const BOARD_PADDING = 36;
export const CALENDAR_MIN = 280;
export const CALENDAR_MAX = 600;
// Below this window width the calendar is a drawer over the board.
export const DRAWER_BELOW = 1180;

export const boardDates = (anchor: string, count = BOARD_DAYS): string[] =>
    columnDates(anchor, count);

export const shiftWeek = (date: string, weeks: number): string =>
    shiftDay(date, weeks * 7);

// The strip's first day after picking `picked`: the strip stays put when it
// already holds that day, otherwise it starts there.
export const anchorFor = (
    anchor: string,
    picked: string,
    count = BOARD_DAYS
): string => (boardDates(anchor, count).includes(picked) ? anchor : picked);

// The board's smallest width: the inbox (as shown) and two day columns.
export const minBoardWidth = (inboxWidth: number): number =>
    inboxWidth +
    (inboxWidth > 0 ? COLUMN_GAP : 0) +
    2 * DAY_COLUMN_WIDTH +
    COLUMN_GAP +
    BOARD_PADDING;

// Widest the calendar may be in `available` px (0: not measured yet).
export const calendarMaxWidth = (
    available: number,
    minBoard: number
): number =>
    available > 0
        ? Math.max(CALENDAR_MIN, Math.min(CALENDAR_MAX, available - minBoard))
        : CALENDAR_MAX;

/**
 * The calendar width actually used: within [CALENDAR_MIN, CALENDAR_MAX] and
 * leaving the board its minimum. A stored width can be stale (a wider window,
 * an older layout) or not a number at all.
 */
export const clampCalendarWidth = (
    width: number,
    available: number,
    minBoard: number
): number => {
    const max = calendarMaxWidth(available, minBoard);
    if (Number.isNaN(width)) return Math.min(max, 360);
    return Math.round(Math.max(CALENDAR_MIN, Math.min(max, width)));
};

// Split beside the board, or a drawer over it: the window is narrow, or the
// board would lose its two columns next to the narrowest calendar.
export const calendarPlacement = (
    viewport: number,
    available: number,
    minBoard: number
): 'split' | 'drawer' => {
    if (viewport > 0 && viewport < DRAWER_BELOW) return 'drawer';
    if (available > 0 && available - CALENDAR_MIN < minBoard) return 'drawer';
    return 'split';
};

// The calendar's first day once `selected` is picked: it stays when the day
// is already shown (a click on a card must not shift it), else starts there.
export const calendarStart = (
    current: string,
    selected: string,
    span: number
): string =>
    columnDates(current, span).includes(selected) ? current : selected;

// The day `step` columns away from `date` on the board, or null at an end.
export const neighbourDate = (
    dates: string[],
    date: string,
    step: number
): string | null => {
    const at = dates.indexOf(date);
    if (at === -1) return null;
    return dates[at + step] ?? null;
};
