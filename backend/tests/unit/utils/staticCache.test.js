const { staticCacheControl } = require('../../../utils/staticCache');

describe('staticCacheControl', () => {
    it('lets hashed build assets be cached for good', () => {
        expect(staticCacheControl('/main.3f9a1c.js')).toBeNull();
        expect(staticCacheControl('/images/logo.png')).toBeNull();
    });

    it('revalidates the page shell', () => {
        expect(staticCacheControl('/index.html')).toBe('no-cache');
        expect(staticCacheControl('/sw.js')).toBe('no-cache');
        expect(staticCacheControl('/manifest.json')).toBe('no-cache');
    });

    // Their name never changes: cached for a year, a browser kept old
    // translations and showed every newer string in English.
    it('revalidates the translations, whose name never changes', () => {
        expect(staticCacheControl('/locales/fr/translation.json')).toBe(
            'no-cache'
        );
        expect(staticCacheControl('\\locales\\fr\\translation.json')).toBe(
            'no-cache'
        );
    });
});
