// The Linux desktop client (desktop/, Tauri) loads this UI with a user agent
// that carries `CadenceDesktop/<version>`. It shows native notifications
// itself, so the in-page notification bell is redundant there.
const DESKTOP_MARKER = 'CadenceDesktop/';

export const isDesktopApp = (
    userAgent: string = typeof navigator === 'undefined'
        ? ''
        : navigator.userAgent || ''
): boolean => userAgent.includes(DESKTOP_MARKER);
