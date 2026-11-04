'use strict';

// Planned minutes per day and the evening capacity they are compared to.
// Both are hypotheses: estimates are rarely real, so the brief always says
// so (hypothesis: true) and the threshold only ever raises a question.
const { weekday } = require('./dates');
const { texts } = require('./texts');

// Used when a task has no estimate. Shown as estimated so the total is
// never silently understated.
const DEFAULT_TASK_MINUTES = 30;
const MINUTES_PER_DAY = 24 * 60;

// 'HH:mm' -> minutes after midnight, null when malformed.
function parseClock(hhmm) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    if (!match) return null;
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return minutes <= MINUTES_PER_DAY ? minutes : null;
}

function taskMinutes(task) {
    const known =
        Number.isInteger(task.estimated_minutes) && task.estimated_minutes > 0;
    return {
        minutes: known ? task.estimated_minutes : DEFAULT_TASK_MINUTES,
        estimated: !known,
    };
}

// Open tasks that land on `date`: due that day or planned on it. A task
// both due and planned counts once.
const tasksOn = (tasks, date) =>
    tasks.filter(
        (task) =>
            task.due_date === date || (task.planned_on || []).includes(date)
    );

const isTimed = (event) =>
    !event.all_day &&
    event.start_minute !== null &&
    event.start_minute !== undefined;

const endOf = (event) => event.end_minute ?? event.start_minute;

const timedBusyEventsOn = (events, date) =>
    events.filter((e) => e.date === date && e.busy && isTimed(e));

// Total length of [from, to) covered by the intervals. Intervals may
// overlap each other; each covered minute counts once.
function coveredMinutes(intervals, from, to) {
    const clipped = intervals
        .map(([start, end]) => [Math.max(start, from), Math.min(end, to)])
        .filter(([start, end]) => end > start)
        .sort((a, b) => a[0] - b[0]);
    let total = 0;
    let cursor = from;
    for (const [start, end] of clipped) {
        const begin = Math.max(start, cursor);
        if (end > begin) {
            total += end - begin;
            cursor = end;
        }
    }
    return total;
}

// settings.capacity.evening[weekday] minus the part of its window taken by
// focus blocks and timed busy events. Null when no window is configured.
// A window ending before it starts runs past midnight.
function eveningCapacity(settings, focusBlocks, timedEvents, date) {
    const config = settings.capacity?.evening?.[String(weekday(date))];
    if (!config || !Number.isFinite(config.minutes)) return null;
    const from = parseClock(config.start);
    const parsedEnd = parseClock(config.end);
    if (from === null || parsedEnd === null) return null;
    const to = parsedEnd > from ? parsedEnd : MINUTES_PER_DAY;
    const intervals = [
        ...focusBlocks.map((block) => [block.start, block.end]),
        ...timedEvents.map((event) => [event.start_minute, endOf(event)]),
    ];
    const covered = coveredMinutes(intervals, from, to);
    return Math.max(0, config.minutes - covered);
}

// Full load of one day. Planned minutes = tasks on the day + timed busy
// events, as the brief contract defines them. Only task minutes are set
// against the evening capacity: evening events are already taken out of it
// and daytime events are not evening work.
function dayLoad(input, settings, date) {
    const tasks = tasksOn(input.tasks, date);
    const timedEvents = timedBusyEventsOn(input.events || [], date);
    const focusBlocks = (input.focusBlocksByDate || {})[date] || [];
    const taskTotal = tasks.reduce(
        (sum, task) => sum + taskMinutes(task).minutes,
        0
    );
    const eventTotal = timedEvents.reduce(
        (sum, event) => sum + (endOf(event) - event.start_minute),
        0
    );
    const capacity = eveningCapacity(settings, focusBlocks, timedEvents, date);
    const planned = taskTotal + Math.max(0, eventTotal);
    return {
        date,
        tasks,
        task_minutes: taskTotal,
        event_minutes: Math.max(0, eventTotal),
        planned_minutes: planned,
        capacity_minutes: capacity,
        overloaded: capacity !== null && taskTotal > capacity,
        hypothesis: true,
    };
}

// Would `minutes` more still fit the day? Always yes when no capacity is
// configured: nothing says the day is full.
function fits(load, minutes) {
    if (load.capacity_minutes === null) return true;
    return load.task_minutes + minutes <= load.capacity_minutes;
}

function overloadCards(loads) {
    return loads
        .filter((load) => load.overloaded)
        .map((load) => ({
            key: `overload:${load.date}`,
            type: 'overload',
            text: texts.card.overload(
                load.date,
                load.task_minutes,
                load.capacity_minutes
            ),
            task_uids: load.tasks.map((task) => task.uid),
            event_refs: [],
            question: null,
        }));
}

module.exports = {
    DEFAULT_TASK_MINUTES,
    parseClock,
    taskMinutes,
    tasksOn,
    coveredMinutes,
    eveningCapacity,
    dayLoad,
    fits,
    overloadCards,
};
