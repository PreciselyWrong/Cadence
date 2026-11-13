'use strict';

// The day strip of a week proposal (docs/47-proposals.md, Week sheet v2): per
// day, the planned tasks, the calendar events, the work hours and the minutes
// left in them. Computed at each read, never stored or sent to the agent.
// Pure: the caller reads the plans, events and hours of each day.
const { cleanText } = require('./text');

// A plan line without a duration counts this long.
const DEFAULT_TASK_MINUTES = 60;
const TITLE_MAX = 200;

const pad = (value) => String(value).padStart(2, '0');

const hhmm = (minute) =>
    Number.isInteger(minute)
        ? `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
        : null;

// Work of the day: its focus blocks when it has any, else the day hours. The
// `work` envelope runs from the first block to the last; the label is the
// first block's. Null when the day has neither.
function workOf(focusBlocks, dayHours) {
    if (focusBlocks.length > 0) {
        const blocks = [...focusBlocks].sort((a, b) => a.start - b.start);
        return {
            spans: blocks.map((block) => [block.start, block.end]),
            work: {
                start: hhmm(blocks[0].start),
                end: hhmm(Math.max(...blocks.map((block) => block.end))),
                label: blocks[0].label ?? null,
            },
        };
    }
    if (!dayHours) return { spans: [], work: null };
    return {
        spans: [[dayHours.start, dayHours.end]],
        work: {
            start: hhmm(dayHours.start),
            end: hhmm(dayHours.end),
            label: null,
        },
    };
}

// Minutes covered by a set of [start, end) intervals, overlaps counted once.
function coveredMinutes(intervals) {
    const sorted = intervals
        .filter(([start, end]) => end > start)
        .sort((a, b) => a[0] - b[0]);
    let total = 0;
    let cursor = -Infinity;
    for (const [start, end] of sorted) {
        const from = Math.max(start, cursor);
        if (end > from) total += end - from;
        cursor = Math.max(cursor, end);
    }
    return total;
}

// Work minutes left once the busy timed events inside them are taken out.
// All-day events and free (not busy) events do not take time.
function capacityOf(spans, events) {
    const busy = events
        .filter((event) => !event.all_day && event.busy)
        .filter((event) => Number.isInteger(event.start_minute))
        .map((event) => [
            event.start_minute,
            event.end_minute ?? event.start_minute,
        ]);
    return spans.reduce((total, [start, end]) => {
        const inside = busy.map(([from, to]) => [
            Math.max(start, from),
            Math.min(end, to),
        ]);
        return total + (end - start) - coveredMinutes(inside);
    }, 0);
}

const eventOf = (event) => {
    const title = cleanText(event.title, TITLE_MAX);
    if (event.all_day) return { title, start: null, end: null, all_day: true };
    return {
        title,
        start: hhmm(event.start_minute),
        end: hhmm(event.end_minute ?? event.start_minute),
        all_day: false,
    };
};

const itemOf = (item) => ({
    task_uid: item.task_uid,
    name: item.name,
    minutes: item.duration_minutes ?? DEFAULT_TASK_MINUTES,
});

// One entry per input day, in order. `items`: the day's plan lines
// ({ task_uid, name, duration_minutes }); `events`: the day's calendar events
// (busy, all_day, start_minute, end_minute, title); `focusBlocks`: the blocks
// of the day ({ start, end, label }); `dayHours`: { start, end } or null.
function weekDays(inputs) {
    return inputs.map(({ date, items, events, focusBlocks, dayHours }) => {
        const { spans, work } = workOf(focusBlocks, dayHours);
        const planned = items.map(itemOf);
        return {
            date,
            load_minutes: planned.reduce((sum, item) => sum + item.minutes, 0),
            capacity_minutes: capacityOf(spans, events),
            items: planned,
            events: events.map(eventOf),
            work,
        };
    });
}

module.exports = { weekDays, DEFAULT_TASK_MINUTES };
