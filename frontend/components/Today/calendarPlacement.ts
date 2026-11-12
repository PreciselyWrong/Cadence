import { DRAWER_BELOW } from '../Upcoming/boardDates';

/**
 * Where Today's calendar goes on a desktop window, as on Plan: beside the
 * list, or as a drawer over it. Under DRAWER_BELOW the sidebar and the
 * calendar left the list about 260 px, truncating every title; `fits` is
 * false when the panes cannot both get their minimum width.
 */
export const todayCalendarPlacement = (
    viewport: number,
    fits: boolean
): 'split' | 'drawer' => {
    if (viewport > 0 && viewport < DRAWER_BELOW) return 'drawer';
    return fits ? 'split' : 'drawer';
};
