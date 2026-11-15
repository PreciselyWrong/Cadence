// The Linux desktop client (desktop/, Tauri) loads this UI with a user agent
// that carries `CadenceDesktop/<version>`. It shows native notifications
// itself, so the in-page notification bell is redundant there.
const DESKTOP_MARKER = 'CadenceDesktop/';

export const isDesktopApp = (
    userAgent: string = typeof navigator === 'undefined'
        ? ''
        : navigator.userAgent || ''
): boolean => userAgent.includes(DESKTOP_MARKER);

// WebKitGTK gives the desktop client no reload key of its own, unlike a
// browser, so the page binds the usual ones.
export const isReloadShortcut = (event: KeyboardEvent): boolean =>
    event.key === 'F5' ||
    ((event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === 'r');

export const installDesktopReload = (): void => {
    if (!isDesktopApp()) return;
    window.addEventListener('keydown', (event) => {
        if (!isReloadShortcut(event)) return;
        event.preventDefault();
        window.location.reload();
    });
};
