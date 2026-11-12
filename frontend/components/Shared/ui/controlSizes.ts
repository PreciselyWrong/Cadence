// One height scale for every control of the design system, so a header
// button, a segmented switch, a chip and a field line up. Root font is 90%:
// h-8 is 29 px, h-10 is 36 px, h-11 is 40 px.
export type ControlSize = 'sm' | 'md' | 'lg';

export const CONTROL_HEIGHT: Record<ControlSize, string> = {
    // Page headers, toolbars, chips, segmented switches.
    sm: 'h-8',
    // Forms, dialogs, empty-state actions; the height of every field.
    md: 'h-10',
    // The one prominent action of a page or a sheet.
    lg: 'h-11',
};

/** The one height of text fields and selects: an md button. */
export const FIELD_HEIGHT = CONTROL_HEIGHT.md;

/** A text field or select of the design system. */
export const FIELD_CLASS = `${FIELD_HEIGHT} w-full min-w-0 rounded-lg bg-surface px-3 text-body-m text-surface-on ring-1 ring-inset ring-outline-variant placeholder:text-surface-on-variant focus:outline-none focus:ring-2 focus:ring-primary/50 max-sm:min-h-[44px]`;
