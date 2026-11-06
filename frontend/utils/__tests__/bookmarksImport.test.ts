import { inBatches, parseBookmarks } from '../bookmarksImport';

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

describe('parseBookmarks', () => {
    const bookmarks = parseBookmarks(EXPORT);

    it('keeps http(s) pages once, with their title', () => {
        expect(bookmarks.map((b) => [b.url, b.title])).toEqual([
            ['https://example.com/a', 'Page A'],
            ['https://example.com/b', 'Page B'],
        ]);
    });

    it("keeps the tags, and the folder as a tag unless it is the browser's own", () => {
        expect(bookmarks[0].tags).toEqual(['dev', 'lecture']);
        expect(bookmarks[1].tags).toEqual(['Outils IA']);
    });
});

describe('inBatches', () => {
    it('cuts a list by size', () => {
        expect(inBatches([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    });
});
