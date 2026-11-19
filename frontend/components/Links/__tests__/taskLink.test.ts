import { linkTitleOf, taskLinkOf } from '../taskLink';

// The page a task points at, for its row (docs/37-links.md, Rows).
describe('taskLinkOf', () => {
    it('takes the first address of the note and the words left around it', () => {
        expect(
            taskLinkOf({
                note: 'https://www.github.com/acme/rocket\n\nfor the build',
            })
        ).toEqual({
            url: 'https://www.github.com/acme/rocket',
            host: 'github.com',
            noteRest: 'for the build',
            iconInBadge: false,
            nameIsLink: false,
        });
    });

    it('knows when the origin badge already shows the site icon', () => {
        const link = taskLinkOf({
            note: 'https://github.com/acme/rocket',
            source: 'link',
            source_url: 'https://github.com/acme/rocket',
        });
        expect(link?.iconInBadge).toBe(true);
        expect(link?.noteRest).toBe('');
    });

    it('takes an address typed as the name when the note has none', () => {
        expect(
            taskLinkOf({
                name: 'https://github.com/thedotmack/claude-mem',
                note: '',
            })
        ).toEqual({
            url: 'https://github.com/thedotmack/claude-mem',
            host: 'github.com',
            noteRest: '',
            iconInBadge: false,
            nameIsLink: true,
        });
        expect(
            taskLinkOf({ name: 'Read https://example.org/a', note: null })
                ?.nameIsLink
        ).toBe(false);
    });

    it('titles a bare address by its page title, else its host and path', () => {
        const link = taskLinkOf({
            name: 'https://github.com/thedotmack/claude-mem',
        })!;
        expect(
            linkTitleOf('https://github.com/thedotmack/claude-mem', link, {
                title: 'claude-mem: memory for Claude',
            } as never)
        ).toBe('claude-mem: memory for Claude');
        expect(
            linkTitleOf('https://github.com/thedotmack/claude-mem', link, null)
        ).toBe('github.com/thedotmack/claude-mem');
        expect(linkTitleOf('Call the bank', null, null)).toBe('Call the bank');
    });

    it('is nothing for a note without an address', () => {
        expect(taskLinkOf({ note: 'call the bank' })).toBeNull();
        expect(taskLinkOf({ note: null })).toBeNull();
    });
});
