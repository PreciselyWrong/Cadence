'use strict';

// Calendar conflicts on the brief's days. Both are questions for the user:
// the engine cannot know whether a meeting can move.
const { texts, titleOf } = require('./texts');

const isTimed = (event) =>
    event.busy &&
    !event.all_day &&
    event.start_minute !== null &&
    event.start_minute !== undefined;

const endOf = (event) => event.end_minute ?? event.start_minute;

// Half-open intervals: a meeting ending at 10:00 does not clash with a
// block starting at 10:00.
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

// A timed busy event inside a focus block of its day.
function workHourConflicts(input) {
    const blocksByDate = input.focusBlocksByDate || {};
    const found = [];
    for (const event of (input.events || []).filter(isTimed)) {
        const block = (blocksByDate[event.date] || []).find((b) =>
            overlaps(event.start_minute, endOf(event), b.start, b.end)
        );
        if (block) found.push({ event, block });
    }
    return found;
}

// Two busy timed events of the same day that overlap, each pair once.
function overlappingEvents(input) {
    const byDate = new Map();
    for (const event of (input.events || []).filter(isTimed)) {
        if (!byDate.has(event.date)) byDate.set(event.date, []);
        byDate.get(event.date).push(event);
    }
    const pairs = [];
    for (const events of byDate.values()) {
        events.sort((a, b) => a.start_minute - b.start_minute);
        for (let i = 0; i < events.length; i++) {
            for (let j = i + 1; j < events.length; j++) {
                const a = events[i];
                const b = events[j];
                if (
                    overlaps(a.start_minute, endOf(a), b.start_minute, endOf(b))
                ) {
                    pairs.push({ a, b });
                }
            }
        }
    }
    return pairs;
}

// A recurring series is silenced as a whole; a single occurrence is not.
const targetOf = (event) =>
    event.series_ref
        ? { scope: 'series', ref: event.series_ref }
        : { scope: 'event', ref: event.ref };

function conflictCards(input) {
    const workCards = workHourConflicts(input).map(({ event }) => ({
        key: `work:${event.ref}`,
        type: 'event_in_work_hours',
        text: texts.card.workHours(titleOf(event.title)),
        task_uids: [],
        event_refs: [event.ref],
        question: {
            key: `work:${event.ref}`,
            text: texts.card.workHoursQuestion(titleOf(event.title)),
            target: targetOf(event),
        },
    }));
    const overlapCards = overlappingEvents(input).map(({ a, b }) => ({
        key: `conflict:${a.ref}:${b.ref}`,
        type: 'conflict',
        text: texts.card.conflict(titleOf(a.title), titleOf(b.title)),
        task_uids: [],
        event_refs: [a.ref, b.ref],
        question: {
            key: `conflict:${a.ref}:${b.ref}`,
            text: texts.card.conflictQuestion(titleOf(a.title)),
            target: targetOf(a),
        },
    }));
    return [...overlapCards, ...workCards];
}

module.exports = {
    workHourConflicts,
    overlappingEvents,
    conflictCards,
    targetOf,
};
