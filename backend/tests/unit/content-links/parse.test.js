const {
    parseLinks,
    findLinkTo,
    snippetAround,
} = require('../../../modules/content-links/core/parse');

const UID = 'abc123def456ghj';
const UID2 = 'zzz123def456ghj';

const kinds = (text) =>
    parseLinks(text).map(({ type, uid, title }) => uid ?? `${type}:${title}`);

describe('content link parser', () => {
    it('reads note and task wiki links by title, lowercased', () => {
        expect(kinds('See [[Packing List]] and [[task: Call Bank ]]')).toEqual([
            'note:packing list',
            'task:call bank',
        ]);
    });

    it('reads person mentions and in-app paths by uid', () => {
        const text = [
            `@[Anna](person:${UID})`,
            `[the note](/note/${UID2}-my-slug)`,
            `https://cadence.example/task/${UID}`,
            `[x](/notes/${UID2})`,
        ].join(' ');
        expect(parseLinks(text).map((l) => `${l.type}:${l.uid}`)).toEqual([
            `person:${UID}`,
            `note:${UID2}`,
            `task:${UID}`,
        ]);
    });

    it('ignores links inside code', () => {
        const text = [
            'Before `[[Inline]]`',
            '```',
            '[[Fenced]]',
            `/task/${UID}`,
            '```',
            'after [[Real]]',
        ].join('\n');
        expect(kinds(text)).toEqual(['note:real']);
    });

    it('does not read a longer token as a uid', () => {
        expect(parseLinks(`/task/${UID}xyz`)).toEqual([]);
    });

    it('finds the link to a target by uid or by title', () => {
        const text = `Intro [[Groceries]] then /note/${UID}`;
        expect(
            findLinkTo(text, {
                type: 'note',
                uid: 'other',
                title: 'groceries ',
            })
        ).toMatchObject({ title: 'groceries' });
        expect(
            findLinkTo(text, { type: 'note', uid: UID, title: 'Nope' })
        ).toMatchObject({ uid: UID });
        expect(
            findLinkTo(text, { type: 'task', uid: UID, title: 'Groceries' })
        ).toBeNull();
    });

    it('makes a plain-text snippet around the link, never cutting a link', () => {
        const text = `**Call** @[Anna](person:${UID}) about [[Trip]]`;
        expect(snippetAround(text, 9)).toBe('Call @Anna about Trip');
        const long = `${'word '.repeat(30)}[[A]] and @[Anna Keller](person:${UID}) ${'tail '.repeat(30)}`;
        const snippet = snippetAround(long, long.indexOf('[[A]]'), 30);
        expect(snippet).toMatch(
            /^… (word )+A and @Anna Keller (tail )*tail …$/
        );
        expect(snippet).not.toContain('person:');
    });
});
