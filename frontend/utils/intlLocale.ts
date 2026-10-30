// The app's own language codes are not all valid locales (jp, ua), so map
// them before handing them to Intl / toLocale*String. Kept free of the i18n
// instance so components can use it without loading it.
const INTL_LOCALE: Record<string, string> = { jp: 'ja', ua: 'uk' };

export const toIntlLocale = (language: string | undefined): string => {
    const code = language || 'en';
    return INTL_LOCALE[code] || code;
};
