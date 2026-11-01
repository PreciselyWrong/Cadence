export interface TextSegment {
    text: string;
    match: boolean;
}

const escapeRegExp = (text: string): string =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Splits text into runs, marking every case-insensitive occurrence of any
// word of the query. Words are matched longest first so that a longer word
// is not cut by a shorter one inside it.
export const highlightMatches = (
    text: string,
    query: string
): TextSegment[] => {
    const words = [...new Set(query.trim().split(/\s+/).filter(Boolean))]
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp);
    if (words.length === 0 || text === '') {
        return [{ text, match: false }];
    }

    const pattern = new RegExp(`(${words.join('|')})`, 'gi');
    const segments: TextSegment[] = [];
    let cursor = 0;
    for (const found of text.matchAll(pattern)) {
        const start = found.index ?? 0;
        if (start > cursor) {
            segments.push({ text: text.slice(cursor, start), match: false });
        }
        segments.push({ text: found[0], match: true });
        cursor = start + found[0].length;
    }
    if (cursor < text.length) {
        segments.push({ text: text.slice(cursor), match: false });
    }
    return segments.length > 0 ? segments : [{ text, match: false }];
};
