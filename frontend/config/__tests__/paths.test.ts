import { getLocalesPath, LOCALES_VERSION } from '../paths';

describe('getLocalesPath', () => {
    // Translations used to be cached for a year under a fixed name: a new
    // version in the address makes browsers drop those old copies.
    it('puts the translations version in the address', () => {
        expect(getLocalesPath('fr/translation.json')).toBe(
            `/locales/fr/translation.json?v=${LOCALES_VERSION}`
        );
        expect(getLocalesPath('/locales/en/quotes.json')).toBe(
            `/locales/en/quotes.json?v=${LOCALES_VERSION}`
        );
    });

    it('is past the version browsers cached for a year', () => {
        expect(Number(LOCALES_VERSION)).toBeGreaterThan(2);
    });
});
