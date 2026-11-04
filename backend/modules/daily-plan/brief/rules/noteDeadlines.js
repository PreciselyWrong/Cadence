'use strict';

// A date written in a task's note can be the real deadline: "avant le 12
// novembre" while the task only has a later due date. The note is user
// text, so the finding is only ever a question about the task.
const chrono = require('chrono-node');
const { texts, titleOf } = require('./texts');

// French first: the notes are written in French. English only fills the gaps
// the French parser left (the same text matched twice is kept once).
const PARSERS = [chrono.fr, chrono.en];

const pad = (n) => String(n).padStart(2, '0');

function toDay(result) {
    const { start } = result;
    const year = start.get('year');
    const month = start.get('month');
    const day = start.get('day');
    if (!year || !month || !day) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
}

// Every date in the note, as YYYY-MM-DD. The reference is local noon of
// today's day in the user's timezone, so "lundi" and "le 12" resolve to the
// user's calendar whatever the server's own timezone is.
function datesInNote(note, today) {
    if (!note) return [];
    const [year, month, day] = today.split('-').map(Number);
    const reference = new Date(year, month - 1, day, 12);
    const found = [];
    for (const parser of PARSERS) {
        for (const result of parser.parse(note, reference, {
            forwardDate: true,
        })) {
            const end = result.index + result.text.length;
            if (found.some((f) => result.index < f.end && f.index < end))
                continue;
            const iso = toDay(result);
            if (iso) found.push({ index: result.index, end, day: iso });
        }
    }
    return found.map((f) => f.day);
}

// Only dates that are still ahead and earlier than the due date (or any
// future date when there is no due date) are worth a question. The earliest
// one is the one asked about.
function deadlineCards(input) {
    const cards = [];
    for (const task of input.tasks) {
        const days = datesInNote(task.note, input.today)
            .filter(
                (day) =>
                    day >= input.today &&
                    (!task.due_date || day < task.due_date)
            )
            .sort();
        if (!days.length) continue;
        const day = days[0];
        const title = titleOf(task.name);
        const key = `deadline:${task.uid}:${day}`;
        cards.push({
            key,
            type: 'deadline_in_note',
            text: texts.card.deadlineInNote(title, day, task.due_date || null),
            task_uids: [task.uid],
            event_refs: [],
            question: {
                key,
                text: texts.card.deadlineQuestion(title, day),
                target: { scope: 'task', ref: task.uid },
            },
        });
    }
    return cards;
}

module.exports = { datesInNote, deadlineCards };
