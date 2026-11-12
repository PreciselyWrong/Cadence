import { bookmarkFolders, inBatches } from '../bookmarksImport';

const EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Toolbar</H3>
    <DL><p>
        <DT><A HREF="https://example.com/a" ADD_DATE="1" TAGS="dev,lecture">Page A</A>
        <DT><H3>Outils/IA</H3>
        <DL><p>
            <DT><A HREF="https://example.com/b">Page B</A>
            <DT><A HREF="https://example.com/a">Encore A</A>
        </DL><p>
    </DL><p>
    <DT><A HREF="place:sort=8">Requête Firefox</A>
    <DT><A HREF="javascript:alert(1)">Marklet</A>
</DL>`;

// A folder of bookmarks becomes the pages of a project (docs/37-links.md).
describe('bookmarkFolders', () => {
    const folders = bookmarkFolders(EXPORT);

    it('groups the http(s) pages by their folder, once each, the browser folders by name too', () => {
        expect(
            folders.map((f) => [f.name, f.bookmarks.map((b) => b.url)])
        ).toEqual([
            ['Bookmarks Toolbar', ['https://example.com/a']],
            ['Outils/IA', ['https://example.com/b']],
        ]);
        expect(folders[1].bookmarks[0].title).toBe('Page B');
    });

    it('gives nothing for a file without bookmarks', () => {
        expect(bookmarkFolders('<html></html>')).toEqual([]);
    });
});

describe('inBatches', () => {
    it('cuts a list by size', () => {
        expect(inBatches([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    });
});
