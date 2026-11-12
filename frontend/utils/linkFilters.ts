import { Link } from '../entities/Link';

export interface LinkTheme {
    // null for links without a tag.
    name: string | null;
    links: Link[];
}

// A theme is the first segment of a link's first tag ("dev/tools" is in "dev").
// Themes in alphabetical order, links without a tag last, each list in its order.
export function linksByTheme(links: Link[]): LinkTheme[] {
    const groups = new Map<string, Link[]>();
    const bare: Link[] = [];
    for (const link of links) {
        const first = link.tags.map((tag) => tag.name).sort()[0];
        if (!first) {
            bare.push(link);
            continue;
        }
        const theme = first.split('/')[0];
        groups.set(theme, [...(groups.get(theme) ?? []), link]);
    }
    const themes: LinkTheme[] = [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, items]) => ({ name, links: items }));
    return bare.length > 0 ? [...themes, { name: null, links: bare }] : themes;
}

export interface LinkFilter {
    query: string;
    tag: string | 'all';
    project: string | 'all';
    // Off: the links to see; on: only the archived ones.
    archived: boolean;
}

export const DEFAULT_LINK_FILTER: LinkFilter = {
    query: '',
    tag: 'all',
    project: 'all',
    archived: false,
};

const fold = (value: string): string =>
    value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const haystack = (link: Link): string =>
    fold(
        [
            link.title,
            link.description,
            link.url,
            link.note,
            link.readme_excerpt,
            link.site_name,
            link.project_name,
            ...link.tags.map((t) => t.name),
        ]
            .filter(Boolean)
            .join(' ')
    );

// Newest first, always.
export const filterLinks = (links: Link[], filter: LinkFilter): Link[] => {
    const words = fold(filter.query).split(/\s+/).filter(Boolean);
    const kept = links.filter((link) => {
        if ((link.status === 'dropped') !== filter.archived) return false;
        if (filter.project !== 'all' && link.project_uid !== filter.project) {
            return false;
        }
        if (
            filter.tag !== 'all' &&
            !link.tags.some((t) => t.name === filter.tag)
        ) {
            return false;
        }
        if (words.length === 0) return true;
        const text = haystack(link);
        return words.every((w) => text.includes(w));
    });
    return kept.sort((a, b) => b.created_at.localeCompare(a.created_at));
};

export const tagsOf = (links: Link[]): string[] =>
    [...new Set(links.flatMap((l) => l.tags.map((t) => t.name)))].sort((a, b) =>
        a.localeCompare(b)
    );

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

const comparable = (url: string): string => {
    try {
        const parsed = new URL(url);
        parsed.hash = '';
        const path = parsed.pathname.replace(/\/+$/, '') || '/';
        return `${parsed.hostname.toLowerCase()}${path}`;
    } catch {
        return url;
    }
};

// Whether a page is already among the saved links.
export const isKept = (links: Link[], url: string): boolean => {
    const key = comparable(url);
    return links.some((l) => comparable(l.url) === key);
};

// The saved link of an item (an inbox item, a task): the one taken from it,
// else the same page.
export const linkForItem = (
    links: Link[],
    itemUid: string | undefined,
    content: string,
    sourceType: Link['source_type'] = 'inbox_item'
): Link | null => {
    const url = firstUrl(content);
    if (!url) return null;
    const own = links.find(
        (l) => l.source_type === sourceType && l.source_uid === itemUid
    );
    if (own) return own;
    const key = comparable(url);
    return links.find((l) => comparable(l.url) === key) ?? null;
};

export const sourcePath = (link: Link): string | null => {
    if (!link.source_uid) return null;
    switch (link.source_type) {
        case 'task':
            return `/task/${link.source_uid}`;
        case 'note':
            return `/notes/${link.source_uid}`;
        // An inbox item kept in Links has left the inbox.
        default:
            return null;
    }
};
