'use strict';

const { cleanTheme } = require('../../../modules/links/themes');

describe('cleanTheme', () => {
    it('keeps a short theme, trimmed', () => {
        expect(cleanTheme('  Outils IA ')).toBe('Outils IA');
    });

    it('refuses what cannot be one simple tag', () => {
        expect(cleanTheme('')).toBeNull();
        expect(cleanTheme(undefined)).toBeNull();
        expect(cleanTheme('dev/outils')).toBeNull();
        expect(cleanTheme('x'.repeat(31))).toBeNull();
    });
});
