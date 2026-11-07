import { domainOf, linkTaskDraft, wordsAround } from '../linkTriage';

describe('linkTaskDraft', () => {
    const url = 'https://www.example.com/post';

    it('names the task after the page title, the note keeps address and words', () => {
        expect(
            linkTaskDraft({ url, title: ' A post ', text: 'for the café' })
        ).toEqual({
            name: 'A post',
            note: 'https://www.example.com/post\n\nfor the café',
        });
    });

    it('falls back to the words around the address, not repeated in the note', () => {
        expect(
            linkTaskDraft({ url, title: null, text: 'for the café' })
        ).toEqual({
            name: 'for the café',
            note: 'https://www.example.com/post',
        });
    });

    it('falls back to the site without www', () => {
        expect(linkTaskDraft({ url, title: '', text: '  ' })).toEqual({
            name: 'example.com',
            note: 'https://www.example.com/post',
        });
    });
});

describe('link helpers', () => {
    it('reads the site of an address', () => {
        expect(domainOf('https://www.a.io/x')).toBe('a.io');
        expect(domainOf('not an address')).toBe('');
    });

    it('keeps the words written around the first address', () => {
        expect(
            wordsAround('read later https://a.io/x.', 'https://a.io/x')
        ).toBe('read later.');
        expect(wordsAround('https://a.io/x.', 'https://a.io/x')).toBe('');
    });
});
