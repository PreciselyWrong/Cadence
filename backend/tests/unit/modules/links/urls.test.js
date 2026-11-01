const {
    extractUrls,
    normalizeUrl,
    residualText,
    domainOf,
    classifyKind,
} = require('../../../../modules/links/core/urls');

describe('links/core/urls', () => {
    describe('extractUrls', () => {
        it('finds http(s) links and trims sentence punctuation', () => {
            expect(
                extractUrls(
                    'See https://example.com/a. And (http://foo.org/b) too!'
                )
            ).toEqual(['https://example.com/a', 'http://foo.org/b']);
        });

        it('keeps balanced parentheses and drops a markdown closer', () => {
            expect(
                extractUrls('[x](https://en.wikipedia.org/wiki/Foo_(bar)) end')
            ).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
        });

        it('ignores hosts without a dot, other schemes and duplicates', () => {
            expect(
                extractUrls(
                    'http://localhost/x ftp://a.b/c https://a.io https://a.io'
                )
            ).toEqual(['https://a.io']);
        });

        it('returns nothing for empty text', () => {
            expect(extractUrls(null)).toEqual([]);
            expect(extractUrls('no link here')).toEqual([]);
        });
    });

    describe('normalizeUrl', () => {
        it('lowercases the host, drops the fragment and tracking params', () => {
            expect(
                normalizeUrl(
                    'HTTPS://GitHub.com/Owner/Repo/?utm_source=x&b=2&fbclid=z#readme'
                )
            ).toBe('https://github.com/Owner/Repo?b=2');
        });

        it('keeps the root slash and strips a default port', () => {
            expect(normalizeUrl('https://example.com:443')).toBe(
                'https://example.com/'
            );
            expect(normalizeUrl('http://example.com:80/a/')).toBe(
                'http://example.com/a'
            );
        });

        it('returns null for a non-http url', () => {
            expect(normalizeUrl('javascript:alert(1)')).toBeNull();
            expect(normalizeUrl('not a url')).toBeNull();
        });
    });

    describe('residualText', () => {
        it('is the text around the link, trimmed', () => {
            expect(
                residualText(
                    'https://a.io/x  - good for invoices',
                    'https://a.io/x'
                )
            ).toBe('good for invoices');
        });

        it('is empty when the text is only the link', () => {
            expect(residualText(' https://a.io ', 'https://a.io')).toBe('');
        });
    });

    describe('domainOf', () => {
        it('drops www.', () => {
            expect(domainOf('https://www.Example.com/x')).toBe('example.com');
        });
    });

    describe('classifyKind', () => {
        it('recognizes code hosting repositories', () => {
            expect(classifyKind('https://github.com/a/b')).toBe('repo');
            expect(classifyKind('https://gitlab.com/a/b/-/tree/main')).toBe(
                'repo'
            );
            expect(classifyKind('https://codeberg.org/a/b')).toBe('repo');
            expect(classifyKind('https://github.com/features')).toBe('other');
        });

        it('recognizes videos by host or og:type', () => {
            expect(classifyKind('https://youtu.be/abcdefghijk')).toBe('video');
            expect(classifyKind('https://www.youtube.com/watch?v=x')).toBe(
                'video'
            );
            expect(classifyKind('https://x.io/v', 'video.other')).toBe('video');
        });

        it('recognizes articles by og:type or blog hosts', () => {
            expect(classifyKind('https://x.io/post', 'article')).toBe(
                'article'
            );
            expect(classifyKind('https://someone.substack.com/p/x')).toBe(
                'article'
            );
            expect(classifyKind('https://medium.com/@a/b')).toBe('article');
        });

        it('treats a site home page as a tool', () => {
            expect(classifyKind('https://excalidraw.com/')).toBe('tool');
            expect(classifyKind('https://x.io/docs/page')).toBe('other');
        });
    });
});
