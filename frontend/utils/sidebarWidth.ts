export const SIDEBAR_DEFAULT_REM = 22;
export const SIDEBAR_MIN_PERCENT = 90;
export const SIDEBAR_MAX_PERCENT = 110;
export const SIDEBAR_DEFAULT_PERCENT = 100;

export const clampSidebarPercent = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return SIDEBAR_DEFAULT_PERCENT;
    }
    return Math.min(
        SIDEBAR_MAX_PERCENT,
        Math.max(SIDEBAR_MIN_PERCENT, Math.round(value))
    );
};

export const sidebarPercentToRem = (percent: number): number =>
    (SIDEBAR_DEFAULT_REM * clampSidebarPercent(percent)) / 100;

export const sidebarPxToPercent = (px: number, rootFontSizePx: number) =>
    clampSidebarPercent((px / (SIDEBAR_DEFAULT_REM * rootFontSizePx)) * 100);

// Below `sm` the open sidebar is a drawer over the page; from `sm` it pushes
// the page (Layout's margin, Sidebar's width), so it stays open on navigation.
export const SIDEBAR_DRAWER_MAX_WIDTH = 640;

export const isSidebarDrawer = (): boolean =>
    window.innerWidth < SIDEBAR_DRAWER_MAX_WIDTH;
