import { pagesMarkdown } from '../projectPages';

describe('pagesMarkdown', () => {
    it('lists the pages as Markdown links, the note after a dash', () => {
        expect(
            pagesMarkdown([
                {
                    url: 'https://github.com/acme/rocket',
                    title: 'acme/rocket',
                    note: 'the engine',
                },
                { url: 'https://www.example.com/a', title: null, note: null },
                { url: 'https://example.com/b', title: 'A [b]', note: '' },
            ])
        ).toBe(
            [
                '- [acme/rocket](https://github.com/acme/rocket) — the engine',
                '- [example.com](https://www.example.com/a)',
                '- [A \\[b\\]](https://example.com/b)',
            ].join('\n')
        );
    });

    it('is empty without pages', () => {
        expect(pagesMarkdown([])).toBe('');
    });
});
