import { taskLinkOf } from '../taskLink';

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

    it('is nothing for a note without an address', () => {
        expect(taskLinkOf({ note: 'call the bank' })).toBeNull();
        expect(taskLinkOf({ note: null })).toBeNull();
    });
});
