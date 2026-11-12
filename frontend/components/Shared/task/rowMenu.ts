// The one rule for a task row's or card's "⋯" menu (Today's): never needed
// on hover. It shows on the selected row (its task is open), while the menu
// is open, and when the row or a control in it has keyboard focus; a right
// click opens it on any row. The row carries the `group/row` class.
export const ROW_GROUP = 'group/row';

export const rowMenuClass = (shown: boolean): string =>
    shown
        ? ''
        : 'invisible group-focus-visible/row:visible group-has-[:focus-visible]/row:visible';
