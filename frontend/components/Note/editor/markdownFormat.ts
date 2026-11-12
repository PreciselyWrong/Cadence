// Formatting commands as pure functions on Markdown text: they take the
// text and the selection and return one replacement plus the selection to
// keep. The CodeMirror editor applies them (editorCommands.ts); any other
// editing surface (a textarea, an outliner row) can too. Each works inside
// a list item: line commands keep the indent and bullet, blocks (tables,
// code) are indented under the bullet.

export interface TextSelection {
    doc: string;
    from: number;
    to: number;
}

export interface TextEdit {
    from: number;
    to: number;
    insert: string;
    // The selection after the edit, in the new text.
    anchor: number;
    head: number;
}

export type LineKind = 'bullet' | 'number' | 'task' | 'quote';

const LIST_MARKER = /^(\s*)((?:[-*+]|\d+[.)])\s+)(\[[ xX]\]\s+)?/;
const LINE_PREFIX = /^(\s*)(>\s?)?((?:[-*+]|\d+[.)])\s+)?(\[[ xX]\]\s+)?/;
const HEADING = /^(#{1,6})\s+/;

const lineStart = (doc: string, pos: number) =>
    doc.lastIndexOf('\n', pos - 1) + 1;
const lineEnd = (doc: string, pos: number) => {
    const end = doc.indexOf('\n', pos);
    return end === -1 ? doc.length : end;
};

// The full lines the selection touches.
const selectedLines = ({ doc, from, to }: TextSelection) => {
    const start = lineStart(doc, from);
    // A selection ending at the very start of a line leaves that line out.
    const last = to > from && doc[to - 1] === '\n' ? to - 1 : to;
    const end = lineEnd(doc, Math.max(last, start));
    return { start, end, lines: doc.slice(start, end).split('\n') };
};

const replaceLines = (
    sel: TextSelection,
    map: (lines: string[]) => string[]
): TextEdit => {
    const { start, end, lines } = selectedLines(sel);
    const insert = map(lines).join('\n');
    return {
        from: start,
        to: end,
        insert,
        anchor: start + insert.length,
        head: start + insert.length,
    };
};

// Wraps the selection in `open`/`close`, or unwraps it when it (or the text
// right around it) is already wrapped. With nothing selected, the caret
// lands between the markers.
export function toggleWrap(
    sel: TextSelection,
    open: string,
    close: string = open
): TextEdit {
    const { doc, from, to } = sel;
    const selected = doc.slice(from, to);
    if (
        selected.length > open.length + close.length &&
        selected.startsWith(open) &&
        selected.endsWith(close)
    ) {
        const inner = selected.slice(
            open.length,
            selected.length - close.length
        );
        return {
            from,
            to,
            insert: inner,
            anchor: from,
            head: from + inner.length,
        };
    }
    if (
        from >= open.length &&
        doc.slice(from - open.length, from) === open &&
        doc.slice(to, to + close.length) === close
    ) {
        return {
            from: from - open.length,
            to: to + close.length,
            insert: selected,
            anchor: from - open.length,
            head: to - open.length,
        };
    }
    return {
        from,
        to,
        insert: `${open}${selected}${close}`,
        anchor: from + open.length,
        head: to + open.length,
    };
}

// Sets the heading level of the caret's line, or removes it when the line
// already has that level. A bullet stays in front of the heading marks.
export function toggleHeading(sel: TextSelection, level: number): TextEdit {
    return replaceLines(sel, (lines) =>
        lines.map((line) => {
            const lead = line.match(LIST_MARKER)?.[0] ?? line.match(/^\s*/)![0];
            const rest = line.slice(lead.length);
            const current = rest.match(HEADING);
            const text = current ? rest.slice(current[0].length) : rest;
            if (current && current[1].length === level) return lead + text;
            return `${lead}${'#'.repeat(level)} ${text}`;
        })
    );
}

// One heading button: plain → H1 → H2 → H3 → plain, on the caret's line.
export function cycleHeading(sel: TextSelection): TextEdit {
    const line = sel.doc.slice(
        lineStart(sel.doc, sel.from),
        lineEnd(sel.doc, sel.from)
    );
    const lead = line.match(LIST_MARKER)?.[0] ?? line.match(/^\s*/)![0];
    const level = line.slice(lead.length).match(HEADING)?.[1].length ?? 0;
    return level >= 3 ? toggleHeading(sel, 3) : toggleHeading(sel, level + 1);
}

const prefixFor = (kind: LineKind, index: number) =>
    kind === 'bullet'
        ? '- '
        : kind === 'number'
          ? `${index + 1}. `
          : kind === 'task'
            ? '- [ ] '
            : '> ';

const hasKind = (line: string, kind: LineKind) => {
    const m = line.match(LINE_PREFIX)!;
    if (kind === 'quote') return !!m[2];
    if (kind === 'task') return !!m[4];
    if (!m[3] || m[4]) return false;
    return kind === 'number' ? /\d/.test(m[3]) : !/\d/.test(m[3]);
};

// Turns the selected lines into a bulleted, numbered, checkbox list or a
// quote, or back into plain lines when they all already are one. The
// indent of nested items is kept.
export function toggleLinePrefix(sel: TextSelection, kind: LineKind): TextEdit {
    return replaceLines(sel, (lines) => {
        const filled = lines.filter((line) => line.trim() !== '');
        const remove =
            filled.length > 0 && filled.every((l) => hasKind(l, kind));
        let index = 0;
        return lines.map((line) => {
            if (line.trim() === '' && lines.length > 1) return line;
            const m = line.match(LINE_PREFIX)!;
            const [, indent, quote = '', marker = '', box = ''] = m;
            const text = line.slice(m[0].length);
            if (kind === 'quote') {
                const body = `${marker}${box}${text}`;
                return remove ? `${indent}${body}` : `${indent}> ${body}`;
            }
            if (remove) return `${indent}${quote}${text}`;
            return `${indent}${quote}${prefixFor(kind, index++)}${text}`;
        });
    });
}

// The indent a block (table, code) needs to stay inside the caret's list
// item: the width of its bullet.
const blockIndent = (doc: string, pos: number) => {
    const line = doc.slice(lineStart(doc, pos), lineEnd(doc, pos));
    const m = line.match(LIST_MARKER);
    if (m) return ' '.repeat(m[0].length);
    return line.match(/^\s*/)![0];
};

// Inserts `lines` as a block of its own after the caret's line, indented to
// stay in the same list item, with blank lines around it as Markdown needs.
const insertBlock = (
    sel: TextSelection,
    lines: string[],
    caretLine: number,
    caretColumn: number
): TextEdit => {
    const { doc, to } = sel;
    const end = lineEnd(doc, to);
    const indent = blockIndent(doc, to);
    const currentLine = doc.slice(lineStart(doc, to), end);
    const before = currentLine.trim() === '' ? '' : '\n\n';
    const after = end < doc.length && doc[end + 1] !== '\n' ? '\n' : '';
    const block = lines.map((l) => indent + l);
    const from = currentLine.trim() === '' ? lineStart(doc, to) : end;
    const insert = `${before}${block.join('\n')}${after}`;
    const caret =
        from +
        before.length +
        block.slice(0, caretLine).reduce((n, l) => n + l.length + 1, 0) +
        indent.length +
        caretColumn;
    return { from, to: end, insert, anchor: caret, head: caret };
};

// Inline code for a selection within a line; the selected lines fenced
// as a code block otherwise; an empty block at the caret with nothing
// selected.
export function toggleCode(sel: TextSelection): TextEdit {
    const selected = sel.doc.slice(sel.from, sel.to);
    if (selected.length > 0 && !selected.includes('\n')) {
        return toggleWrap(sel, '`');
    }
    if (!selected) return insertBlock(sel, ['```', '', '```'], 1, 0);
    return replaceLines(sel, (lines) => {
        const indent = lines[0].match(/^\s*/)![0];
        return [`${indent}\`\`\``, ...lines, `${indent}\`\`\``];
    });
}

// [selection](url) with "url" selected, ready to be typed over; a selected
// address becomes the link target instead.
export function insertLink(sel: TextSelection): TextEdit {
    const { doc, from, to } = sel;
    const selected = doc.slice(from, to);
    if (/^https?:\/\/\S+$/.test(selected)) {
        const insert = `[](${selected})`;
        return { from, to, insert, anchor: from + 1, head: from + 1 };
    }
    const text = selected || 'link';
    const insert = `[${text}](url)`;
    const urlAt = from + text.length + 3;
    return { from, to, insert, anchor: urlAt, head: urlAt + 3 };
}

// Replaces the selection with `text`, caret after it.
export function insertText(sel: TextSelection, text: string): TextEdit {
    const at = sel.from + text.length;
    return { from: sel.from, to: sel.to, insert: text, anchor: at, head: at };
}

const tableRow = (cells: string[]) => `| ${cells.join(' | ')} |`;

// A `rows` × `cols` table (a header row plus `rows - 1` body rows), caret
// in the first header cell.
export function insertTable(
    sel: TextSelection,
    rows: number,
    cols: number,
    headerLabel: (col: number) => string = (col) => `Column ${col + 1}`
): TextEdit {
    const r = Math.max(1, Math.min(20, Math.floor(rows)));
    const c = Math.max(1, Math.min(12, Math.floor(cols)));
    const header = Array.from({ length: c }, (_, i) => headerLabel(i));
    const lines = [
        tableRow(header),
        tableRow(header.map(() => '---')),
        ...Array.from({ length: r - 1 }, () =>
            tableRow(Array.from({ length: c }, () => ' '))
        ),
    ];
    return insertBlock(sel, lines, 0, 2);
}

interface TableInfo {
    start: number;
    end: number;
    indent: string;
    rows: string[][];
    // Row of the caret (0 = header, 1 = separator) and its cell.
    row: number;
    col: number;
}

const TABLE_LINE = /^\s*\|.*\|\s*$/;
const SEPARATOR = /^:?-{1,}:?$/;

const splitRow = (line: string) =>
    line
        .trim()
        .replace(/^\||\|$/g, '')
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim());

