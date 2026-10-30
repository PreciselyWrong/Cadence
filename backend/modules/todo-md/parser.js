'use strict';

const crypto = require('crypto');

// Reads the TODO.md layout the owner uses: `## Section` headings and
// top-level `- ` bullets, each possibly followed by indented lines (a note
// and nested sub-bullets). Parsing never rewrites anything: every item
// keeps its byte offsets so the writer can touch only the lines it means to.

const DONE_SECTIONS = new Set(['done']);
const DROPPED_SECTIONS = new Set(['dropped']);

const HEADING = /^##[ \t]+(.*?)[ \t#]*$/;
const FENCE = /^(```|~~~)/;
const BULLET = /^([-*+])([ \t]+)(?:\[([ xX])\](?:[ \t]+|$))?(.*)$/;

const sha = (value) =>
    crypto.createHash('sha1').update(value).digest('hex').slice(0, 40);

// Display form of a bullet: emphasis, code spans, links and strikethrough
// lose their markers, whitespace is collapsed.
function stripMarkdown(text) {
    return text
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/(\*\*|__)(.+?)\1/g, '$2')
        .replace(/~~(.+?)~~/g, '$1')
        .replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, '$1$2')
        .replace(/(^|[^\w_])_([^_\s][^_]*?)_(?!\w)/g, '$1$2')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitLines(text) {
    const lines = [];
    let start = 0;
    while (start <= text.length) {
        const newline = text.indexOf('\n', start);
        if (newline === -1) {
            if (start < text.length) {
                lines.push({ start, end: text.length, next: text.length });
            }
            break;
        }
        const end =
            newline > start && text[newline - 1] === '\r'
                ? newline - 1
                : newline;
        lines.push({ start, end, next: newline + 1 });
        start = newline + 1;
    }
    return lines;
}

function dedent(lines) {
    const indents = lines
        .filter((l) => l.trim() !== '')
        .map((l) => l.match(/^[ \t]*/)[0].length);
    const strip = indents.length ? Math.min(...indents) : 0;
    return lines.map((l) => l.slice(Math.min(strip, l.length)));
}

function parseTodoMd(text) {
    const firstNewline = text.indexOf('\n');
    const eol =
        firstNewline > 0 && text[firstNewline - 1] === '\r' ? '\r\n' : '\n';
    const lines = splitLines(text).map((l) => ({
        ...l,
        text: text.slice(l.start, l.end),
    }));

    const sections = [];
    const items = [];
    let section = null;
    let item = null;
    let fenced = false;

    const closeItem = () => {
        if (!item) return;
        // Trailing blank lines are not part of the bullet.
        let last = item.lastLine;
        while (last > item.firstLine && lines[last].text.trim() === '') {
            last -= 1;
        }
        item.lastLine = last;
        item.end = lines[last].end;
        item = null;
    };

    lines.forEach((line, index) => {
        const raw = line.text;
        const indented = /^[ \t]/.test(raw);

        if (fenced) {
            if (!indented && FENCE.test(raw)) fenced = false;
            return;
        }
        if (!indented && FENCE.test(raw)) {
            closeItem();
            fenced = true;
            return;
        }

        if (item && (indented || raw.trim() === '')) {
            item.lastLine = index;
            return;
        }

        const heading = !indented && HEADING.exec(raw);
        if (heading) {
            closeItem();
            section = {
                name: heading[1].trim(),
                headingLine: index,
                lastLine: index,
                items: [],
            };
            sections.push(section);
            return;
        }

        const bullet = section && !indented ? BULLET.exec(raw) : null;
        if (bullet && bullet[4].trim() !== '') {
            closeItem();
            item = {
                section: section.name,
                firstLine: index,
                lastLine: index,
                start: line.start,
                marker: bullet[1],
                checkbox: bullet[3] === undefined ? null : bullet[3],
                raw: bullet[4].trim(),
            };
            items.push(item);
            section.items.push(item);
            return;
        }

        closeItem();
        if (section) section.lastLine = index;
    });
    closeItem();

    sections.forEach((s, i) => {
        s.endLine =
            i + 1 < sections.length
                ? sections[i + 1].headingLine
                : lines.length;
        // Last line that has content, used to place an appended bullet.
        let last = s.endLine - 1;
        while (last > s.headingLine && lines[last].text.trim() === '')
            last -= 1;
        s.lastContentLine = last;
        s.lastContentEnd = lines[last].end;
    });

    const occurrences = new Map();
    for (const it of items) {
        const sectionKey = it.section.toLowerCase();
        it.name = stripMarkdown(it.raw);
        it.note = dedent(
            lines.slice(it.firstLine + 1, it.lastLine + 1).map((l) => l.text)
        ).join('\n');
        it.dropped = DROPPED_SECTIONS.has(sectionKey);
        it.done =
            DONE_SECTIONS.has(sectionKey) ||
            (it.checkbox !== null && it.checkbox.toLowerCase() === 'x');

        const slot = `${sectionKey}\n${it.name}`;
        it.occurrence = occurrences.get(slot) || 0;
        occurrences.set(slot, it.occurrence + 1);
        it.key = sha(`${slot}\n${it.occurrence}`);
    }

    return {
        eol,
        endsWithNewline: text.endsWith('\n'),
        lines,
        sections,
        items,
    };
}

module.exports = {
    parseTodoMd,
    stripMarkdown,
    DONE_SECTIONS,
    DROPPED_SECTIONS,
};
