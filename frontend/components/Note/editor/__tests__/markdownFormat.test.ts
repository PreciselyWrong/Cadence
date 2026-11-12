import {
    addTableColumn,
    addTableRow,
    applyEdit,
    insertLink,
    insertTable,
    removeTableColumn,
    removeTableRow,
    tableAt,
    TextEdit,
    cycleHeading,
    toggleCode,
    toggleHeading,
    toggleLinePrefix,
    toggleWrap,
} from '../markdownFormat';

// "|" marks the caret, "[" and "]" a selection, in the test texts.
const parse = (marked: string) => {
    const from = marked.search(/[|[]/);
    const doc = marked.replace(/[|[\]]/g, '');
    const close = marked.indexOf(']');
    const to = close === -1 ? from : close - 1;
    return { doc, from, to };
};

const run = (
    marked: string,
    fn: (s: ReturnType<typeof parse>) => TextEdit | null
) => {
    const sel = parse(marked);
    const edit = fn(sel);
    if (!edit) return null;
    const out = applyEdit(sel.doc, edit);
    return edit.anchor === edit.head
        ? out.slice(0, edit.head) + '|' + out.slice(edit.head)
        : out.slice(0, edit.anchor) +
              '[' +
              out.slice(edit.anchor, edit.head) +
              ']' +
              out.slice(edit.head);
};

describe('inline formatting', () => {
    it('wraps, unwraps and places the caret between empty markers', () => {
        expect(run('say [hi] now', (s) => toggleWrap(s, '**'))).toBe(
            'say **[hi]** now'
        );
        expect(run('say **[hi]** now', (s) => toggleWrap(s, '**'))).toBe(
            'say [hi] now'
        );
        expect(run('say [**hi**] now', (s) => toggleWrap(s, '**'))).toBe(
            'say [hi] now'
        );
        expect(run('a | b', (s) => toggleWrap(s, '_'))).toBe('a _|_ b');
    });

    it('works inside a list item', () => {
        expect(run('- buy [milk]', (s) => toggleWrap(s, '~~'))).toBe(
            '- buy ~~[milk]~~'
        );
    });

    it('makes a link with the url ready to type', () => {
        expect(run('see [docs]', insertLink)).toBe('see [docs]([url])');
        expect(run('[https://a.b/c]', insertLink)).toBe('[|](https://a.b/c)');
    });

    it('uses inline code on one line and a fenced block across lines', () => {
        expect(run('run [ls]', toggleCode)).toBe('run `[ls]`');
        expect(run('[a\nb]', toggleCode)).toBe('```\na\nb\n```|');
    });
});

describe('line formatting', () => {
    it('sets, changes and removes a heading', () => {
        expect(run('Ti|tle', (s) => toggleHeading(s, 2))).toBe('## Title|');
        expect(run('# Ti|tle', (s) => toggleHeading(s, 2))).toBe('## Title|');
        expect(run('## Ti|tle', (s) => toggleHeading(s, 2))).toBe('Title|');
        expect(run('- it|em', (s) => toggleHeading(s, 3))).toBe('- ### item|');
        expect(run('Ti|tle', cycleHeading)).toBe('# Title|');
        expect(run('## Ti|tle', cycleHeading)).toBe('### Title|');
        expect(run('### Ti|tle', cycleHeading)).toBe('Title|');
    });

    it('turns lines into lists and back, keeping nested indents', () => {
        expect(run('[a\nb]', (s) => toggleLinePrefix(s, 'number'))).toBe(
            '1. a\n2. b|'
        );
        expect(run('[- a\n  - b]', (s) => toggleLinePrefix(s, 'bullet'))).toBe(
            'a\n  b|'
        );
        expect(run('[- a\n  - b]', (s) => toggleLinePrefix(s, 'task'))).toBe(
            '- [ ] a\n  - [ ] b|'
        );
        const done = '- [x] do';
        expect(
            applyEdit(
                done,
                toggleLinePrefix({ doc: done, from: 8, to: 8 }, 'task')
            )
        ).toBe('do');
        expect(run('qu|ote', (s) => toggleLinePrefix(s, 'quote'))).toBe(
            '> quote|'
        );
        expect(run('> qu|ote', (s) => toggleLinePrefix(s, 'quote'))).toBe(
            'quote|'
        );
    });
});

describe('tables', () => {
    const table = '| A | B |\n| --- | --- |\n| 1 | 2 |';

    it('inserts a table after the line, caret in the first header cell', () => {
        expect(run('Intro|', (s) => insertTable(s, 2, 2))).toBe(
            'Intro\n\n| |Column 1 | Column 2 |\n| --- | --- |\n|   |   |'
        );
    });

    it('indents a table under a list item', () => {
        expect(run('- item|', (s) => insertTable(s, 1, 1, () => 'H'))).toBe(
            '- item\n\n  | |H |\n  | --- |'
        );
    });

    it('finds the cell of the caret', () => {
        const at = table.indexOf('2');
        expect(tableAt(table, at)).toMatchObject({ row: 2, col: 1 });
        expect(tableAt('plain', 0)).toBeNull();
    });

    it('adds and removes rows and columns', () => {
        const caretInB = table.lastIndexOf('2');
        const sel = { doc: table, from: caretInB, to: caretInB };
        expect(applyEdit(table, addTableRow(sel)!)).toBe(
            '| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |'
        );
        expect(applyEdit(table, addTableColumn(sel)!)).toBe(
            '| A | B |  |\n| --- | --- | --- |\n| 1 | 2 |  |'
        );
        expect(applyEdit(table, removeTableColumn(sel)!)).toBe(
            '| A |\n| --- |\n| 1 |'
        );
        expect(applyEdit(table, removeTableRow(sel)!)).toBe(
            '| A | B |\n| --- | --- |'
        );
        expect(removeTableRow({ doc: table, from: 2, to: 2 })).toBeNull();
    });
});
