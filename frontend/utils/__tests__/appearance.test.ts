import {
    accentScale,
    applyAppearance,
    contrastRatio,
    deriveAccentRoles,
    hexToRgb,
    rgbToHex,
} from '../appearance';

/** Free colour of the hue picker: saturation 0.7, lightness 0.5 (Android hueToArgb). */
function hslSeed(hue: number): number {
    const c = (1 - Math.abs(2 * 0.5 - 1)) * 0.7;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = 0.5 - c / 2;
    const [r, g, b] =
        hue < 60
            ? [c, x, 0]
            : hue < 120
              ? [x, c, 0]
              : hue < 180
                ? [0, c, x]
                : hue < 240
                  ? [0, x, c]
                  : hue < 300
                    ? [x, 0, c]
                    : [c, 0, x];
    const ch = (v: number) => Math.round((v + m) * 255);
    return (ch(r) << 16) | (ch(g) << 8) | ch(b);
}

describe('deriveAccentRoles (Android Accent.kt parity)', () => {
    it('keeps the exact violet roles in light and dark', () => {
        const light = deriveAccentRoles(hexToRgb('#5E5CE6'), false);
        expect(rgbToHex(light.primary)).toBe('#5E5CE6');
        expect(rgbToHex(light.primaryContainer)).toBe('#E4E3FF');
        expect(rgbToHex(light.onPrimaryContainer)).toBe('#16136B');
        const dark = deriveAccentRoles(hexToRgb('#5E5CE6'), true);
        expect(rgbToHex(dark.primary)).toBe('#A9A6FF');
        expect(rgbToHex(dark.onPrimary)).toBe('#1B1680');
    });

    it('keeps a readable seed and darkens a light one to 4.5:1 on cards', () => {
        expect(deriveAccentRoles(hexToRgb('#2E7D32'), false).primary).toBe(
            hexToRgb('#2E7D32')
        );
        for (const hex of ['#1E6FD9', '#00897B', '#C77700', '#E0483B']) {
            const roles = deriveAccentRoles(hexToRgb(hex), false);
            expect(
                contrastRatio(roles.primary, 0xf3f1fc)
            ).toBeGreaterThanOrEqual(4.5);
            expect(
                contrastRatio(roles.primary, roles.onPrimary)
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('keeps every on-role at 4.5:1 for any free colour', () => {
        for (let hue = 0; hue < 360; hue += 15) {
            for (const dark of [false, true]) {
                const seed = hexToRgb(rgbToHex(hslSeed(hue)));
                const roles = deriveAccentRoles(seed, dark);
                expect(
                    contrastRatio(roles.primary, roles.onPrimary)
                ).toBeGreaterThanOrEqual(4.5);
                expect(
                    contrastRatio(
                        roles.primaryContainer,
                        roles.onPrimaryContainer
                    )
                ).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it('lightens the primary in dark mode', () => {
        const seed = hexToRgb('#00897B');
        const light = deriveAccentRoles(seed, false);
        const dark = deriveAccentRoles(seed, true);
        expect(contrastRatio(dark.primary, 0x121218)).toBeGreaterThan(
            contrastRatio(light.primary, 0x121218)
        );
    });
});

describe('applyAppearance', () => {
    beforeEach(() => {
        document.documentElement.removeAttribute('style');
        document.documentElement.className = '';
    });

    it('writes the accent roles and the blue scale as CSS variables', () => {
        applyAppearance('#2E7D32', false);
        const style = document.documentElement.style;
        expect(style.getPropertyValue('--color-primary')).toBe('46 125 50');
        expect(style.getPropertyValue('--blue-500')).toBe('46 125 50');
        expect(style.getPropertyValue('--blue-600')).not.toBe('');
    });

    it('toggles pure black and falls back to violet on a bad colour', () => {
        applyAppearance('not-a-colour', true);
        expect(document.documentElement.classList.contains('pure-black')).toBe(
            true
        );
        expect(
            document.documentElement.style.getPropertyValue('--color-primary')
        ).toBe('94 92 230');
    });

    it('builds a scale whose steps darken from 500 to 950', () => {
        const scale = accentScale(hexToRgb('#5E5CE6'));
        expect(scale[500]).toBe(hexToRgb('#5E5CE6'));
        expect(contrastRatio(scale[950], 0xffffff)).toBeGreaterThan(
            contrastRatio(scale[600], 0xffffff)
        );
    });
});