// The GFM table around `pos`, if any.
export function tableAt(doc: string, pos: number): TableInfo | null {
    const lines = doc.split('\n');
    let offset = 0;
    let caretLine = 0;
    for (let i = 0; i < lines.length; i++) {
        if (pos <= offset + lines[i].length) {
            caretLine = i;
            break;
        }
        offset += lines[i].length + 1;
    }
    if (!TABLE_LINE.test(lines[caretLine] ?? '')) return null;
    let first = caretLine;
    while (first > 0 && TABLE_LINE.test(lines[first - 1])) first--;
    let last = caretLine;
    while (last < lines.length - 1 && TABLE_LINE.test(lines[last + 1])) last++;
    const rows = lines.slice(first, last + 1).map(splitRow);
    if (rows.length < 2 || !rows[1].every((cell) => SEPARATOR.test(cell))) {
        return null;
    }
    const start = lines.slice(0, first).reduce((n, l) => n + l.length + 1, 0);
    const end = start + lines.slice(first, last + 1).join('\n').length;
    const lineOffset = lines
        .slice(0, caretLine)
        .reduce((n, l) => n + l.length + 1, 0);
    const before = lines[caretLine].slice(0, pos - lineOffset);
    const col = Math.max(0, (before.match(/(?<!\\)\|/g)?.length ?? 1) - 1);
    return {
        start,
        end,
        indent: lines[first].match(/^\s*/)![0],
        rows,
        row: caretLine - first,
        col: Math.min(col, rows[0].length - 1),
    };
}

