import fs from 'fs';
import path from 'path';

const localesDir = path.join(__dirname, '../../public/locales');

const serveLocaleFile = (url: string) => {
    const match = url.match(/locales\/([^/?]+)\/translation\.json/);
    const file = match
        ? path.join(localesDir, match[1], 'translation.json')
        : '';
    if (!file || !fs.existsSync(file)) {
        return {
            ok: false,
            status: 404,
            text: async () => 'not found',
            json: async () => {
                throw new SyntaxError('Unexpected token n');
            },
        };
    }
    const body = fs.readFileSync(file, 'utf8');
    return {
        ok: true,
        status: 200,
        text: async () => body,
        json: async () => JSON.parse(body),
    };
};

const setBrowserLocale = (locale: string) => {
    Object.defineProperty(window.navigator, 'language', {
        configurable: true,
        value: locale,
    });
    Object.defineProperty(window.navigator, 'languages', {
        configurable: true,
        value: [locale],
    });
};

const waitForTranslation = async (
    i18n: { t: (key: string) => unknown },
    key: string
) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const value = i18n.t(key);
        if (value !== key) {
            return value;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return i18n.t(key);
};

describe('i18n regional browser locales', () => {
    let requestedUrls: string[];

    beforeEach(() => {
        jest.resetModules();
        localStorage.clear();
        document.cookie = 'i18next=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        requestedUrls = [];
        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            requestedUrls.push(url);
            return serveLocaleFile(url);
        }) as unknown as typeof fetch;
    });

    const loadI18nFor = async (locale: string) => {
        setBrowserLocale(locale);
        let i18n!: typeof import('../i18n').default;
        await jest.isolateModulesAsync(async () => {
            i18n = (await import('../i18n')).default;
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        return i18n;
    };

    it.each(['en-US', 'fr-CH', 'de-AT', 'pt-BR'])(
        'resolves the base language file for navigator locale %s',
        async (locale) => {
            const i18n = await loadI18nFor(locale);

            const translated = await waitForTranslation(
                i18n,
                'sidebar.projects'
            );

            expect(translated).not.toBe('sidebar.projects');
            expect(
                requestedUrls.filter((url) => /-[A-Z]{2}\//.test(url))
            ).toEqual([]);
        }
    );

    it('resolves the base language file when en-US is already stored', async () => {
        localStorage.setItem('i18nextLng', 'en-US');

        const i18n = await loadI18nFor('en-US');

        const translated = await waitForTranslation(i18n, 'sidebar.projects');

        expect(translated).not.toBe('sidebar.projects');
        expect(requestedUrls.filter((url) => /-[A-Z]{2}\//.test(url))).toEqual(
            []
        );
    });
});
