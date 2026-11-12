import { firstUrl, residualText } from '../linkFilters';

describe('link text helpers', () => {
    it('finds the first url without trailing punctuation', () => {
        expect(firstUrl('see (https://a.io/x).')).toBe('https://a.io/x');
        expect(firstUrl('nothing')).toBeNull();
    });

    it('keeps the text written around the link', () => {
        expect(residualText('https://a.io - read later', 'https://a.io')).toBe(
            'read later'
        );
    });
});
