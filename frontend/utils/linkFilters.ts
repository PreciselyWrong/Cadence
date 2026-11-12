const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/i;

// The first link written in a text, without trailing sentence punctuation.
export const firstUrl = (text: string | null | undefined): string | null => {
    const match = (text ?? '').match(URL_PATTERN);
    if (!match) return null;
    let url = match[0];
    while (
        /[.,;:!?'"»…*_]$/.test(url) ||
        (url.endsWith(')') && url.split(')').length > url.split('(').length)
    ) {
        url = url.slice(0, -1);
    }
    return url;
};

// What was written around the link, the way the server seeds the note.
export const residualText = (text: string, url: string): string =>
    text
        .replace(url, ' ')
        .replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
