// Reads a Firefox bookmarks export (bookmarks.html) in the browser. Deterministic:
// the same file always gives the same folders. A folder becomes the pages of a
// project, chosen or new (docs/37-links.md, Project pages).

export interface ImportedBookmark {
    url: string;
    title: string;
}

export interface BookmarkFolder {
    name: string;
    bookmarks: ImportedBookmark[];
}

// The http(s) pages grouped by the folder they sit in, in file order; a page
// saved twice counts once, in its first folder.
export function bookmarkFolders(html: string): BookmarkFolder[] {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const seen = new Set<string>();
    const folders = new Map<string, ImportedBookmark[]>();
    document.querySelectorAll('a[href]').forEach((anchor) => {
        const url = anchor.getAttribute('href') ?? '';
        if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
        seen.add(url);
        const name =
            anchor
                .closest('dl')
                ?.parentElement?.querySelector(':scope > h3')
                ?.textContent?.trim() || 'Bookmarks';
        folders.set(name, [
            ...(folders.get(name) ?? []),
            { url, title: anchor.textContent?.trim() ?? '' },
        ]);
    });
    return [...folders.entries()].map(([name, bookmarks]) => ({
        name,
        bookmarks,
    }));
}

// The server takes at most 100 pages per call.
export const IMPORT_BATCH = 100;

export function inBatches<T>(items: T[], size = IMPORT_BATCH): T[][] {
    const batches: T[][] = [];
    for (let start = 0; start < items.length; start += size) {
        batches.push(items.slice(start, start + size));
    }
    return batches;
}
