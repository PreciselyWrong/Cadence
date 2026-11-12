import { isDesktopApp } from '../desktopApp';

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
