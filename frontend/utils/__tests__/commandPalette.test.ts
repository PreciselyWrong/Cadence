import {
    normalizeText,
    fuzzyScore,
    rankPaletteItems,
    PaletteItem,
} from '../commandPalette';

const item = (
    id: string,
    title: string,
    extra: Partial<PaletteItem> = {}
): PaletteItem => ({
    id,
    title,
    group: 'commands',
    run: () => undefined,
    ...extra,
});

describe('normalizeText', () => {
    it('lowercases and strips accents', () => {
        expect(normalizeText('Échéance À venir')).toBe('echeance a venir');
    });
});

describe('fuzzyScore', () => {
    it('returns null when the query is not found', () => {
        expect(fuzzyScore('zzz', 'Go to Inbox')).toBeNull();
    });

    it('ranks exact > prefix > word start > substring > subsequence', () => {
        const exact = fuzzyScore('inbox', 'Inbox') as number;
        const prefix = fuzzyScore('inb', 'Inbox') as number;
        const word = fuzzyScore('inb', 'Go to Inbox') as number;
        const substring = fuzzyScore('box', 'Inbox') as number;
        const subsequence = fuzzyScore('ibx', 'Inbox') as number;
        expect(exact).toBeGreaterThan(prefix);
        expect(prefix).toBeGreaterThan(word);
        expect(word).toBeGreaterThan(substring);
        expect(substring).toBeGreaterThan(subsequence);
        expect(subsequence).toBeGreaterThan(0);
    });

    it('ignores accents on both sides', () => {
        expect(fuzzyScore('echeance', 'Échéance')).not.toBeNull();
        expect(fuzzyScore('échéance', 'echeance')).not.toBeNull();
    });
});

describe('rankPaletteItems', () => {
    const items = [
        item('inbox', 'Go to Inbox'),
        item('new-task', 'Create task', { keywords: ['add', 'new'] }),
        item('theme', 'Toggle dark mode', { keywords: ['theme'] }),
        item('today', 'Go to Today'),
    ];

    it('keeps only matches, best first', () => {
        const ids = rankPaletteItems(items, 'to', {}).map((i) => i.id);
        expect(ids).not.toContain('new-task');
        expect(ids[0]).toBe('theme');
        expect(ids).toContain('today');
    });

    it('requires every word of the query to match', () => {
        const ids = rankPaletteItems(items, 'go inbox', {}).map((i) => i.id);
        expect(ids).toEqual(['inbox']);
    });

    it('matches keywords with a lower weight than the title', () => {
        expect(rankPaletteItems(items, 'add', {}).map((i) => i.id)).toEqual([
            'new-task',
        ]);
        const both = [
            item('a', 'Theme settings'),
            item('b', 'Toggle dark mode', { keywords: ['theme'] }),
        ];
        expect(rankPaletteItems(both, 'theme', {}).map((i) => i.id)).toEqual([
            'a',
            'b',
        ]);
    });

    it('with an empty query lists recent items first, then the rest in order', () => {
        const ids = rankPaletteItems(items, '', {
            recentIds: ['theme', 'inbox'],
        }).map((i) => i.id);
        expect(ids).toEqual(['theme', 'inbox', 'new-task', 'today']);
    });

    it('lifts a recent item above an equally scored one', () => {
        const ranked = rankPaletteItems(
            [item('x', 'Go to Notes'), item('y', 'Go to Next')],
            'go to n',
            { recentIds: ['y'] }
        );
        expect(ranked[0].id).toBe('y');
    });

    it('keeps server-matched entities after command matches', () => {
        const entity = item('task:1', 'Pay rent', {
            group: 'tasks',
            prematched: true,
        });
        const ids = rankPaletteItems([entity, ...items], 'pay', {}).map(
            (i) => i.id
        );
        expect(ids).toEqual(['task:1']);
        const withCmd = rankPaletteItems([entity, ...items], 'to', {}).map(
            (i) => i.id
        );
        expect(withCmd).toContain('task:1');
        expect(withCmd.indexOf('today')).toBeLessThan(
            withCmd.indexOf('task:1')
        );
    });
});
