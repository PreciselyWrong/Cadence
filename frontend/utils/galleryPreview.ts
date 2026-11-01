// Picture and text a gallery card shows for a note: the first image the
// note holds, and its words without the Markdown marks.

const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const HTML_IMAGE = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;

// Only web images and files served by this server: never `javascript:`,
// `data:` or a protocol-relative address pointing elsewhere.
const isSafeImageUrl = (url: string) =>
    /^https?:\/\//i.test(url) || (url.startsWith('/') && !url.startsWith('//'));

export const firstImageIn = (
    content: string | null | undefined
): string | null => {
    if (!content) return null;
    const found: { at: number; url: string }[] = [];
    for (const pattern of [MARKDOWN_IMAGE, HTML_IMAGE]) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content))) {
            if (isSafeImageUrl(match[1])) {
                found.push({ at: match.index, url: match[1] });
                break;
            }
        }
    }
    found.sort((a, b) => a.at - b.at);
    return found[0]?.url ?? null;
};

export const plainExcerpt = (
    content: string | null | undefined,
    limit = 200
): string => {
    if (!content) return '';
    const text = content
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(MARKDOWN_IMAGE, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
        .replace(/[*_~`]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, limit).replace(/\s+\S*$/, '')}…`;
};
