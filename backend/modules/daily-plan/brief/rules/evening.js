'use strict';

// The evening review (docs/39-daily-brief.md, Evening review). Pure: the same
// input, morning brief and settings always give the same review. Nothing is
// stored and nothing is written; the morning brief is only read for its
// tonight list, so an absent morning brief leaves that list empty.
const { addDays, localDay } = require('./dates');
const { dayLoad } = require('./load');
const { texts } = require('./texts');
const { eveningVerdictText } = require('./verdict');
const { workHourConflicts, overlappingEvents } = require('./conflicts');
const { timelineDay } = require('../build');
const { buildEveningAudioScript } = require('../script');

const SCHEMA = 1;
const DONE_MAX = 10;

const byName = (a, b) =>
    String(a.name || '').localeCompare(String(b.name || '')) ||
    String(a.uid).localeCompare(String(b.uid));

// Tasks completed on the user's local day `today`, newest first.
function doneToday(input) {
    return (input.closedTasks || [])
        .filter(
            (closed) =>
                localDay(closed.completed_at, input.timezone) === input.today
        )
        .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
}

// The morning's tonight items that are still open, in their order. An item
// whose task is no longer among the open tasks was finished or dropped.
function stillOpenTonight(morningBrief, openUids) {
    return (morningBrief?.tonight || [])
        .filter((item) => openUids.has(item.task_uid))
        .map((item) => ({ task_uid: item.task_uid, minutes: item.minutes }));
}

// Open tasks due today or planned today that are not in tonight's list.
function slippedToday(input, tonightUids) {
    const today = input.today;
    return input.tasks
        .filter(
            (task) =>
                !tonightUids.has(task.uid) &&
                (task.due_date === today ||
                    (task.planned_on || []).includes(today))
        )
        .sort(byName)
        .map((task) => ({
            task_uid: task.uid,
            reason:
                task.due_date === today
                    ? texts.evening.reason.dueToday
                    : texts.evening.reason.planned,
        }));
}

// One timeline day (the same shape as brief.timeline[]) for `date`.
function tomorrowDay(input, settings, date) {
    const conflictRefs = new Set([
        ...workHourConflicts(input)
            .filter(({ event }) => event.date === date)
            .map(({ event }) => event.ref),
        ...overlappingEvents(input)
            .filter(({ a }) => a.date === date)
            .flatMap(({ a, b }) => [a.ref, b.ref]),
    ]);
    return timelineDay(
        input,
        settings,
        date,
        dayLoad(input, settings, date),
        conflictRefs
    );
}

// The evening review of input.today. `morningBrief` is the stored brief of
// that day or null; `now` is the instant the review is built at.
function buildEvening(input, settings, morningBrief, now) {
    const tomorrow = addDays(input.today, 1);
    const openByUid = new Map(input.tasks.map((task) => [task.uid, task]));

    const doneAll = doneToday(input);
    const tonight = stillOpenTonight(morningBrief, new Set(openByUid.keys()));
    const tonightUids = new Set(tonight.map((item) => item.task_uid));
    const slipped = slippedToday(input, tonightUids);

    const counters = {
        done: doneAll.length,
        slipped: slipped.length,
        tonight_minutes: tonight.reduce((sum, item) => sum + item.minutes, 0),
        capacity_minutes: dayLoad(input, settings, input.today)
            .capacity_minutes,
    };

    const evening = {
        schema: SCHEMA,
        date: input.today,
        generated_at: new Date(now ?? input.now).toISOString(),
        verdict: {
            text: eveningVerdictText({
                done: counters.done,
                tonight: tonight.length,
                slipped: counters.slipped,
            }),
            by: 'rules',
        },
        counters,
        done: doneAll.slice(0, DONE_MAX).map((closed) => closed.uid),
        tonight,
        slipped,
        carry_over: [
            ...slipped.map((item) => item.task_uid),
            ...tonight.map((item) => item.task_uid),
        ],
        tomorrow: tomorrowDay(input, settings, tomorrow),
    };

    const tasksByUid = new Map([
        ...(input.closedTasks || []).map((closed) => [closed.uid, closed]),
        ...input.tasks.map((task) => [task.uid, task]),
    ]);
    return {
        ...evening,
        audio_script: buildEveningAudioScript(evening, settings, {
            tasksByUid,
        }),
    };
}

module.exports = { buildEvening, DONE_MAX };
