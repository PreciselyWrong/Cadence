// Pure ranking for the command palette: accent-insensitive fuzzy matching,
// every word of the query must match, recent items are lifted.

export type PaletteGroup =
    | 'recent'
    | 'task'
    | 'create'
    | 'go'
    | 'commands'
    | 'projects'
    | 'tasks'
    | 'notes'
    | 'habits';

export interface PaletteItem {
    id: string;
    title: string;
    subtitle?: string;
    group: PaletteGroup;
    keywords?: string[];
    // Key hint shown at the right of the row, e.g. ['G', 'T']
    shortcut?: string[];
    // Already matched by the server (search results): kept whatever the query
    prematched?: boolean;
    run: () => void;
}

export const normalizeText = (value: string): string =>
    value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const subsequenceScore = (query: string, text: string): number | null => {
    let at = -1;
    let gaps = 0;
    for (const char of query) {
        const next = text.indexOf(char, at + 1);
        if (next === -1) return null;
        if (at !== -1) gaps += next - at - 1;
        at = next;
    }
    return Math.max(1, 100 - gaps);
};

// How well one word matches a text, or null when it does not.
export const fuzzyScore = (query: string, text: string): number | null => {
    const q = normalizeText(query);
    const t = normalizeText(text);
    if (!q) return 0;
    if (t === q) return 1000;
    if (t.startsWith(q)) return 800;
    if (t.split(/[^a-z0-9]+/).some((word) => word.startsWith(q))) return 600;
    const index = t.indexOf(q);
    if (index !== -1) return Math.max(200, 400 - index);
    return subsequenceScore(q, t);
};

const KEYWORD_WEIGHT = 0.6;
const RECENT_BOOST = 50;
const PREMATCHED_SCORE = 50;

const scoreItem = (item: PaletteItem, tokens: string[]): number | null => {
    let total = 0;
    for (const token of tokens) {
        const title = fuzzyScore(token, item.title);
        let keyword: number | null = null;
        for (const word of item.keywords ?? []) {
            const score = fuzzyScore(token, word);
            if (score !== null && (keyword === null || score > keyword)) {
                keyword = score;
            }
        }
        const best = Math.max(
            title ?? -1,
            keyword === null ? -1 : keyword * KEYWORD_WEIGHT
        );
        if (best < 0) return null;
        total += best;
    }
    return total / tokens.length;
};

export const rankPaletteItems = (
    items: PaletteItem[],
    query: string,
    { recentIds = [] }: { recentIds?: string[] }
): PaletteItem[] => {
    const tokens = normalizeText(query).split(/\s+/).filter(Boolean);

    if (tokens.length === 0) {
        const recents = recentIds
            .map((id) => items.find((item) => item.id === id))
            .filter((item): item is PaletteItem => !!item);
        const rest = items.filter(
            (item) => !item.prematched && !recentIds.includes(item.id)
        );
        return [...recents, ...rest];
    }

    return items
        .map((item, index) => {
            const matched = scoreItem(item, tokens);
            if (matched === null && !item.prematched) return null;
            const base = matched ?? PREMATCHED_SCORE;
            const score =
                base + (recentIds.includes(item.id) ? RECENT_BOOST : 0);
            return { item, score, index };
        })
        .filter((entry): entry is NonNullable<typeof entry> => !!entry)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((entry) => entry.item);
};

const RECENTS_KEY = 'cadence:palette:recents';
const MAX_RECENTS = 8;

export const readRecentIds = (): string[] => {
    try {
        const raw = window.localStorage.getItem(RECENTS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed)
            ? parsed.filter((id): id is string => typeof id === 'string')
            : [];
    } catch {
        return [];
    }
};

export const pushRecentId = (id: string): string[] => {
    const next = [id, ...readRecentIds().filter((x) => x !== id)].slice(
        0,
        MAX_RECENTS
    );
    try {
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
        // Recents are a convenience; a blocked store just forgets them.
    }
    return next;
};
