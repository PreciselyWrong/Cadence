import {
    ancestorLines,
    autoBullet,
    backspaceItem,
    foldRange,
    indentItems,
    isNoop,
    itemKeys,
    moveItem,
    outdentItems,
    parseOutline,
    plainItemText,
    replaceSubtree,
    softBreak,
    splitItem,
    subtreeText,
    taskFromItem,
    toggleItemBox,
} from '../outline';
import { applyEdit, TextEdit, TextSelection } from '../markdownFormat';

// "|" marks the caret (or two of them a selection).
const at = (marked: string): TextSelection => {
    const from = marked.indexOf('|');
    const second = marked.indexOf('|', from + 1);
    const doc = marked.replace(/\|/g, '');
    return { doc, from, to: second < 0 ? from : second - 1 };
};

const show = (sel: TextSelection, edit: TextEdit | null) => {
    if (!edit) return null;
    const doc = applyEdit(sel.doc, edit);
    const [a, b] = [
        Math.min(edit.anchor, edit.head),
        Math.max(edit.anchor, edit.head),
    ];
    return a === b
        ? doc.slice(0, a) + '|' + doc.slice(a)
        : doc.slice(0, a) + '|' + doc.slice(a, b) + '|' + doc.slice(b);
};

const run = (marked: string, fn: (sel: TextSelection) => TextEdit | null) => {
    const sel = at(marked);
    return show(sel, fn(sel));
};

describe('parseOutline', () => {
    it('builds the tree from indented bullets', () => {
        const o = parseOutline('- a\n  - b\n    - c\n  - d\n- e');
        expect(o.items.map((i) => [i.line, i.parent, i.end, i.depth])).toEqual([
            [0, null, 3, 0],
            [1, 0, 2, 1],
            [2, 1, 2, 2],
            [3, 0, 3, 1],
            [4, null, 4, 0],
        ]);
    });

    it('reads checkboxes, ordered markers and text', () => {
        const o = parseOutline('1. one\n2. [x] two\n- [ ] three');
        expect(o.items.map((i) => [i.marker, i.box, i.text])).toEqual([
            ['1. ', '', 'one'],
            ['2. ', '[x] ', 'two'],
            ['- ', '[ ] ', 'three'],
        ]);
    });

    it('keeps continuation lines, code and tables in their item', () => {
        const doc = [
            '- a',
            '  more of a',
            '',
            '  ```',
            '  - not an item',
            '  ```',
            '  - child',
            '- b',
        ].join('\n');
        const o = parseOutline(doc);
        expect(o.items.map((i) => i.line)).toEqual([0, 6, 7]);
        expect(o.items[0]).toMatchObject({ contentEnd: 5, end: 6 });
        expect(o.owner.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0]);
        expect(o.code.slice(3, 6)).toEqual([true, true, true]);
    });

    it('ends an item at prose, headings and blank lines before them', () => {
        const o = parseOutline('- a\n\nProse\n# Title\n- b');
        expect(o.items[0].end).toBe(0);
        expect(o.owner).toEqual([0, null, null, null, 1]);
    });

    it('treats a lazy line right after item text as part of it', () => {
        const o = parseOutline('- a\nlazy\n# h');
        expect(o.owner).toEqual([0, 0, null]);
    });

    it('does not read a rule as a bullet', () => {
        expect(parseOutline('- - -\n---').items).toHaveLength(0);
    });
});

describe('indentItems (Tab)', () => {
    it('makes the item a child of the one above, with its children', () => {
        expect(run('- a\n- b|\n  - c', indentItems)).toBe(
            '- a\n  - b|\n    - c'
        );
    });

    it('lines a child up with an ordered parent text', () => {
        expect(run('1. a\n2. |b', indentItems)).toBe('1. a\n   2. |b');
    });

    it('does nothing on a first child (no item above at its level)', () => {
        const sel = at('- a\n  - |b');
        expect(isNoop(indentItems(sel)!, sel)).toBe(true);
    });

    it('indents every selected item', () => {
        expect(run('- a\n- |b\n- c|', indentItems)).toBe('- a\n  - |b\n  - c|');
    });

    it('is not handled outside a list or in code', () => {
        expect(indentItems(at('plain |text'))).toBeNull();
        expect(indentItems(at('- a\n  ```\n  co|de\n  ```'))).toBeNull();
    });
});