const writeTable = (
    table: TableInfo,
    rows: string[][],
    caretRow: number,
    caretCol: number
): TextEdit => {
    const lines = rows.map((cells) => table.indent + tableRow(cells));
    const insert = lines.join('\n');
    const before = lines
        .slice(0, caretRow)
        .reduce((n, l) => n + l.length + 1, 0);
    const cellOffset =
        table.indent.length +
        2 +
        rows[caretRow].slice(0, caretCol).reduce((n, c) => n + c.length + 3, 0);
    const caret = table.start + before + cellOffset;
    return {
        from: table.start,
        to: table.end,
        insert,
        anchor: caret,
        head: caret,
    };
};

export function addTableRow(sel: TextSelection): TextEdit | null {
    const table = tableAt(sel.doc, sel.from);
    if (!table) return null;
    const at = Math.max(2, table.row + 1);
    const rows = [...table.rows];
    rows.splice(
        at,
        0,
        rows[0].map(() => '')
    );
    return writeTable(table, rows, at, 0);
}

export function removeTableRow(sel: TextSelection): TextEdit | null {
    const table = tableAt(sel.doc, sel.from);
    if (!table || table.row < 2) return null;
    const rows = table.rows.filter((_, i) => i !== table.row);
    return writeTable(
        table,
        rows,
        Math.min(table.row, rows.length - 1),
        table.col
    );
}

export function addTableColumn(sel: TextSelection): TextEdit | null {
    const table = tableAt(sel.doc, sel.from);
    if (!table) return null;
    const at = table.col + 1;
    const rows = table.rows.map((cells, i) => {
        const next = [...cells];
        next.splice(at, 0, i === 1 ? '---' : '');
        return next;
    });
    return writeTable(table, rows, table.row === 1 ? 0 : table.row, at);
}

export function removeTableColumn(sel: TextSelection): TextEdit | null {
    const table = tableAt(sel.doc, sel.from);
    if (!table || table.rows[0].length < 2) return null;
    const rows = table.rows.map((cells) =>
        cells.filter((_, i) => i !== table.col)
    );
    return writeTable(
        table,
        rows,
        table.row === 1 ? 0 : table.row,
        Math.min(table.col, rows[0].length - 1)
    );
}

// Applies an edit to plain text (for surfaces without their own model).
export const applyEdit = (doc: string, edit: TextEdit) =>
    doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
