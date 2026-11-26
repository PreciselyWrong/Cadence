'use strict';

const crypto = require('crypto');

// Reads the TODO.md layout the owner uses: `## Section` headings and
// top-level `- ` bullets, each possibly followed by indented lines (a note
// and nested sub-bullets). Parsing never rewrites anything: every item
// keeps its byte offsets so the writer can touch only the lines it means to.

const DONE_SECTIONS = new Set(['done']);
const DROPPED_SECTIONS = new Set(['dropped']);
// Handoff sections written by session-closing tools (e.g. `## État actuel`)
// describe the project's live state rather than tasks.
const HANDOFF_SECTIONS = new Set(['etat actuel', 'current state', 'handoff']);
const EMPTY_BLOCKER = /^(aucun[e]?|none|rien|ras|n\/a|-|null)$/i;

const normalizeHeading = (name) =>
    String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const isHandoffSection = (name) => HANDOFF_SECTIONS.has(normalizeHeading(name));

function extractHandoff(section, lines) {
    if (!section) return null;
    const bodyLines = lines
        .slice(section.headingLine + 1, section.endLine)
        .map((l) => l.text);
    let start = 0;
    let end = bodyLines.length;
    while (start < end && bodyLines[start].trim() === '') start += 1;
    while (end > start && bodyLines[end - 1].trim() === '') end -= 1;
    const trimmed = bodyLines.slice(start, end);
    if (trimmed.length === 0) return null;

    const result = {
        section: section.name,
        branch: null,
        tree: null,
        tests: null,
        blockers: null,
        next_action: null,
        raw: trimmed.join('\n'),
    };

    const assign = (rawKey, value) => {
        const key = normalizeHeading(rawKey);
        if (!value) return;
        if (key.includes('branche') || key.includes('branch')) {
            result.branch = value;
        } else if (key.includes('arbre') || key.includes('tree')) {
            result.tree = value;
        } else if (key.includes('test') || key.includes('verif')) {
            result.tests = value;
        } else if (key.includes('bloqueur') || key.includes('blocker')) {
            result.blockers = EMPTY_BLOCKER.test(value) ? null : value;
        } else if (
            key.includes('prochaine action') ||
            key.includes('next action') ||
            key.includes('next step')
        ) {
            result.next_action = value;
        }
    };

    for (const rawLine of trimmed) {
        const cleaned = stripMarkdown(
            rawLine.replace(/^\s*[-*+]\s+(?:\[[ xX]\]\s+)?/, '')
        );
        const sep = cleaned.indexOf(':');
        if (sep === -1) continue;
        const key = cleaned.slice(0, sep);
        const value = cleaned.slice(sep + 1).trim();
        // The compact format puts the tree state on the branch line:
        // "Branche: main | Arbre: propre". Other values keep their pipes.
        const tail = value.match(/^(.*?)\s+\|\s+([^:|]+):\s*(.+)$/);
        if (tail && /branch/.test(normalizeHeading(key))) {
            assign(key, tail[1].trim());
            assign(tail[2], tail[3].trim());
        } else {
            assign(key, value);
        }
    }

    return result;
}

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

// Inline metadata of a bullet line: `#tag`, `!high|!med|!low` and
// `@YYYY-MM-DD`, each a whole word. Code spans, links and URLs are masked
// first so `#anchor` or a token quoted in backticks stays text.
const PROTECTED =
    /`[^`]*`|!?\[[^\]]*\]\([^)]*\)|<[^>\s]+>|\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;
const CANDIDATE = /(?<=^|\s)[#!@]\S+(?=\s|$)/g;
const TAG_TOKEN = /^#([a-z0-9][a-z0-9_-]*)$/;
const PRIORITY_TOKEN = /^!(high|med|low)$/i;
const DUE_TOKEN = /^@(\d{4})-(\d{2})-(\d{2})$/;
const PRIORITIES = { high: 'high', med: 'medium', low: 'low' };

function isRealDate(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

// Returns the bullet text without its tokens, and what they say. The last
// priority or date wins; a token that does not parse (`#123`, `@2026-02-30`)
// is ordinary text.
function readInlineMetadata(raw) {
    const masked = raw.replace(PROTECTED, (m) => '\u0000'.repeat(m.length));
    const meta = { tags: [], priority: null, due_date: null };
    const cuts = [];
    for (const match of masked.matchAll(CANDIDATE)) {
        const token = match[0];
        const tag = TAG_TOKEN.exec(token);
        const priority = PRIORITY_TOKEN.exec(token);
        const due = DUE_TOKEN.exec(token);
        if (tag && !/^\d+$/.test(tag[1])) {
            if (!meta.tags.includes(tag[1])) meta.tags.push(tag[1]);
        } else if (priority) {
            meta.priority = PRIORITIES[priority[1].toLowerCase()];
        } else if (due && isRealDate(+due[1], +due[2], +due[3])) {
            meta.due_date = token.slice(1);
        } else {
            continue;
        }
        cuts.push([match.index, match.index + token.length]);
    }
    let text = '';
    let from = 0;
    for (const [start, end] of cuts) {
        text += raw.slice(from, start);
        from = end;
    }
    meta.text = text + raw.slice(from);
    return meta;
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

        const bullet =
            section && !indented && !isHandoffSection(section.name)
                ? BULLET.exec(raw)
                : null;
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
        const meta = readInlineMetadata(it.raw);
        // The name the bullet had before tokens were read, to adopt rows
        // imported then; a bullet made only of tokens keeps them as its name.
        it.legacyName = stripMarkdown(it.raw);
        it.name = stripMarkdown(meta.text) || it.legacyName;
        it.tags = meta.tags;
        it.priority = meta.priority;
        it.due_date = meta.due_date;
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

    const handoffSection = sections.find((s) => isHandoffSection(s.name));
    const handoff = extractHandoff(handoffSection, lines);

    return {
        eol,
        endsWithNewline: text.endsWith('\n'),
        lines,
        sections,
        items,
        handoff,
    };
}

module.exports = {
    parseTodoMd,
    stripMarkdown,
    readInlineMetadata,
    DONE_SECTIONS,
    DROPPED_SECTIONS,
    HANDOFF_SECTIONS,
    isHandoffSection,
};
