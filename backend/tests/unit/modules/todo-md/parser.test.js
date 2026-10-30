const { parseTodoMd } = require('../../../../modules/todo-md/parser');

const names = (parsed) => parsed.items.map((i) => `${i.section}:${i.name}`);

describe('todo-md parser', () => {
    it('reads sections and top-level bullets', () => {
        const parsed = parseTodoMd(
            '# Project\n\n## Now\n- Ship it\n\n## Next\n- Write docs\n- Fix bug\n\n## Ideas\n- Maybe later\n'
        );
        expect(names(parsed)).toEqual([
            'Now:Ship it',
            'Next:Write docs',
            'Next:Fix bug',
            'Ideas:Maybe later',
        ]);
        expect(parsed.sections.map((s) => s.name)).toEqual([
            'Now',
            'Next',
            'Ideas',
        ]);
    });

    it('accepts any bullet marker and ignores text before the first section', () => {
        const parsed = parseTodoMd('- stray\n## Now\n* star\n+ plus\n- dash\n');
        expect(names(parsed)).toEqual(['Now:star', 'Now:plus', 'Now:dash']);
    });

    it('treats indented lines and nested bullets as the note of the bullet above', () => {
        const parsed = parseTodoMd(
            '## Now\n- Parent\n  detail line\n  - sub one\n    - deeper\n\n  - sub two\n- Next one\n'
        );
        expect(parsed.items).toHaveLength(2);
        expect(parsed.items[0].name).toBe('Parent');
        expect(parsed.items[0].note).toBe(
            'detail line\n- sub one\n  - deeper\n\n- sub two'
        );
        expect(parsed.items[1].note).toBe('');
    });

    it('does not let trailing blank lines join a bullet', () => {
        const text = '## Now\n- A\n  more\n\n\n- B\n';
        const [a] = parseTodoMd(text).items;
        expect(text.slice(a.start, a.end)).toBe('- A\n  more');
    });

    it('reads checkboxes and done sections', () => {
        const parsed = parseTodoMd(
            '## Now\n- [ ] open\n- [x] closed\n- [X] CLOSED\n\n## Done\n- shipped\n\n## Dropped\n- nope\n'
        );
        expect(parsed.items.map((i) => [i.name, i.done, i.dropped])).toEqual([
            ['open', false, false],
            ['closed', true, false],
            ['CLOSED', true, false],
            ['shipped', true, false],
            ['nope', false, true],
        ]);
        expect(parsed.items[0].checkbox).toBe(' ');
        expect(parsed.items[3].checkbox).toBeNull();
    });

    it('strips markdown from the name but keeps it in raw', () => {
        const [item] = parseTodoMd(
            '## Now\n- **Bold** and `code` and [a link](https://x.test) and ~~gone~~ _it_\n'
        ).items;
        expect(item.name).toBe('Bold and code and a link and gone it');
        expect(item.raw).toContain('**Bold**');
    });

    it('handles CRLF and a missing trailing newline', () => {
        const crlf = parseTodoMd('## Now\r\n- A\r\n  note\r\n- B');
        expect(crlf.eol).toBe('\r\n');
        expect(crlf.endsWithNewline).toBe(false);
        expect(crlf.items.map((i) => i.name)).toEqual(['A', 'B']);
        expect(crlf.items[0].note).toBe('note');
        expect(parseTodoMd('## Now\n- A\n').endsWithNewline).toBe(true);
    });

    it('does not read bullets or headings inside code fences', () => {
        const parsed = parseTodoMd(
            '## Now\n```\n- not a task\n## Fake\n```\n- real\n'
        );
        expect(names(parsed)).toEqual(['Now:real']);
        expect(parsed.sections.map((s) => s.name)).toEqual(['Now']);
    });

    it('ignores deeper headings, empty bullets and an empty file', () => {
        expect(names(parseTodoMd('## Now\n### sub\n- \n-\n- ok\n'))).toEqual([
            'Now:ok',
        ]);
        expect(parseTodoMd('').items).toEqual([]);
    });

    it('gives duplicates an occurrence index', () => {
        const { items } = parseTodoMd(
            '## Now\n- same\n- same\n\n## Next\n- same\n'
        );
        expect(new Set(items.map((i) => i.key)).size).toBe(3);
        expect(items.map((i) => i.occurrence)).toEqual([0, 1, 0]);
    });
});

describe('todo-md identity', () => {
    const keysOf = (text) =>
        Object.fromEntries(
            parseTodoMd(text).items.map((i) => [
                `${i.name}#${i.occurrence}`,
                i.key,
            ])
        );

    it('survives reordering, unrelated edits and checking a box', () => {
        const before = keysOf('## Next\n- A\n- B\n- same\n- same\n');
        const after = keysOf(
            '# Title\n\n## Next\n- same\n- [x] B\n  new note\n- A\n- same\n'
        );
        expect(after).toEqual(before);
    });

    it('changes when the section changes', () => {
        const next = parseTodoMd('## Next\n- A\n').items[0];
        const now = parseTodoMd('## Now\n- A\n').items[0];
        expect(next.key).not.toBe(now.key);
    });
});
