// The outline under Markdown text: list items as a tree, read line by line,
// and the outliner's edits (split, indent, outdent, move, check, merge) as
// pure functions on the text. The text stays the only source of truth:
// every edit returns one replacement plus the selection to keep, like the
// formatting commands of markdownFormat.ts.

import { TextEdit, TextSelection } from './markdownFormat';

export interface OutlineItem {
    // First line of the item (0-based).
    line: number;
    // Last line of its own content: its text, continuation lines and block
    // children (tables, code), before its first child item.
    contentEnd: number;
    // Last line of the item with all its descendants.
    end: number;
    // Width of the leading whitespace.
    indent: number;
    // "- ", "* ", "1. " (with the spaces that follow the marker).
    marker: string;
    // "[ ] " or "[x] ", or "".
    box: string;
    // Column where the item's text starts (after marker and box).
    textStart: number;
    text: string;
    parent: number | null;
    children: number[];
    depth: number;
}

export interface Outline {
    lines: string[];
    items: OutlineItem[];
    // The deepest item each line belongs to, or null (prose, headings,
    // blank lines between blocks).
    owner: (number | null)[];
    // Lines inside a fenced code block (fences included).
    code: boolean[];
}

const ITEM =
    /^(\s*)((?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$))(\[[ xX]\](?:[ \t]+|$))?/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const NOT_LAZY = /^\s*(#{1,6}\s|>|```|~~~|\|)/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;

const width = (ws: string) =>
    [...ws].reduce((n, ch) => n + (ch === '\t' ? 4 : 1), 0);

const leading = (line: string) => line.match(/^\s*/)![0];

const contentColumn = (item: OutlineItem) => item.indent + item.marker.length;

export function parseOutline(doc: string): Outline {
    const lines = doc.split('\n');
    const items: OutlineItem[] = [];
    const owner: (number | null)[] = lines.map(() => null);
    const code: boolean[] = lines.map(() => false);
    const stack: number[] = [];
    let fence: { mark: string; owner: number | null } | null = null;
    // Blank lines wait until the next filled line says whose they are.
    let pendingBlank: number[] = [];
    let lastFilledOwned = false;

    const claim = (line: number, item: number | null) => {
        owner[line] = item;
        if (item === null) return;
        for (let i: number | null = item; i !== null; i = items[i].parent) {
            items[i].end = Math.max(items[i].end, line);
        }
        const it = items[item];
        if (it.children.length === 0) it.contentEnd = line;
    };
    const flushBlanks = (item: number | null) => {
        for (const b of pendingBlank) {
            owner[b] = item;
            if (item !== null) claim(b, item);
        }
        pendingBlank = [];
    };

    lines.forEach((line, n) => {
        if (fence) {
            code[n] = true;
            flushBlanks(fence.owner);
            claim(n, fence.owner);
            const m = line.match(FENCE);
            if (
                m &&
                m[1][0] === fence.mark[0] &&
                m[1].length >= fence.mark.length
            ) {
                fence = null;
            }
            return;
        }
        if (line.trim() === '') {
            pendingBlank.push(n);
            return;
        }
        const ws = width(leading(line));
        const m = !HR.test(line) ? line.match(ITEM) : null;
        if (m) {
            const indent = width(m[1]);
            while (
                stack.length &&
                indent <= items[stack[stack.length - 1]].indent
            ) {
                stack.pop();
            }
            const parent = stack.length ? stack[stack.length - 1] : null;
            flushBlanks(parent);
            const marker =
                m[2].endsWith(' ') || m[2].endsWith('\t') ? m[2] : `${m[2]} `;
            const box = m[3] ? `[${m[3][1] === ' ' ? ' ' : 'x'}] ` : '';
            const index = items.length;
            items.push({
                line: n,
                contentEnd: n,
                end: n,
                indent,
                marker,
                box,
                textStart: m[0].length,
                text: line.slice(m[0].length),
                parent,
                children: [],
                depth: stack.length,
            });
            if (parent !== null) items[parent].children.push(index);
            stack.push(index);
            claim(n, index);
            lastFilledOwned = true;
            return;
        }
        // A continuation of the deepest open item whose content column it
        // reaches; a lazy paragraph line right after item text also counts.
        while (
            stack.length &&
            ws < contentColumn(items[stack[stack.length - 1]])
        ) {
            const top = stack[stack.length - 1];
            const lazy =
                pendingBlank.length === 0 &&
                lastFilledOwned &&
                !NOT_LAZY.test(line) &&
                !code[n - 1] &&
                owner[n - 1] === top;
            if (lazy) break;
            stack.pop();
        }
        const item = stack.length ? stack[stack.length - 1] : null;
        flushBlanks(item);
        claim(n, item);
        lastFilledOwned = item !== null;
        const f = line.match(FENCE);
        if (f) {
            code[n] = true;
            fence = { mark: f[1], owner: item };
        }
    });
    return { lines, items, owner, code };
}

// The item whose first line is `line`.
export const itemAtLine = (outline: Outline, line: number) =>
    outline.items.findIndex((it) => it.line === line);

const lineOf = (doc: string, pos: number) => {
    let n = 0;
    for (let i = 0; i < pos && i < doc.length; i++) if (doc[i] === '\n') n++;
    return n;
};

const lineStarts = (lines: string[]) => {
    const starts: number[] = [];
    let at = 0;
    for (const l of lines) {
        starts.push(at);
        at += l.length + 1;
    }
    return starts;
};

interface Caret {
    line: number;
    col: number;
}

const toCaret = (doc: string, pos: number): Caret => {
    const line = lineOf(doc, pos);
    return { line, col: pos - (doc.lastIndexOf('\n', pos - 1) + 1) };
};

// Rewrites lines [from, to] with `next`, mapping the selection through a
// per-line function (old line, column) → (new line, column).
const rewrite = (
    outline: Outline,
    from: number,
    to: number,
    next: string[],
    sel: TextSelection,
    map: (c: Caret) => Caret
): TextEdit => {
    const starts = lineStarts(outline.lines);
    const start = starts[from];
    const end = starts[to] + outline.lines[to].length;
    const insert = next.join('\n');
    const nextStarts = lineStarts(next);
    const place = (pos: number) => {
        const c = toCaret(sel.doc, pos);
        if (c.line < from || c.line > to) {
            return pos < start ? pos : pos - (end - start) + insert.length;
        }
        const m = map(c);
        const idx = m.line - from;
        const len = next[idx]?.length ?? 0;
        return (
            start + (nextStarts[idx] ?? 0) + Math.max(0, Math.min(m.col, len))
        );
    };
    return {
        from: start,
        to: end,
        insert,
        anchor: place(sel.from),
        head: place(sel.to),
    };
};

const shiftLine = (line: string, delta: number) => {
    if (line.trim() === '') return line;
    if (delta >= 0) return ' '.repeat(delta) + line;
    const ws = leading(line);
    const cut = Math.min(-delta, ws.length);
    return line.slice(cut);
};

const shiftedCol = (line: string, col: number, delta: number) => {
    if (line.trim() === '') return col;
    if (delta >= 0) return col + delta;
    return Math.max(0, col - Math.min(-delta, leading(line).length));
};

export const NOOP = (sel: TextSelection): TextEdit => ({
    from: sel.from,
    to: sel.from,
    insert: '',
    anchor: sel.from,
    head: sel.to,
});

export const isNoop = (edit: TextEdit, sel: TextSelection) =>
    edit.insert === '' &&
    edit.from === edit.to &&
    edit.anchor === sel.from &&
    edit.head === sel.to;

const isZoomRoot = (options: OutlineOptions, line: number) =>
    options.rootLine != null && options.rootLine === line;

export interface OutlineOptions {
    // Zoomed in: the item on this line is the root; nothing leaves it.
    rootLine?: number | null;
    // Folded items (by first line): Enter at their end adds a sibling after
    // the hidden children instead of a first child.
    folded?: (line: number) => boolean;
}

// The top-level items the selection touches (none of them inside another).
const selectedItems = (outline: Outline, sel: TextSelection) => {
    const first = lineOf(sel.doc, sel.from);
    const lastPos =
        sel.to > sel.from && sel.doc[sel.to - 1] === '\n' ? sel.to - 1 : sel.to;
    const last = lineOf(sel.doc, lastPos);
    const touched = outline.items
        .map((it, i) => ({ it, i }))
        .filter(({ it }) => it.line >= first && it.line <= last)
        .map(({ i }) => i);
    // A caret on a continuation line acts on the item it belongs to.
    const owner = outline.owner[first];
    if (owner !== null && outline.items[owner].line < first) {
        touched.unshift(owner);
    }
    const set = new Set(touched);
    return touched.filter((i) => {
        for (
            let p = outline.items[i].parent;
            p !== null;
            p = outline.items[p].parent
        ) {
            if (set.has(p)) return false;
        }
        return true;
    });
};

const previousSibling = (outline: Outline, index: number) => {
    const item = outline.items[index];
    const siblings =
        item.parent === null
            ? outline.items
                  .map((it, i) => ({ it, i }))
                  .filter(({ it }) => it.parent === null)
                  .map(({ i }) => i)
            : outline.items[item.parent].children;
    const at = siblings.indexOf(index);
    return {
        prev: at > 0 ? siblings[at - 1] : null,
        next: at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : null,
    };
};

const inCode = (outline: Outline, sel: TextSelection) =>
    outline.code[lineOf(sel.doc, sel.from)];

// Tab: the selected items, with their children, become children of the
// item before them. Null outside list items (Tab then leaves the editor).
export function indentItems(sel: TextSelection): TextEdit | null {
    const outline = parseOutline(sel.doc);
    if (inCode(outline, sel)) return null;
    const picked = selectedItems(outline, sel);
    if (picked.length === 0) return null;
    const first = outline.items[picked[0]];
    const { prev } = previousSibling(outline, picked[0]);
    if (prev === null) return NOOP(sel);
    const target = outline.items[prev];
    const delta = contentColumn(target) - first.indent;
    const lastLine = Math.max(...picked.map((i) => outline.items[i].end));
    const block = outline.lines.slice(first.line, lastLine + 1);
    return rewrite(
        outline,
        first.line,
        lastLine,
        block.map((l) => shiftLine(l, delta)),
        sel,
        (c) => ({
            line: c.line,
            col: shiftedCol(outline.lines[c.line], c.col, delta),
        })
    );
}

// Shift-Tab: the item (with its children) moves out of its parent and lands
// right after it; the siblings that followed it stay under the parent.
export function outdentItems(
    sel: TextSelection,
    options: OutlineOptions = {}
): TextEdit | null {
    const outline = parseOutline(sel.doc);
    if (inCode(outline, sel)) return null;
    const picked = selectedItems(outline, sel);
    if (picked.length === 0) return null;
    const first = outline.items[picked[0]];
    if (first.parent === null) return NOOP(sel);
    const parent = outline.items[first.parent];
    if (isZoomRoot(options, parent.line)) return NOOP(sel);
    const sameParent = picked.every(
        (i) => outline.items[i].parent === first.parent
    );
    const lastLine = Math.max(...picked.map((i) => outline.items[i].end));
    const delta = parent.indent - first.indent;
    const block = outline.lines
        .slice(first.line, lastLine + 1)
        .map((l) => shiftLine(l, delta));
    if (!sameParent || lastLine >= parent.end) {
        return rewrite(outline, first.line, lastLine, block, sel, (c) => ({
            line: c.line,
            col: shiftedCol(outline.lines[c.line], c.col, delta),
        }));
    }
    const rest = outline.lines.slice(lastLine + 1, parent.end + 1);
    const next = [...rest, ...block];
    const moved = lastLine - first.line + 1;
    return rewrite(outline, first.line, parent.end, next, sel, (c) => {
        if (c.line > lastLine) return { line: c.line - moved, col: c.col };
        return {
            line: c.line + rest.length,
            col: shiftedCol(outline.lines[c.line], c.col, delta),
        };
    });
}

// Alt-↑/↓: the item and its children swap places with the sibling above
// or below.
export function moveItem(sel: TextSelection, dir: 1 | -1): TextEdit | null {
    const outline = parseOutline(sel.doc);
    if (inCode(outline, sel)) return null;
    const caretLine = lineOf(sel.doc, sel.from);
    const index = outline.owner[caretLine];
    if (index === null) return null;
    const { prev, next } = previousSibling(outline, index);
    const other = dir === -1 ? prev : next;
    if (other === null) return NOOP(sel);
    const [a, b] =
        dir === -1
            ? [outline.items[other], outline.items[index]]
            : [outline.items[index], outline.items[other]];
    const upper = outline.lines.slice(a.line, a.end + 1);
    const gap = outline.lines.slice(a.end + 1, b.line);
    const lower = outline.lines.slice(b.line, b.end + 1);
    return rewrite(
        outline,
        a.line,
        b.end,
        [...lower, ...gap, ...upper],
        sel,
        (c) => {
            if (c.line <= a.end) {
                return { line: c.line + lower.length + gap.length, col: c.col };
            }
            if (c.line < b.line) {
                return {
                    line: c.line + lower.length - upper.length,
                    col: c.col,
                };
            }
            return { line: c.line - b.line + a.line, col: c.col };
        }
    );
}

const nextMarker = (marker: string) => {
    const num = marker.match(/^(\d+)([.)])(\s*)$/);
    if (num) return `${Number(num[1]) + 1}${num[2]} `;
    return `${marker.trim()} `;
};

