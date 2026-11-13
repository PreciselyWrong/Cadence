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
const REASON_MAX = 100;
const QUESTIONS_MAX = 3;
const OPS = [
    'plan_day',
    'this_week',
    'next_week',
    'this_month',
    'next_month',
    'later',
    'due',
    'drop',
];
// The user may pick any of these per task; keep does nothing.
const DECISION_OPS = [...OPS, 'keep'];
const OPS_WITH_DATE = new Set(['plan_day', 'due']);
// A date the user can apply: inside the period, or up to this many days after
// its end.
const APPLY_AFTER_END_DAYS = 30;
// A note is the user's words on one task, sent back to the agent for a second
// pass (docs/47-proposals.md, Send with notes).
const NOTE_MAX = 500;
// The answers of a send to the questions of the answer (docs/47-proposals.md,
// Send with answers).
const QUESTION_ANSWERS_MAX = 3;

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
        if (task.goal) out.goal = task.goal;
        if (task.area) out.area = task.area;
        return out;
    });
}

// `plans`: day -> [{ task_uid, duration_minutes }]; `events`: [{ title, date,
// start, end }] from the user's calendars (Google and ICS feeds); `context`:
// the user's goals, areas, projects and about (core/context.js).
function weekFacts({
    today,
    period,
    weekStart,
    tasks,
    plans,
    events,
    context = {},
}) {
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
        ...context,
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
// period when the operation needs one. One change per task. The headline and
// subtitle are read by answer.js.
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
        questions: takeList(raw.questions, QUESTIONS_MAX)
            .map(cleanQuestion)
            .filter(Boolean),
        changes,
    };
}

const applyLastDay = (period) => addDays(period.end, APPLY_AFTER_END_DAYS);

// The decisions the user sends to apply: one per task of the facts, an
// operation of DECISION_OPS, and a date in the apply window when the
// operation takes one. Throws ValidationError on anything else.
function checkWeekDecisions(facts, decisions) {
    const known = new Set(facts.tasks.map((task) => task.uid));
    const first = facts.period.start;
    const last = applyLastDay(facts.period);
    const seen = new Set();
    return decisions.map((decision) => {
        if (!decision || typeof decision !== 'object') {
            throw new ValidationError('Each decision must be an object');
        }
        const { task_uid: uid, op } = decision;
        if (!known.has(uid)) {
            throw new ValidationError(`Task ${uid} is not in this proposal`);
        }
        if (seen.has(uid)) {
            throw new ValidationError(`Task ${uid} is decided twice`);
        }
        if (!DECISION_OPS.includes(op)) {
            throw new ValidationError(`Unknown operation ${op}`);
        }
        seen.add(uid);
        if (!OPS_WITH_DATE.has(op)) return { task_uid: uid, op };
        const { date } = decision;
        if (!isDay(date) || date < first || date > last) {
            throw new ValidationError(
                `date must be a day between ${first} and ${last}`
            );
        }
        return { task_uid: uid, op, date };
    });
}

// The notes of a send: one per task of the facts, never on a task that also
// has a decision, text trimmed and 1 to NOTE_MAX characters.
function checkWeekNotes(facts, notes, decided) {
    if (!Array.isArray(notes)) {
        throw new ValidationError('notes must be a list');
    }
    const known = new Set(facts.tasks.map((task) => task.uid));
    const seen = new Set();
    return notes.map((note) => {
        if (!note || typeof note !== 'object') {
            throw new ValidationError('Each note must be an object');
        }
        const uid = note.task_uid;
        if (!known.has(uid)) {
            throw new ValidationError(`Task ${uid} is not in this proposal`);
        }
        if (decided.has(uid)) {
            throw new ValidationError(`Task ${uid} is both decided and noted`);
        }
        if (seen.has(uid)) {
            throw new ValidationError(`Task ${uid} has two notes`);
        }
        const text = typeof note.text === 'string' ? note.text.trim() : '';
        if (text.length < 1 || text.length > NOTE_MAX) {
            throw new ValidationError(
                `note text must be 1 to ${NOTE_MAX} characters`
            );
        }
        seen.add(uid);
        return { task_uid: uid, text };
    });
}

// The answers to the questions of the answer: each names one question of it
// and one of its choices, at most one per question and QUESTION_ANSWERS_MAX.
function checkWeekAnswers(answer, answers) {
    if (!Array.isArray(answers)) {
        throw new ValidationError('answers must be a list');
    }
    if (answers.length > QUESTION_ANSWERS_MAX) {
        throw new ValidationError(
            `answers must be at most ${QUESTION_ANSWERS_MAX}`
        );
    }
    const questions = new Map(
        (answer?.questions ?? []).map((question) => [question.id, question])
    );
    const seen = new Set();
    return answers.map((item) => {
        if (!item || typeof item !== 'object') {
            throw new ValidationError('Each answer must be an object');
        }
        const question = questions.get(item.question_id);
        if (!question) {
            throw new ValidationError(
                `Question ${item.question_id} is not in this proposal`
            );
        }
        if (seen.has(question.id)) {
            throw new ValidationError(
                `Question ${question.id} is answered twice`
            );
        }
        if (!question.choices.includes(item.choice)) {
            throw new ValidationError(
                `Choice is not offered for question ${question.id}`
            );
        }
        seen.add(question.id);
        return { question_id: question.id, choice: item.choice };
    });
}

// The facts of a second pass: the same period, days and context, but only the
// noted tasks, and the days' plan lines of those tasks.
function restrictWeekFacts(facts, uids) {
    const keep = new Set(uids);
    return {
        ...facts,
        tasks: facts.tasks.filter((task) => keep.has(task.uid)),
        days: facts.days.map((day) => ({
            ...day,
            planned: day.planned.filter((uid) => keep.has(uid)),
        })),
    };
}

// The decisions of an apply request. `decisions` is the user's own list; the
// legacy `task_uids` stand for the agent's operations on those tasks.
function weekDecisionsOf(facts, answer, body) {
    if (Array.isArray(body.decisions)) {
        return checkWeekDecisions(facts, body.decisions);
    }
    const wanted = body.task_uids;
    if (
        !Array.isArray(wanted) ||
        wanted.some((uid) => typeof uid !== 'string')
    ) {
        throw new ValidationError('decisions must be a list');
    }
    const changes = answer?.changes ?? [];
    return wanted.map((uid) => {
        const change = changes.find((c) => c.task_uid === uid);
        if (!change) {
            throw new ValidationError(`Task ${uid} is not proposed`);
        }
        return change.date
            ? { task_uid: uid, op: change.op, date: change.date }
            : { task_uid: uid, op: change.op };
    });
}

module.exports = {
    MAX_TASKS,
    OPS,
    DECISION_OPS,
    resolvePeriod,
    selectTasks,
    weekFacts,
    validateWeekAnswer,
    checkWeekDecisions,
    checkWeekNotes,
    checkWeekAnswers,
    restrictWeekFacts,
    weekDecisionsOf,
    NOTE_MAX,
};
