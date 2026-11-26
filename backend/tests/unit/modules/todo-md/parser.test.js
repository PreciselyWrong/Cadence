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

describe('todo-md handoff section', () => {
    it('extracts ## État actuel into handoff and excludes its bullets from items', () => {
        const parsed = parseTodoMd(
            [
                '# Demo',
                '',
                '## État actuel',
                '- Branche active : `feat/kanban` (propre)',
                '- Tests : 12 passés, 0 échoué',
                '- Bloqueurs : attente validation API',
                '- **Prochaine action** : brancher le endpoint board-tree',
                '',
                '## Next',
                '- Real task',
                '',
            ].join('\n')
        );
        expect(names(parsed)).toEqual(['Next:Real task']);
        expect(parsed.handoff).toEqual({
            section: 'État actuel',
            branch: 'feat/kanban (propre)',
            tests: '12 passés, 0 échoué',
            blockers: 'attente validation API',
            next_action: 'brancher le endpoint board-tree',
            raw: [
                '- Branche active : `feat/kanban` (propre)',
                '- Tests : 12 passés, 0 échoué',
                '- Bloqueurs : attente validation API',
                '- **Prochaine action** : brancher le endpoint board-tree',
            ].join('\n'),
        });
    });

    it('normalizes empty blockers like "aucun" or "none" to null', () => {
        const parsed = parseTodoMd(
            '## État actuel\n- Branche : main\n- Bloqueurs : aucun\n- Prochaine action atomique : lancer le build\n'
        );
        expect(parsed.items).toEqual([]);
        expect(parsed.handoff.blockers).toBeNull();
        expect(parsed.handoff.next_action).toBe('lancer le build');
    });

    it('returns null handoff when no handoff section exists', () => {
        const parsed = parseTodoMd('## Next\n- Only task\n');
        expect(parsed.handoff).toBeNull();
    });

    describe('inline metadata', () => {
        const only = (line) => parseTodoMd(`## Next\n${line}\n`).items[0];

        it('reads tags, priority and due date and cleans them from the name', () => {
            const item = only(
                '- Fix login #bug #UX !High @2026-12-05 #secu #bug'
            );
            expect(item.name).toBe('Fix login #UX');
            expect(item.tags).toEqual(['bug', 'secu']);
            expect(item.priority).toBe('high');
            expect(item.due_date).toBe('2026-12-05');
        });

        it('reads tokens anywhere in the bullet line, not in its note', () => {
            const parsed = parseTodoMd(
                '## Next\n- [ ] #infra Move the backups !med to the NAS\n  note #doc @2026-01-02\n'
            );
            const [item] = parsed.items;
            expect(item.name).toBe('Move the backups to the NAS');
            expect(item.tags).toEqual(['infra']);
            expect(item.priority).toBe('medium');
            expect(item.due_date).toBeNull();
            expect(item.note).toBe('note #doc @2026-01-02');
        });

        it('maps every priority and leaves null without one', () => {
            expect(only('- A !low').priority).toBe('low');
            expect(only('- A !MED').priority).toBe('medium');
            expect(only('- A !high').priority).toBe('high');
            expect(only('- A').priority).toBeNull();
            expect(only('- A').tags).toEqual([]);
            expect(only('- A').due_date).toBeNull();
        });

        it('ignores impossible dates and leaves them in the name', () => {
            const item = only('- Pay rent @2026-02-30');
            expect(item.due_date).toBeNull();
            expect(item.name).toBe('Pay rent @2026-02-30');
            expect(only('- Leap @2028-02-29').due_date).toBe('2028-02-29');
            expect(only('- Not leap @2027-02-29').due_date).toBeNull();
        });

        it('ignores tokens inside code spans, links, URLs and words', () => {
            const item = only(
                '- Run `npm test #perf !high` see [docs](https://x.dev/a#doc) https://x.dev/b#bug mail@2026-01-01 a!low'
            );
            expect(item.tags).toEqual([]);
            expect(item.priority).toBeNull();
            expect(item.due_date).toBeNull();
            expect(item.name).toBe(
                'Run npm test #perf !high see docs https://x.dev/b#bug mail@2026-01-01 a!low'
            );
        });

        it('keeps issue numbers out of tags', () => {
            const item = only('- Close #123 #ok #v2');
            expect(item.tags).toEqual(['ok', 'v2']);
            expect(item.name).toBe('Close #123');
        });

        it('keys a bullet by its clean name, so editing tokens keeps its identity', () => {
            const plain = only('- Fix login');
            expect(only('- Fix login #bug').key).toBe(plain.key);
            expect(only('- Fix login #bug !high @2026-12-05').key).toBe(
                plain.key
            );
            expect(only('- !low Fix login @2027-01-01 #ux').key).toBe(
                plain.key
            );
        });

        it('keeps the name the bullet had before tokens were read', () => {
            const item = only('- Fix **login** #bug !high');
            expect(item.name).toBe('Fix login');
            expect(item.legacyName).toBe('Fix login #bug !high');
            expect(only('- Plain').legacyName).toBe('Plain');
        });
    });
});
