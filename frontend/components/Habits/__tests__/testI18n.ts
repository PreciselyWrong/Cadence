// A react-i18next stand-in for the habit screens: returns the English fallback
// with {{placeholders}} filled in, like i18next does without a translation file.
type Options = Record<string, unknown> & { defaultValue?: string };

export const translate = (
    key: string,
    second?: string | Options,
    third?: Options
): string => {
    const options: Options =
        (typeof second === 'object' ? second : third) ?? {};
    const template =
        (typeof second === 'string' ? second : options.defaultValue) ?? key;
    return template.replace(/{{\s*(\w+)\s*}}/g, (_, name) =>
        String(options[name] ?? '')
    );
};

export const mockI18n = {
    initReactI18next: { type: '3rdParty', init: jest.fn() },
    useTranslation: () => ({ t: translate, i18n: { language: 'en' } }),
};
