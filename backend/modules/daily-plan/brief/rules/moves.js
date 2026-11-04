'use strict';

// Move proposals: an overdue task, or a task sitting on an overloaded day,
// gets the first later day that can take it. Nothing is moved here; each
// proposal waits for the user's tap.
const { addDays, timelineDates } = require('./dates');
const { dayLoad, fits, taskMinutes } = require('./load');
const { texts } = require('./texts');

const proposalKey = (taskUid, from, to) => `move:${taskUid}:${from}:${to}`;

const priorityOf = (task) => task.priority ?? -1;

// Overdue tasks first (oldest due first, then highest priority), then the
// tasks that must leave an overloaded day for it to fit. Each task once.
function candidates(input, settings) {
    const today = input.today;
    const list = input.tasks
        .filter((task) => task.due_date && task.due_date < today)
        .sort(
            (a, b) =>
                a.due_date.localeCompare(b.due_date) ||
                priorityOf(b) - priorityOf(a)
        )
        .map((task) => ({
            task,
            from: task.due_date,
            minutes: taskMinutes(task).minutes,
            reason: texts.move.overdue(task.due_date),
        }));
    const seen = new Set(list.map((c) => c.task.uid));

    const overloaded = timelineDates(today, settings.timelineDays)
        .map((date) => dayLoad(input, settings, date))
        .filter((load) => load.overloaded);
    for (const load of overloaded) {
        // Lowest priority leaves first, then the longest tasks: the fewest
        // moves that make the day fit. If no prefix makes it fit (events
        // alone overload it), nothing is proposed for that day.
        const movable = load.tasks
            .filter((task) => !seen.has(task.uid))
            .sort(
                (a, b) =>
                    priorityOf(a) - priorityOf(b) ||
                    taskMinutes(b).minutes - taskMinutes(a).minutes
            );
        let remaining = load.planned_minutes;
        for (let count = 1; count <= movable.length; count++) {
            remaining -= taskMinutes(movable[count - 1]).minutes;
            if (remaining > load.capacity_minutes) continue;
            for (const task of movable.slice(0, count)) {
                seen.add(task.uid);
                list.push({
                    task,
                    from: load.date,
                    minutes: taskMinutes(task).minutes,
                    reason: texts.move.overloaded(load.date),
                });
            }
            break;
        }
    }
    return list;
}

// The first day from the day after `from` (never before today) up to the
// lookahead, where the task fits. Skipped: its own days, a day refused for
// it before, and a day that repeats an ignored proposal. `added` holds the
// minutes already proposed for each day in this run.
function findTarget(input, settings, candidate, added) {
    const { task, from, minutes } = candidate;
    const decisions = input.decisions || [];
    const afterFrom = addDays(from, 1);
    const first = afterFrom > input.today ? afterFrom : input.today;
    const last = addDays(input.today, settings.calendarLookaheadDays);
    for (let day = first; day <= last; day = addDays(day, 1)) {
        if (task.due_date === day || (task.planned_on || []).includes(day)) {
            continue;
        }
        const refused = decisions.some(
            (d) =>
                d.kind === 'move' &&
                d.decision === 'refused' &&
                d.target_ref === task.uid &&
                d.proposal?.to === day
        );
        if (refused) continue;
        const key = proposalKey(task.uid, from, day);
        const ignored = decisions.some(
            (d) =>
                d.kind === 'move' &&
                d.decision === 'ignored' &&
                d.fingerprint === key
        );
        if (ignored) continue;
        const load = dayLoad(input, settings, day);
        const planned = load.planned_minutes + (added.get(day) || 0);
        if (fits({ ...load, planned_minutes: planned }, minutes)) return day;
    }
    return null;
}

function moveProposals(input, settings) {
    const max = settings.thresholds.maxMoves;
    const added = new Map();
    const proposals = [];
    for (const candidate of candidates(input, settings)) {
        if (proposals.length >= max) break;
        const to = findTarget(input, settings, candidate, added);
        if (!to) continue;
        added.set(to, (added.get(to) || 0) + candidate.minutes);
        proposals.push({
            proposal_key: proposalKey(candidate.task.uid, candidate.from, to),
            task_uid: candidate.task.uid,
            from: candidate.from,
            to,
            reason: candidate.reason,
        });
    }
    return proposals;
}

module.exports = { proposalKey, moveProposals };
