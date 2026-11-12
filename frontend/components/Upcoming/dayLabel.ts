// Day names read as titles next to "Today" and "Tomorrow": French and other
// locales write weekdays in lower case ("samedi"), so the first letter is
// raised with the locale's own rules.
export const capitalizeFirst = (text: string, locale?: string): string => {
    const first = text.codePointAt(0);
    if (first === undefined) return text;
    const head = String.fromCodePoint(first);
    return head.toLocaleUpperCase(locale) + text.slice(head.length);
};

/** The weekday's long name, as a title ("Samedi", "Saturday"). */
export const weekdayTitle = (date: Date, locale: string): string =>
    capitalizeFirst(
        new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date),
        locale
    );