describe('outdentItems (Shift-Tab)', () => {
    it('moves the item after its parent; later siblings stay put', () => {
        expect(run('- p\n  - |a\n    - a1\n  - b\n- q', outdentItems)).toBe(
            '- p\n  - b\n- |a\n  - a1\n- q'
        );
    });

    it('outdents the last child in place', () => {
        expect(run('- p\n  - x\n  - y|', outdentItems)).toBe(
            '- p\n  - x\n- y|'
        );
    });

    it('does nothing at the top level or under the zoom root', () => {
        const top = at('- |a');
        expect(isNoop(outdentItems(top)!, top)).toBe(true);
        const zoomed = at('- p\n  - |a');
        expect(isNoop(outdentItems(zoomed, { rootLine: 0 })!, zoomed)).toBe(
            true
        );
    });
});

describe('moveItem (Alt-↑/↓)', () => {
    it('swaps the item and its children with the sibling above', () => {
        expect(run('- a\n  - a1\n- b|\n  - b1', (s) => moveItem(s, -1))).toBe(
            '- b|\n  - b1\n- a\n  - a1'
        );
    });

    it('swaps with the sibling below', () => {
        expect(run('- |a\n  - a1\n- b\n- c', (s) => moveItem(s, 1))).toBe(
            '- b\n- |a\n  - a1\n- c'
        );
    });

    it('keeps a blank line between siblings where it was', () => {
        expect(run('- a\n\n- |b', (s) => moveItem(s, -1))).toBe('- |b\n\n- a');
    });

    it('does nothing at the edge, and stays inside the parent', () => {
        const sel = at('- p\n  - |x\n- q');
        expect(isNoop(moveItem(sel, -1)!, sel)).toBe(true);
    });
});

describe('splitItem (Enter)', () => {
    it('adds a sibling at the end of an item', () => {
        expect(run('- a|\n- b', splitItem)).toBe('- a\n- |\n- b');
    });

    it('adds the sibling after the children of a folded item', () => {
        expect(
            run('- a|\n  - a1\n- b', (s) =>
                splitItem(s, { folded: (l) => l === 0 })
            )
        ).toBe('- a\n  - a1\n- |\n- b');
    });

    it('adds a first child at the end of an open item with children', () => {
        expect(run('- a|\n  - a1', splitItem)).toBe('- a\n  - |\n  - a1');
    });

    it('splits in the middle; the second half keeps the children', () => {
        expect(run('- hello |world\n  - c', splitItem)).toBe(
            '- hello\n- |world\n  - c'
        );
    });

    it('adds an empty item above when the caret is at the start', () => {
        expect(run('- |text', splitItem)).toBe('- \n- |text');
    });

    it('continues numbering and unchecked boxes', () => {
        expect(run('1. one|', splitItem)).toBe('1. one\n2. |');
        expect(run('- [x] done|', splitItem)).toBe('- [x] done\n- [ ] |');
    });

    it('outdents an empty child, leaves the list at the top level', () => {
        expect(run('- p\n  - |', splitItem)).toBe('- p\n- |');
        expect(run('- a\n- |', splitItem)).toBe('- a\n|');
    });

    it('turns a prose line into a bullet and starts the next one', () => {
        expect(run('Some prose|', splitItem)).toBe('- Some prose\n- |');
    });

    it('leaves headings, code and blank lines to Markdown', () => {
        expect(splitItem(at('# Title|'))).toBeNull();
        expect(splitItem(at('- a\n  ```\n  x|\n  ```'))).toBeNull();
        expect(splitItem(at('|'))).toBeNull();
    });

    it('on the zoom root, adds a first child with the rest of the text', () => {
        expect(
            run('- p\n  - root| tail\n    - c', (s) =>
                splitItem(s, { rootLine: 1 })
            )
        ).toBe('- p\n  - root\n    - |tail\n    - c');
    });
});

describe('softBreak (Shift-Enter)', () => {
    it('breaks the line inside the item, lined up with its text', () => {
        expect(run('  - a|b', softBreak)).toBe('  - a\n    |b');
    });

    it('is not handled outside an item', () => {
        expect(softBreak(at('text|'))).toBeNull();
    });
});

