// Google Calendar stores descriptions as HTML (<p>, <br>, lists). Cadence shows
// and edits them as plain text: paragraphs become blank-line breaks, line
// breaks and list items their own lines. Parsed by DOMParser, which runs no
// script and loads nothing, and only the text is kept.
const HTML_TAG = /<\/?(p|br|div|span|b|i|u|a|ul|ol|li|h[1-6])\b[^>]*>/i;

const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

const walk = (node: Node, out: string[]): void => {
    if (node.nodeType === Node.TEXT_NODE) {
        out.push((node.textContent ?? '').replace(/\s*\n\s*/g, ' '));
        return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === 'BR') {
        out.push('\n');
        return;
    }
    node.childNodes.forEach((child) => walk(child, out));
    if (BLOCKS.has(node.tagName)) out.push('\n\n');
    else if (node.tagName === 'LI') out.push('\n');
};

export const eventDescriptionText = (
    raw: string | null | undefined
): string => {
    const text = raw ?? '';
    if (!HTML_TAG.test(text)) return text.trim();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const out: string[] = [];
    walk(doc.body, out);
    return out
        .join('')
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};
