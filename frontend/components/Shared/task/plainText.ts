// A note or description as one line of plain text for a preview: Markdown
// marks, links, wiki links, mentions, checkboxes and HTML tags are dropped,
// their visible text kept. Pure, so cards and rows share one rule.
const stripLine = (line: string): string =>
    line
        // Images go entirely; links keep their text.
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/@\[([^\]]+)\]\([^)]*\)/g, '@$1')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[\[(?:\w+:)?([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) =>
            (b ?? a).trim()
        )
        .replace(/<[^>]+>/g, '')
        // Headings, quotes, list bullets and numbers, task checkboxes.
        .replace(/^\s*(?:#{1,6}\s+|>\s*)+/, '')
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
        .replace(/^\s*\[[ xX]\]\s+/, '')
        // Emphasis, strike and code marks.
        .replace(/(\*\*|__|~~|\*|_|`)/g, '')
        .replace(/\s+/g, ' ')
        .trim();

export const plainPreview = (text: string | null | undefined): string => {
    if (!text) return '';
    for (const line of text.split('\n')) {
        if (/^\s*(```|---+\s*$|\|)/.test(line)) continue;
        const plain = stripLine(line);
        if (plain) return plain;
    }
    return '';
};
