import { isDesktopApp, isReloadShortcut } from '../desktopApp';

describe('isDesktopApp', () => {
    it('recognises the desktop client by its user agent marker', () => {
        expect(
            isDesktopApp(
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) CadenceDesktop/0.1.0'
            )
        ).toBe(true);
    });

    it('is false in a regular browser', () => {
        expect(
            isDesktopApp(
                'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'
            )
        ).toBe(false);
        expect(isDesktopApp('')).toBe(false);
    });
});

describe('isReloadShortcut', () => {
    const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

    it('matches F5, Ctrl+R and Ctrl+Shift+R', () => {
        expect(isReloadShortcut(key({ key: 'F5' }))).toBe(true);
        expect(isReloadShortcut(key({ key: 'r', ctrlKey: true }))).toBe(true);
        expect(
            isReloadShortcut(key({ key: 'R', ctrlKey: true, shiftKey: true }))
        ).toBe(true);
    });

    it('ignores a plain r and Ctrl+Alt+R', () => {
        expect(isReloadShortcut(key({ key: 'r' }))).toBe(false);
        expect(
            isReloadShortcut(key({ key: 'r', ctrlKey: true, altKey: true }))
        ).toBe(false);
    });
});
