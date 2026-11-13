'use strict';

// "Planifier ma semaine" (docs/47-proposals.md). The facts are computed here
// from data the service has already read; the agent only judges them. Rules
// are pure: no database, no clock (the caller gives `today`).
const { ValidationError } = require('../../../shared/errors');
const { isDay, addDays, daysBetween, listDays } = require('./day');
const { cleanText } = require('./text');

const MAX_TASKS = 40;
const MAX_EVENTS_PER_DAY = 20;
const MAX_PERIOD_DAYS = 14;
const DEFAULT_PERIOD_DAYS = 7;
const SUMMARY_MAX = 300;
const REASON_MAX = 140;
const QUESTIONS_MAX = 3;
const OPS = ['plan_day', 'this_week', 'later', 'due', 'drop'];
const OPS_WITH_DATE = new Set(['plan_day', 'due']);

// Period from the request: a start (default today) and an end (default six
// days later), at most 14 days.
function resolvePeriod({ today, start, end }) {
    const from = start ?? today;
    if (!isDay(from)) {
        throw new ValidationError('start must be YYYY-MM-DD');
    }
    const to = end ?? addDays(from, DEFAULT_PERIOD_DAYS - 1);
    if (!isDay(to)) {
        throw new ValidationError('end must be YYYY-MM-DD');
    }
    const span = daysBetween(from, to);
    if (span < 0) {
        throw new ValidationError('end must not be before start');
    }
    if (span >= MAX_PERIOD_DAYS) {
        throw new ValidationError(
            `a period is at most ${MAX_PERIOD_DAYS} days`
        );
    }
    return { start: from, end: to };
}

// Tasks worth the agent's time: overdue, due in the period, decided for this
// week, in view, or planned in the period. Closed, recurring and subtasks are
// never sent. Most urgent first, capped.
const RANK = { overdue: 0, due: 1, planned: 2, week: 3, view: 4 };

function rankOf(task, { today, period, plannedUids, weekStart }) {
    if (task.due && task.due < today) return RANK.overdue;
    if (task.due && task.due >= period.start && task.due <= period.end) {
        return RANK.due;
    }
    if (plannedUids.has(task.uid)) return RANK.planned;
    if (task.week_of === weekStart) return RANK.week;
    if (task.in_view) return RANK.view;
    return null;
}

function selectTasks(tasks, context) {
    const ranked = [];
    for (const task of tasks) {
        if (task.recurring || task.subtask) continue;
        const rank = rankOf(task, context);
        if (rank !== null) ranked.push({ task, rank });
    }
    ranked.sort(
        (a, b) =>
            a.rank - b.rank ||
            (a.task.due ?? '9999').localeCompare(b.task.due ?? '9999') ||
            a.task.uid.localeCompare(b.task.uid)
    );
    return ranked.slice(0, MAX_TASKS).map(({ task, rank }) => {
        const out = { uid: task.uid, name: task.name };
        if (task.due) out.due = task.due;
        if (task.project) out.project = task.project;
        if (task.priority && task.priority !== 'none') {
            out.priority = task.priority;
        }
        if (task.estimate_min) out.estimate_min = task.estimate_min;
        if (rank === RANK.overdue) out.overdue = true;
        if (task.week_of) out.week_of = task.week_of;
        if (task.someday) out.someday = true;
        return out;
    });
}

// `plans`: day -> [{ task_uid, duration_minutes }]; `events`: [{ title, date,
// start, end }] from the user's calendars (Google and ICS feeds).
function weekFacts({ today, period, weekStart, tasks, plans, events }) {
    const plannedUids = new Set();
    for (const items of plans.values()) {
        for (const item of items) plannedUids.add(item.task_uid);
    }
    const selected = selectTasks(tasks, {
        today,
        period,
        weekStart,
        plannedUids,
    });
    const shown = new Set(selected.map((task) => task.uid));
    const eventsByDay = new Map();
    for (const event of events) {
        const list = eventsByDay.get(event.date) ?? [];
        if (list.length < MAX_EVENTS_PER_DAY) {
            list.push({
                title: cleanText(event.title, 200),
                start: event.start,
                end: event.end,
            });
        }
        eventsByDay.set(event.date, list);
    }
    const days = listDays(period.start, period.end).map((date) => {
        const items = plans.get(date) ?? [];
        return {
            date,
            events: eventsByDay.get(date) ?? [],
            planned: items
                .map((item) => item.task_uid)
                .filter((uid) => shown.has(uid)),
            load_minutes: items.reduce(
                (sum, item) => sum + (item.duration_minutes || 0),
                0
            ),
        };
    });
    return {
        period,
        today,
        days,
        tasks: selected,
    };
}

const takeList = (value, max) =>
    Array.isArray(value) ? value.slice(0, max) : [];

function cleanQuestion(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = cleanText(raw.id, 32);
    const text = cleanText(raw.text, 200);
    if (!id || !text) return null;
    const choices = takeList(raw.choices, 4)
        .filter((choice) => typeof choice === 'string')
        .map((choice) => cleanText(choice, 60))
        .filter(Boolean);
    return { id, text, choices };
}

// Keeps what is valid in the agent's answer and drops the rest. A change
// names a task of the facts, an operation of the list, and a date inside the
// period when the operation needs one. One change per task.
function validateWeekAnswer(facts, raw) {
    const known = new Set(facts.tasks.map((task) => task.uid));
    const inPeriod = (date) =>
        isDay(date) && date >= facts.period.start && date <= facts.period.end;
    const seen = new Set();
    const changes = [];
    for (const item of takeList(raw.changes, 200)) {
        if (!item || typeof item !== 'object') continue;
        if (!known.has(item.task_uid) || seen.has(item.task_uid)) continue;
        if (!OPS.includes(item.op)) continue;
        const change = {
            task_uid: item.task_uid,
            op: item.op,
            reason: cleanText(item.reason, REASON_MAX),
        };
        if (OPS_WITH_DATE.has(item.op)) {
            if (!inPeriod(item.date)) continue;
            change.date = item.date;
        }
        seen.add(item.task_uid);
        changes.push(change);
    }
    return {
        summary: cleanText(raw.summary, SUMMARY_MAX),
        questions: takeList(raw.questions, QUESTIONS_MAX)
            .map(cleanQuestion)
            .filter(Boolean),
        changes,
    };
}

module.exports = {
    MAX_TASKS,
    OPS,
    resolvePeriod,
    selectTasks,
    weekFacts,
    validateWeekAnswer,
};
