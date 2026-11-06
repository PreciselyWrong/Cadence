// Reads a Firefox bookmarks export (bookmarks.html) in the browser. Deterministic:
// the same file always gives the same list (docs/37-links.md).

export interface ImportedBookmark {
    url: string;
    title: string;
    tags: string[];
}

// The browser's own folders say nothing about the bookmarks inside them.
const BROWSER_FOLDERS = new Set([
    'bookmarks menu',
    'bookmarks toolbar',
    'other bookmarks',
    'mobile bookmarks',
    'menu des marque-pages',
    'barre personnelle',
    'autres marque-pages',
    'marque-pages sur mobile',
]);

const tagFromFolder = (folder: string): string | null => {
    const name = folder.trim();
    if (!name || BROWSER_FOLDERS.has(name.toLowerCase())) return null;
    // A tag name cannot hold what a folder name can.
    return name.replace(/[#/\\,]+/g, ' ').trim() || null;
};

export function parseBookmarks(html: string): ImportedBookmark[] {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const found = new Map<string, ImportedBookmark>();
    document.querySelectorAll('a[href]').forEach((anchor) => {
        const url = anchor.getAttribute('href') ?? '';
        if (!/^https?:\/\//i.test(url) || found.has(url)) return;
        const tags = (anchor.getAttribute('tags') ?? '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
        const folder = anchor
            .closest('dl')
            ?.parentElement?.querySelector(':scope > h3')?.textContent;
        const fromFolder = folder ? tagFromFolder(folder) : null;
        if (fromFolder && !tags.includes(fromFolder)) tags.push(fromFolder);
        found.set(url, {
            url,
            title: anchor.textContent?.trim() ?? '',
            tags,
        });
    });
    return [...found.values()];
}

export const IMPORT_BATCH = 200;

export function inBatches<T>(items: T[], size = IMPORT_BATCH): T[][] {
    const batches: T[][] = [];
    for (let start = 0; start < items.length; start += size) {
        batches.push(items.slice(start, start + size));
    }
    return batches;
}
