export interface ContactMatch {
    kind: 'tel' | 'mailto';
    text: string;
    href: string;
    start: number;
    end: number;
}

// A phone number is either international (+ then 8 to 15 digits) or a
// national number starting with 0 (10 digits, as in Swiss and French
// formats). Separators are spaces, dots, dashes and parentheses. Dates
// (2026-11-01, 01.11.2026) and times (14:30) never match: they hold too few
// digits or a colon.
const PHONE =
    /(?<![\w+])(\+\d[\d ().-]{6,}\d|0\d[\d ().-]{7,}\d)(?![\w])/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

const phoneHref = (candidate: string): string | null => {
    const digits = candidate.replace(/\D/g, '');
    const international = candidate.startsWith('+');
    const valid = international
        ? digits.length >= 9 && digits.length <= 15
        : digits.length === 10;
    if (!valid) return null;
    return `tel:${international ? '+' : ''}${digits}`;
};

export const findContactLinks = (text: string): ContactMatch[] => {
    const matches: ContactMatch[] = [];

    for (const m of text.matchAll(PHONE)) {
        const href = phoneHref(m[1]);
        if (!href) continue;
        matches.push({
            kind: 'tel',
            text: m[1],
            href,
            start: m.index ?? 0,
            end: (m.index ?? 0) + m[1].length,
        });
    }

    for (const m of text.matchAll(EMAIL)) {
        const start = m.index ?? 0;
        matches.push({
            kind: 'mailto',
            text: m[0],
            href: `mailto:${m[0]}`,
            start,
            end: start + m[0].length,
        });
    }

    return matches.sort((a, b) => a.start - b.start);
};

interface MdNode {
    type: string;
    value?: string;
    url?: string;
    children?: MdNode[];
}

const splitTextNode = (node: MdNode): MdNode[] => {
    const value = node.value ?? '';
    const matches = findContactLinks(value);
    if (matches.length === 0) return [node];

    const out: MdNode[] = [];
    let cursor = 0;
    for (const m of matches) {
        if (m.start > cursor) {
            out.push({ type: 'text', value: value.slice(cursor, m.start) });
        }
        out.push({
            type: 'link',
            url: m.href,
            children: [{ type: 'text', value: m.text }],
        });
        cursor = m.end;
    }
    if (cursor < value.length) {
        out.push({ type: 'text', value: value.slice(cursor) });
    }
    return out;
};

// Turns phone numbers and email addresses in text into tel: and mailto:
// links. Text already inside a link, and code, are left as they are.
export const remarkContactLinks = () => (tree: MdNode) => {
    const visit = (node: MdNode) => {
        if (!node.children || node.type === 'link') return;
        node.children = node.children.flatMap((child) => {
            if (child.type === 'text') return splitTextNode(child);
            visit(child);
            return [child];
        });
    };
    visit(tree);
};

// react-markdown's default transform drops tel: URLs, so contact links
// would lose their href. Same rule otherwise: relative URLs and the usual
// web, mail and chat schemes pass, anything else is blanked. This is a
// local copy because react-markdown is ESM-only and Jest cannot load it.
const SAFE_SCHEME = /^(?:https?|ircs?|mailto|xmpp|tel):/i;
export const contactUrlTransform = (url: string): string => {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
    return SAFE_SCHEME.test(url) ? url : '';
};