describe('backspaceItem', () => {
    it('removes the checkbox first', () => {
        expect(run('- [ ] |todo', backspaceItem)).toBe('- |todo');
    });

    it('deletes an empty item into the line above', () => {
        expect(run('- a\n- |', backspaceItem)).toBe('- a|');
    });

    it('merges an item without children into the line above', () => {
        expect(run('- a\n  - |b', backspaceItem)).toBe('- a|b');
    });

    it('turns the first item into a plain line', () => {
        expect(run('- |a', backspaceItem)).toBe('|a');
    });

    it('does nothing on an item with children or on the zoom root', () => {
        const sel = at('- x\n- |a\n  - c');
        expect(isNoop(backspaceItem(sel)!, sel)).toBe(true);
        const root = at('- |a');
        expect(isNoop(backspaceItem(root, { rootLine: 0 })!, root)).toBe(true);
    });

    it('is not handled elsewhere in the text', () => {
        expect(backspaceItem(at('- a|b'))).toBeNull();
    });
});

describe('toggleItemBox (Ctrl-Enter)', () => {
    it('cycles none → [ ] → [x] → [ ]', () => {
        expect(run('- a|', toggleItemBox)).toBe('- [ ] a|');
        expect(run('- [ ] a|', toggleItemBox)).toBe('- [x] a|');
        expect(run('- [x] a|', toggleItemBox)).toBe('- [ ] a|');
    });

    it('makes a plain line a checkbox item', () => {
        expect(run('call Bob|', toggleItemBox)).toBe('- [ ] call Bob|');
    });
});

describe('fold, keys, zoom helpers', () => {
    const doc = '- a\n  - a1\n    - a2\n- b';

    it('folds from the end of the first line to the end of the subtree', () => {
        expect(foldRange(doc, 0)).toEqual({ from: 3, to: 19 });
        expect(foldRange(doc, 3)).toBeNull();
    });

    it('keys items by text and rank among equal texts', () => {
        const keys = itemKeys(parseOutline('- A\n- b\n- a'));
        expect([...keys.values()]).toEqual(['a#0', 'b#0', 'a#1']);
    });

    it('lists the ancestors of an item', () => {
        expect(ancestorLines(parseOutline(doc), 2)).toEqual([0, 1, 2]);
    });

    it('cuts out a subtree and puts an edited one back', () => {
        expect(subtreeText(doc, 1)).toBe('- a1\n  - a2');
        expect(replaceSubtree(doc, 1, '- A1\n  - [x] a2')).toBe(
            '- a\n  - A1\n    - [x] a2\n- b'
        );
    });
});

describe('tasks from items', () => {
    it('strips Markdown from the item text', () => {
        expect(
            plainItemText('Call **Bob** about [[Trip]] and @[Ann](person:a1)')
        ).toBe('Call Bob about Trip and Ann');
        expect(plainItemText('see [docs](https://x.dev) `now`')).toBe(
            'see docs now'
        );
    });

    it('replaces the text with a task link and keeps the box', () => {
        const sel = at('- [ ] Call |Bob\n- x');
        const made = taskFromItem(sel)!;
        expect(made.name).toBe('Call Bob');
        expect(applyEdit(sel.doc, made.edit)).toBe(
            '- [ ] [[task:Call Bob]]\n- x'
        );
    });

    it('does not convert an empty item or an existing task link', () => {
        expect(taskFromItem(at('- |'))).toBeNull();
        expect(taskFromItem(at('- [[task:Call]]|'))).toBeNull();
        expect(taskFromItem(at('prose|'))).toBeNull();
    });
});

describe('autoBullet', () => {
    it('starts typing on an empty top-level line with a bullet', () => {
        expect(autoBullet('', 0, 'a')).toBe('- a');
        expect(autoBullet('# Title\n', 8, 'x')).toBe('- x');
    });

    it('leaves Markdown block starters and filled lines alone', () => {
        for (const ch of ['#', '>', '|', '`', '-', '*', ' ']) {
            expect(autoBullet('', 0, ch)).toBeNull();
        }
        expect(autoBullet('abc', 3, 'd')).toBeNull();
        expect(autoBullet('```\n\n```', 4, 'x')).toBeNull();
    });
});