// Enter. In an item: splits it at the caret (the text after the caret
// becomes the next item and keeps the children); at the end of an open item
// with children, adds a first child; on an empty item, outdents it, or
// leaves the list at the top level. On a prose line, turns it into a
// bullet and starts the next one. Null where Markdown's own Enter applies
// (code, tables, headings, blank lines) or with a selection.
export function splitItem(
    sel: TextSelection,
    options: OutlineOptions = {}
): TextEdit | null {
    const { doc, from, to } = sel;
    if (to !== from) return null;
    const outline = parseOutline(doc);
    const caret = toCaret(doc, from);
    if (outline.code[caret.line]) return null;
    const lineText = outline.lines[caret.line];
    const index = outline.owner[caret.line];
    const starts = lineStarts(outline.lines);
    const lineStart = starts[caret.line];
    const lineEnd = (n: number) => starts[n] + outline.lines[n].length;
    const insertAt = (pos: number, text: string) => ({
        from: pos,
        to: pos,
        insert: text,
        anchor: pos + text.length,
        head: pos + text.length,
    });

    if (index === null) {
        if (
            lineText.trim() === '' ||
            /^\s*(#{1,6}\s|>|\|)/.test(lineText) ||
            HR.test(lineText)
        ) {
            return null;
        }
        const ws = leading(lineText);
        const head = lineText.slice(ws.length, caret.col).trimEnd();
        const after = lineText.slice(caret.col).trimStart();
        const first = `${ws}- ${head}\n${ws}- `;
        return {
            from: lineStart,
            to: lineStart + lineText.length,
            insert: `${first}${after}`,
            anchor: lineStart + first.length,
            head: lineStart + first.length,
        };
    }

    const item = outline.items[index];
    if (/^\s*\|/.test(lineText)) return null;
    const isRoot = isZoomRoot(options, item.line);
    const folded = options.folded?.(item.line) ?? false;
    const siblingPrefix =
        ' '.repeat(item.indent) +
        nextMarker(item.marker) +
        (item.box ? '[ ] ' : '');
    const childPrefix =
        ' '.repeat(
            item.children.length > 0
                ? outline.items[item.children[0]].indent
                : contentColumn(item)
        ) +
        '- ' +
        (item.box ? '[ ] ' : '');
    const firstChild = () =>
        insertAt(lineEnd(item.contentEnd), `\n${childPrefix}`);
    const nextSibling = () => insertAt(lineEnd(item.end), `\n${siblingPrefix}`);

    if (caret.line !== item.line) {
        // A continuation line: Enter at the end of the item's last own line
        // starts the next item; elsewhere it is a line break in the item.
        if (caret.line === item.contentEnd && caret.col === lineText.length) {
            if (isRoot || (item.children.length > 0 && !folded)) {
                return firstChild();
            }
            return nextSibling();
        }
        return softBreak(sel);
    }

    if (caret.col < item.textStart) return null;
    const text = lineText.slice(item.textStart);
    const before = lineText.slice(item.textStart, caret.col);
    const after = lineText.slice(caret.col);

    if (isRoot) {
        // The zoomed-in item is the page title: Enter adds a first child,
        // taking the text after the caret along.
        const kept = doc.slice(lineEnd(item.line), lineEnd(item.contentEnd));
        const insert = `${kept}\n${childPrefix}${after.trimStart()}`;
        const caretPos = from + kept.length + 1 + childPrefix.length;
        return {
            from,
            to: lineEnd(item.contentEnd),
            insert,
            anchor: caretPos,
            head: caretPos,
        };
    }

    if (
        text.trim() === '' &&
        item.children.length === 0 &&
        item.contentEnd === item.line
    ) {
        if (item.parent !== null) {
            return outdentItems(sel, options) ?? NOOP(sel);
        }
        // Leave the list: the empty bullet becomes an empty line.
        return {
            from: lineStart,
            to: lineStart + lineText.length,
            insert: '',
            anchor: lineStart,
            head: lineStart,
        };
    }

    if (caret.col === item.textStart) {
        // At the start: an empty item above, the caret stays with the text.
        const prefix = lineText
            .slice(0, item.textStart)
            .replace(/\[[xX]\]/, '[ ]');
        const caretPos = lineStart + prefix.length + 1 + item.textStart;
        return {
            from: lineStart,
            to: lineStart,
            insert: `${prefix}\n`,
            anchor: caretPos,
            head: caretPos,
        };
    }

    if (caret.col >= lineText.length) {
        if (item.children.length > 0 && !folded) return firstChild();
        if (item.contentEnd > item.line && !folded) {
            return insertAt(
                lineEnd(item.line),
                `\n${' '.repeat(contentColumn(item))}`
            );
        }
        return nextSibling();
    }

    // In the middle: the text after the caret becomes the next item and
    // keeps the children.
    const first = `${lineText.slice(0, item.textStart)}${before.trimEnd()}`;
    const second = `${siblingPrefix}${after.trimStart()}`;
    const caretPos = lineStart + first.length + 1 + siblingPrefix.length;
    return {
        from: lineStart,
        to: lineStart + lineText.length,
        insert: `${first}\n${second}`,
        anchor: caretPos,
        head: caretPos,
    };
}

// Shift-Enter: a line break inside the item, the next line lined up with
// its text.
export function softBreak(sel: TextSelection): TextEdit | null {
    const outline = parseOutline(sel.doc);
    const line = lineOf(sel.doc, sel.from);
    if (outline.code[line]) return null;
    const index = outline.owner[line];
    if (index === null) return null;
    const pad = ' '.repeat(contentColumn(outline.items[index]));
    const insert = `\n${pad}`;
    const at = sel.from + insert.length;
    return { from: sel.from, to: sel.to, insert, anchor: at, head: at };
}

// Backspace with the caret right at the start of an item's text: removes
// the checkbox first; deletes an empty item; merges an item without
// children into the line above; leaves the list when nothing is above.
// Null elsewhere (ordinary Backspace).
export function backspaceItem(
    sel: TextSelection,
    options: OutlineOptions = {}
): TextEdit | null {
    if (sel.from !== sel.to) return null;
    const outline = parseOutline(sel.doc);
    const caret = toCaret(sel.doc, sel.from);
    const index = outline.owner[caret.line];
    if (index === null || outline.code[caret.line]) return null;
    const item = outline.items[index];
    if (item.line !== caret.line || caret.col !== item.textStart) return null;
    const starts = lineStarts(outline.lines);
    const lineStart = starts[caret.line];
    if (isZoomRoot(options, item.line)) return NOOP(sel);
    if (item.box) {
        const boxAt = lineStart + item.indent + item.marker.length;
        return {
            from: boxAt,
            to: boxAt + item.box.length,
            insert: '',
            anchor: boxAt,
            head: boxAt,
        };
    }
    if (item.children.length > 0 || item.contentEnd > item.line)
        return NOOP(sel);
    const above = caret.line > 0 ? caret.line - 1 : null;
    const aboveOwner = above === null ? null : outline.owner[above];
    const canMerge =
        above !== null &&
        outline.lines[above].trim() !== '' &&
        !outline.code[above] &&
        aboveOwner !== null &&
        !(options.rootLine != null && above! < options.rootLine);
    if (canMerge) {
        const join = starts[above!] + outline.lines[above!].length;
        return {
            from: join,
            to: lineStart + item.textStart,
            insert: '',
            anchor: join,
            head: join,
        };
    }
    // Nothing to merge into: the item becomes a plain line.
    return {
        from: lineStart,
        to: lineStart + item.textStart,
        insert: '',
        anchor: lineStart,
        head: lineStart,
    };
}

// Ctrl-Enter: no box → [ ] → [x] → [ ] on the selected items; a plain line
// becomes a "- [ ]" item.
export function toggleItemBox(sel: TextSelection): TextEdit | null {
    const outline = parseOutline(sel.doc);
    if (inCode(outline, sel)) return null;
    const first = lineOf(sel.doc, sel.from);
    const last = lineOf(
        sel.doc,
        sel.to > sel.from && sel.doc[sel.to - 1] === '\n' ? sel.to - 1 : sel.to
    );
    const deltas = new Map<number, { at: number; delta: number }>();
    const next = outline.lines.slice(first, last + 1).map((line, k) => {
        const n = first + k;
        const index = outline.owner[n];
        const item = index === null ? null : outline.items[index];
        if (item && item.line === n) {
            const at = item.indent + item.marker.length;
            const box =
                item.box === ''
                    ? '[ ] '
                    : item.box === '[ ] '
                      ? '[x] '
                      : '[ ] ';
            deltas.set(n, { at, delta: box.length - item.box.length });
            return line.slice(0, at) + box + line.slice(at + item.box.length);
        }
        if (item || outline.code[n]) return line;
        if (line.trim() === '' && first !== last) return line;
        if (/^\s*(#{1,6}\s|>|\|)/.test(line)) return line;
        const ws = leading(line);
        deltas.set(n, { at: ws.length, delta: 6 });
        return `${ws}- [ ] ${line.slice(ws.length)}`;
    });
    return rewrite(outline, first, last, next, sel, (c) => {
        const d = deltas.get(c.line);
        if (!d) return c;
        return { line: c.line, col: c.col >= d.at ? c.col + d.delta : c.col };
    });
}

// The range a fold hides: from the end of the item's first line to the end
// of its subtree. Null when nothing is under the first line.
export function foldRange(
    doc: string,
    line: number
): { from: number; to: number } | null {
    const outline = parseOutline(doc);
    const index = itemAtLine(outline, line);
    if (index < 0) return null;
    const item = outline.items[index];
    let end = item.end;
    while (end > item.line && outline.lines[end].trim() === '') end--;
    if (end === item.line) return null;
    const starts = lineStarts(outline.lines);
    return {
        from: starts[item.line] + outline.lines[item.line].length,
        to: starts[end] + outline.lines[end].length,
    };
}

// A key per item that survives edits elsewhere: its text, plus how many
// items above have the same text. Fold state is stored under these keys.
export function itemKeys(outline: Outline): Map<number, string> {
    const seen = new Map<string, number>();
    const keys = new Map<number, string>();
    for (const item of outline.items) {
        const text = item.text.trim().toLowerCase();
        const n = seen.get(text) ?? 0;
        seen.set(text, n + 1);
        keys.set(item.line, `${text}#${n}`);
    }
    return keys;
}

// The item lines from the top down to the item on `line` (inclusive).
export function ancestorLines(outline: Outline, line: number): number[] {
    const index = itemAtLine(outline, line);
    if (index < 0) return [];
    const out: number[] = [];
    for (
        let i: number | null = index;
        i !== null;
        i = outline.items[i].parent
    ) {
        out.unshift(outline.items[i].line);
    }
    return out;
}

// The item on `line` and its children as text of their own, unindented.
export function subtreeText(doc: string, line: number): string | null {
    const outline = parseOutline(doc);
    const index = itemAtLine(outline, line);
    if (index < 0) return null;
    const item = outline.items[index];
    return outline.lines
        .slice(item.line, item.end + 1)
        .map((l) => shiftLine(l, -item.indent))
        .join('\n');
}

// Puts `text` (as returned by subtreeText, edited) back in place of the
// subtree on `line`.
export function replaceSubtree(
    doc: string,
    line: number,
    text: string
): string {
    const outline = parseOutline(doc);
    const index = itemAtLine(outline, line);
    if (index < 0) return doc;
    const item = outline.items[index];
    const next = text.split('\n').map((l) => shiftLine(l, item.indent));
    return [
        ...outline.lines.slice(0, item.line),
        ...next,
        ...outline.lines.slice(item.end + 1),
    ].join('\n');
}

// An item's text without Markdown, as a task name.
export function plainItemText(text: string): string {
    return text
        .replace(/\[\[\s*task:\s*([^[\]\n]+?)\]\]/gi, '$1')
        .replace(/\[\[([^[\]\n]+?)\]\]/g, '$1')
        .replace(/@\[([^\]\n]*)\]\(person:[0-9a-z-]+\)/gi, '$1')
        .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
        .replace(/(\*\*|__|~~|`)/g, '')
        .replace(/(^|\W)[*_]([^*_\n]+)[*_](?=\W|$)/g, '$1$2')
        .replace(/[[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 255);
}

const ONLY_TASK_LINK = /^\s*\[\[\s*task:[^[\]\n]+\]\]\s*$/i;

// The item at the caret turned into a linked task: the task's name and the
// edit that replaces the item's text with [[task:Name]] (box kept). Null
// outside an item, on an empty item, or when it already is a task link.
export function taskFromItem(
    sel: TextSelection
): { name: string; edit: TextEdit } | null {
    const outline = parseOutline(sel.doc);
    const line = lineOf(sel.doc, sel.from);
    const index = outline.owner[line];
    if (index === null || outline.code[line]) return null;
    const item = outline.items[index];
    if (ONLY_TASK_LINK.test(item.text)) return null;
    const name = plainItemText(item.text);
    if (!name) return null;
    const starts = lineStarts(outline.lines);
    const from = starts[item.line] + item.textStart;
    const to = starts[item.line] + outline.lines[item.line].length;
    const insert = `[[task:${name}]]`;
    return {
        name,
        edit: {
            from,
            to,
            insert,
            anchor: from + insert.length,
            head: from + insert.length,
        },
    };
}

// What typing `text` on an empty top-level line should insert: "- " first,
// so every new line is a bullet. Characters that start Markdown blocks of
// their own (headings, quotes, tables, code, a bullet typed by hand) are
// left alone.
export function autoBullet(
    doc: string,
    pos: number,
    text: string
): string | null {
    if (text.length === 0 || /^[\s#>|`~\-*+]/.test(text)) return null;
    const outline = parseOutline(doc);
    const line = lineOf(doc, pos);
    if (outline.lines[line] !== '' || outline.code[line]) return null;
    // Inside an item (a blank line of its content): leave it.
    if (outline.owner[line] !== null) return null;
    const above = line > 0 ? outline.lines[line - 1] : '';
    if (/^\s*\|/.test(above)) return null;
    return `- ${text}`;
}
