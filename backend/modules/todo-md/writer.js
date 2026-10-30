'use strict';

const { parseTodoMd, DONE_SECTIONS, DROPPED_SECTIONS } = require('./parser');

class TodoEditError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'TodoEditError';
        this.code = code;
    }
}

const singleLine = (value) =>
    String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();

// Pure text transforms. Each returns new text built from slices of the old
// one, so every byte it does not mean to change stays as it was.

// Adds `- name` (and an indented note) at the end of a section, creating the
// section at the end of the file when it is missing.
function appendTask(text, sectionName, name, { note } = {}) {
    const title = singleLine(name);
    if (!title)
        throw new TodoEditError('invalid_name', 'A task name is required');

    const parsed = parseTodoMd(text);
    const { eol } = parsed;
    const noteLines = String(note ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\s+$/, '')
        .split('\n')
        .filter((_, i, all) => all.length > 1 || all[0] !== '');
    const bullet = [
        `- ${title}`,
        ...noteLines.map((l) => (l ? `  ${l}` : '')),
    ].join(eol);

    if (text.trim() === '') {
        return `## ${singleLine(sectionName)}${eol}${eol}${bullet}${eol}`;
    }

    const wanted = singleLine(sectionName).toLowerCase();
    const section = parsed.sections.find(
        (s) => s.name.toLowerCase() === wanted
    );

    if (!section) {
        const last = parsed.lines
            .map((l, i) => ({ l, i }))
            .filter(({ l }) => l.text.trim() !== '')
            .pop();
        const at = last ? last.l.end : 0;
        return `${text.slice(0, at)}${eol}${eol}## ${singleLine(sectionName)}${eol}${eol}${bullet}${text.slice(at)}`;
    }

    if (section.items.length > 0) {
        const at = section.items[section.items.length - 1].end;
        return `${text.slice(0, at)}${eol}${bullet}${text.slice(at)}`;
    }
    const at = section.lastContentEnd;
    const afterProse = section.lastContentLine !== section.headingLine;
    return `${text.slice(0, at)}${eol}${afterProse ? eol : ''}${bullet}${text.slice(at)}`;
}

// Checks or unchecks the bullet with this identity key. Returns the new
// text, or null when it already is as asked.
function setItemDone(text, key, done) {
    const parsed = parseTodoMd(text);
    const item = parsed.items.find((i) => i.key === key);
    if (!item)
        throw new TodoEditError('not_found', 'Task not found in the file');

    const sectionKey = item.section.toLowerCase();
    if (
        !done &&
        (DONE_SECTIONS.has(sectionKey) || DROPPED_SECTIONS.has(sectionKey))
    ) {
        throw new TodoEditError(
            'not_reopenable',
            `A task in ${item.section} has to be moved out of it in the file`
        );
    }
    if (done === item.done) return null;
    if (done && DROPPED_SECTIONS.has(sectionKey)) {
        throw new TodoEditError(
            'not_reopenable',
            'A dropped task stays dropped'
        );
    }

    const line = parsed.lines[item.firstLine];
    const prefix = /^[-*+][ \t]+/.exec(line.text)[0];
    const afterPrefix = line.start + prefix.length;
    if (item.checkbox === null) {
        return `${text.slice(0, afterPrefix)}[x] ${text.slice(afterPrefix)}`;
    }
    const box = done ? 'x' : ' ';
    return `${text.slice(0, afterPrefix + 1)}${box}${text.slice(afterPrefix + 2)}`;
}

module.exports = { appendTask, setItemDone, TodoEditError };
