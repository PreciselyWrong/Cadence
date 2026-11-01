import { highlightMatches } from '../highlightMatches';

describe('highlightMatches', () => {
    it('splits the text around each match, marking the matches', () => {
        expect(highlightMatches('Marathon plan', 'plan')).toEqual([
            { text: 'Marathon ', match: false },
            { text: 'plan', match: true },
        ]);
    });

    it('matches regardless of case and keeps the text as written', () => {
        expect(highlightMatches('Run a MARATHON', 'marathon')).toEqual([
            { text: 'Run a ', match: false },
            { text: 'MARATHON', match: true },
        ]);
    });

    it('marks every occurrence', () => {
        expect(highlightMatches('ab ab', 'ab').filter((s) => s.match)).toHaveLength(2);
    });

    it('marks each word of a multi-word query', () => {
        expect(highlightMatches('Call the dentist', 'dentist call')).toEqual([
            { text: 'Call', match: true },
            { text: ' the ', match: false },
            { text: 'dentist', match: true },
        ]);
    });

    it('treats regex characters in the query as plain text', () => {
        expect(highlightMatches('cost (USD) 5.00', '(usd)')).toEqual([
            { text: 'cost ', match: false },
            { text: '(USD)', match: true },
            { text: ' 5.00', match: false },
        ]);
    });

    it('returns the whole text unmarked for an empty or absent query', () => {
        expect(highlightMatches('Plan', '   ')).toEqual([
            { text: 'Plan', match: false },
        ]);
    });

    it('returns the whole text unmarked when nothing matches', () => {
        expect(highlightMatches('Plan', 'zzz')).toEqual([
            { text: 'Plan', match: false },
        ]);
    });
});
