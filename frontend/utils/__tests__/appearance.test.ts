import {
    accentScale,
    applyAppearance,
    contrastRatio,
    deriveAccentRoles,
    hexToRgb,
    rgbToHex,
} from '../appearance';

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

    it('uses the seed as primary in light and keeps text readable on it', () => {
        for (const hex of ['#1E6FD9', '#00897B', '#C77700', '#E0483B']) {
            const seed = hexToRgb(hex);
            const roles = deriveAccentRoles(seed, false);
            expect(roles.primary).toBe(seed);
            expect(
                contrastRatio(roles.primary, roles.onPrimary)
            ).toBeGreaterThan(3);
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
        applyAppearance('#00897B', false);
        const style = document.documentElement.style;
        expect(style.getPropertyValue('--color-primary')).toBe('0 137 123');
        expect(style.getPropertyValue('--blue-500')).toBe('0 137 123');
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
