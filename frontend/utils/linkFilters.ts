import { Link, LinkKind, LinkStatus } from '../entities/Link';

export const LINK_KINDS: LinkKind[] = [
    'repo',
    'article',
    'video',
    'tool',
    'other',
];

// The card actions, in reading order, and the status each one sets.
export const LINK_ACTIONS: {
    status: LinkStatus;
    key: string;
    fallback: string;
}[] = [
    { status: 'tested', key: 'links.action.tested', fallback: 'Try' },
    { status: 'kept', key: 'links.action.kept', fallback: 'Keep' },
    { status: 'parked', key: 'links.action.parked', fallback: 'Later' },
    { status: 'dropped', key: 'links.action.dropped', fallback: 'Drop' },
];

export const LINK_STATUSES: LinkStatus[] = [
    'new',
    'tested',
    'kept',
    'parked',
    'dropped',
];

export interface LinkFilter {
    query: string;
    kind: LinkKind | 'all';
    // 'active' hides dropped links: the default view stays calm.
    status: LinkStatus | 'active' | 'all';
    tag: string | 'all';
    domain: string | 'all';
    sort: 'newest' | 'oldest';
}

export const DEFAULT_LINK_FILTER: LinkFilter = {
    query: '',
    kind: 'all',
    status: 'active',
    tag: 'all',
    domain: 'all',
    sort: 'newest',
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
            ...link.tags.map((t) => t.name),
        ]
            .filter(Boolean)
            .join(' ')
    );

export const filterLinks = (links: Link[], filter: LinkFilter): Link[] => {
    const words = fold(filter.query).split(/\s+/).filter(Boolean);
    const kept = links.filter((link) => {
        if (filter.kind !== 'all' && link.kind !== filter.kind) return false;
        if (filter.status === 'active' && link.status === 'dropped') {
            return false;
        }
        if (
            filter.status !== 'active' &&
            filter.status !== 'all' &&
            link.status !== filter.status
        ) {
            return false;
        }
        if (
            filter.tag !== 'all' &&
            !link.tags.some((t) => t.name === filter.tag)
        ) {
            return false;
        }
        if (filter.domain !== 'all' && link.domain !== filter.domain) {
            return false;
        }
        if (words.length === 0) return true;
        const text = haystack(link);
        return words.every((w) => text.includes(w));
    });
    const sign = filter.sort === 'oldest' ? 1 : -1;
    return kept.sort((a, b) => sign * a.created_at.localeCompare(b.created_at));
};

// Domains seen more than once first, then alphabetical: the filter offers
// the places the user actually saves from.
export const domainsOf = (links: Link[]): string[] => {
    const counts = new Map<string, number>();
    for (const link of links) {
        if (link.domain) {
            counts.set(link.domain, (counts.get(link.domain) ?? 0) + 1);
        }
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([domain]) => domain);
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

// The saved link of an inbox item: the one found in it, else the same page.
export const linkForItem = (
    links: Link[],
    itemUid: string | undefined,
    content: string
): Link | null => {
    const url = firstUrl(content);
    if (!url) return null;
    const own = links.find(
        (l) => l.source_type === 'inbox_item' && l.source_uid === itemUid
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
        case 'inbox_item':
            return '/inbox';
        default:
            return null;
    }
};
