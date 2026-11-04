'use strict';

// Assembles the brief (schema 1) from the pure rules. Pure: everything comes
// from `input` and `settings`. Audio and the inbox proposals are filled by
// later phases; their placeholders are written here so the shape is stable.
const { timelineDates, isWithinLookback, weekday } = require('./rules/dates');
const { dayLoad, overloadCards, tasksOn } = require('./rules/load');
const {
    workHourConflicts,
    overlappingEvents,
    conflictCards,
} = require('./rules/conflicts');
const { duplicateCards } = require('./rules/duplicates');
const { deadlineCards } = require('./rules/noteDeadlines');
const { postponedCards } = require('./rules/postponed');
const { moveProposals } = require('./rules/moves');
const { tonightPicks } = require('./rules/tonight');
const { isSilenced } = require('./rules/contexts');
const { verdictText } = require('./rules/verdict');

const SCHEMA = 1;
const INBOX_MAX = 5;
const RESOLVED_MAX = 10;

// All-day first, then by start time.
const byStartMinute = (a, b) =>
    Number(b.all_day) - Number(a.all_day) ||
    (a.start_minute ?? -1) - (b.start_minute ?? -1);

function timelineEvent(event, conflictRefs) {
    return {
        ref: event.ref,
        series_ref: event.series_ref ?? null,
        title: event.title,
        all_day: Boolean(event.all_day),
        start_minute: event.start_minute ?? null,
        end_minute: event.end_minute ?? null,
        calendar: event.calendar ?? null,
        conflict: conflictRefs.has(event.ref),
    };
}

function timelineDay(input, settings, date, load, conflictRefs) {
    const dayNote =
        settings.capacity?.dayNotes?.[String(weekday(date))] || null;
    return {
        date,
        work: ((input.focusBlocksByDate || {})[date] || []).map((block) => ({
            start: block.start,
            end: block.end,
            label: block.label ?? '',
        })),
        events: (input.events || [])
            .filter((event) => event.date === date)
            .map((event) => timelineEvent(event, conflictRefs))
            .sort(byStartMinute),
        task_uids: tasksOn(input.tasks, date).map((task) => task.uid),
        load: {
            planned_minutes: load.planned_minutes,
            capacity_minutes: load.capacity_minutes,
            hypothesis: true,
            note: dayNote,
        },
        flags: load.overloaded ? ['overloaded'] : [],
    };
}

// Cards in the order the client shows them; a disabled type or a silenced
// question is dropped here, the rules never know about settings or contexts.
function anticipateCards(input, settings, cards) {
    const disabled = new Set(settings.alerts?.disabled || []);
    return cards
        .filter((card) => !disabled.has(card.type))
        .filter(
            (card) =>
                !card.question ||
                !isSilenced(card.question.target, input.contexts)
        )
        .map((card) => ({
            key: card.key,
            type: card.type,
            text: card.text,
            task_uids: card.task_uids,
            event_refs: card.event_refs,
            question: card.question,
        }));
}

function buildBrief(input, settings) {
    const today = input.today;
    const timezone = input.timezone;
    const dates = timelineDates(today, settings.timelineDays);
    const loads = new Map(
        dates.map((date) => [date, dayLoad(input, settings, date)])
    );

    const workConflicts = workHourConflicts(input).filter(({ event }) =>
        dates.includes(event.date)
    );
    const overlaps = overlappingEvents(input).filter(({ a }) =>
        dates.includes(a.date)
    );
    const conflictRefs = new Set([
        ...workConflicts.map(({ event }) => event.ref),
        ...overlaps.flatMap(({ a, b }) => [a.ref, b.ref]),
    ]);

    const timeline = dates.map((date) =>
        timelineDay(input, settings, date, loads.get(date), conflictRefs)
    );

    const cards = [
        ...conflictCards(input),
        ...overloadCards(dates.map((date) => loads.get(date))),
        ...deadlineCards(input),
        ...duplicateCards(input, settings),
        ...postponedCards(input, settings),
    ];

    const tonight = tonightPicks(input, settings, loads.get(today));
    const counters = {
        due_today: input.tasks.filter((t) => t.due_date === today).length,
        overdue: input.tasks.filter((t) => t.due_date && t.due_date < today)
            .length,
        tonight_minutes: tonight.reduce((sum, pick) => sum + pick.minutes, 0),
        capacity_minutes: loads.get(today).capacity_minutes,
        conflicts: workConflicts.length + overlaps.length,
        replies: (input.replies || []).length,
    };

    const replyItems = (input.replies || []).map((reply) => ({
        account: reply.account,
        thread_ref: reply.thread_ref,
        from: reply.from,
        subject: reply.subject,
        date: reply.date,
        summary: reply.summary,
        link: reply.link,
    }));

    const resolved = (input.closedTasks || [])
        .filter((closed) =>
            isWithinLookback(closed.completed_at, {
                timezone,
                today,
                days: settings.thresholds.closedLookbackDays,
            })
        )
        .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
        .slice(0, RESOLVED_MAX)
        .map((closed) => ({
            task_uid: closed.uid,
            completed_at: closed.completed_at,
        }));

    const inbox = [...(input.inboxItems || [])]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(0, INBOX_MAX)
        .map((item) => ({ uid: item.uid, title: item.title, proposal: null }));

    return {
        schema: SCHEMA,
        date: today,
        timezone,
        generated_at: input.now,
        sections: settings.sections,
        sources: (input.sources || []).map((source) => ({
            id: source.id,
            status: source.status,
            detail: source.detail ?? null,
        })),
        counters,
        verdict: { text: verdictText(counters), by: 'rules' },
        timeline,
        tonight,
        moves: moveProposals(input, settings),
        anticipate: anticipateCards(input, settings, cards),
        replies: replyItems,
        inbox,
        resolved,
        audio_script: { chapters: [] },
        audio: {
            status: 'none',
            path: null,
            duration_seconds: null,
            chapters: [],
            voice: null,
        },
    };
}

module.exports = { buildBrief };
