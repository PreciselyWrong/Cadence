'use strict';

// Links written in a note's content or a task's description:
//   [[Title]]                  a note, by title
//   [[task:Title]]             a task, by name
//   @[Name](person:<uid>)      a person, by uid
//   [text](/note/<uid>-slug), /notes/<uid>, /task/<uid>, /person/<uid>,
//   relative or on any http(s) host: the item of that uid.
// Text in code (fenced blocks and `inline`) holds no links.

const UID = '[0-9a-z]{15}';
const WIKILINK = /\[\[([^[\]\n]+?)\]\]/g;
const MENTION = new RegExp(`@\\[[^\\]\\n]*\\]\\(person:(${UID})\\)`, 'g');
const APP_PATH = new RegExp(
    `(?:https?://[^\\s/()]+)?/(note|notes|task|person)/(${UID})(?![0-9a-z])`,
    'g'
);
const TASK_PREFIX = /^task:\s*/i;
const PATH_TYPES = {
    note: 'note',
    notes: 'note',
    task: 'task',
    person: 'person',
};

// Replaces code with spaces so positions (and snippets) stay where they are.
function stripCode(text) {
    let fence = null;
    return text
        .split('\n')
        .map((line) => {
            const marker = line.match(/^\s*(```|~~~)/);
            if (fence) {
                if (marker && marker[1] === fence) fence = null;
                return ' '.repeat(line.length);
            }
            if (marker) {
                fence = marker[1];
                return ' '.repeat(line.length);
            }
            return line.replace(/`[^`]+`/g, (m) => ' '.repeat(m.length));
        })
        .join('\n');
}

const normalizeTitle = (title) => title.trim().toLowerCase();

// Each link once: { type, uid } or { type, title } (title lowercased).
function parseLinks(text) {
    if (!text || typeof text !== 'string') return [];
    const source = stripCode(text);
    const seen = new Set();
    const links = [];
    const add = (link, index) => {
        const key = `${link.type}:${link.uid ?? `title:${link.title}`}`;
        if (seen.has(key)) return;
        seen.add(key);
        links.push({ ...link, index });
    };

    for (const m of source.matchAll(WIKILINK)) {
        const raw = m[1].trim();
        if (!raw) continue;
        if (TASK_PREFIX.test(raw)) {
            const title = normalizeTitle(raw.replace(TASK_PREFIX, ''));
            if (title) add({ type: 'task', title }, m.index);
        } else {
            add({ type: 'note', title: normalizeTitle(raw) }, m.index);
        }
    }
    for (const m of source.matchAll(MENTION)) {
        add({ type: 'person', uid: m[1] }, m.index);
    }
    for (const m of source.matchAll(APP_PATH)) {
        add({ type: PATH_TYPES[m[1]], uid: m[2] }, m.index);
    }
    return links.sort((a, b) => a.index - b.index);
}

// The first link in `text` that points at `target` ({ type, uid, title }).
function findLinkTo(text, target) {
    const title = target.title ? normalizeTitle(target.title) : null;
    return (
        parseLinks(text).find(
            (link) =>
                link.type === target.type &&
                (link.uid ? link.uid === target.uid : link.title === title)
        ) || null
    );
}

// About `radius` characters of plain text around a link.
function snippetAround(text, index, radius = 60) {
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + radius);
    const plain = text
        .slice(start, end)
        .replace(/@\[([^\]\n]*)\]\(person:[0-9a-z]+\)/g, '@$1')
        .replace(/\[\[(?:task:\s*)?([^[\]\n]+?)\]\]/gi, '$1')
        .replace(/!?\[([^\]\n]*)\]\([^)\s]*\)/g, '$1')
        .replace(/[#>*_`~|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return `${start > 0 ? '… ' : ''}${plain}${end < text.length ? ' …' : ''}`;
}

module.exports = { parseLinks, findLinkTo, snippetAround, normalizeTitle };
