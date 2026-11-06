'use strict';

// Open tasks that look like another one: closed in the lookback window, or
// still open. A recurring task repeats by design and two dated tasks on
// different days are different tasks: neither is ever reported, so nobody is
// asked whether "Sport" is a duplicate of "Sport".
const { isWithinLookback } = require('./dates');
const { texts, titleOf } = require('./texts');

// Lowercase, no accents, punctuation as word breaks: "Réserver l'hôtel!"
// and "reserver l hotel" compare equal.
function normalizeName(name) {
    return String(name ?? '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

const tokensOf = (name) =>
    new Set(normalizeName(name).split(' ').filter(Boolean));

// Token Jaccard: shared words over all words of both names.
function jaccard(a, b) {
    const left = tokensOf(a);
    const right = tokensOf(b);
    const union = new Set([...left, ...right]).size;
    if (union === 0) return 0;
    let shared = 0;
    for (const token of left) if (right.has(token)) shared++;
    return shared / union;
}

// A closed subtask never closes its open parent, and an open subtask is not
// a duplicate of the parent it hangs from: they are parts of one piece of
// work, not two copies of it.
const isRelated = (open, closed) =>
    closed.parent_uid === open.uid || open.parent_uid === closed.uid;

const canBeTwins = (a, b) =>
    !a.recurring &&
    !b.recurring &&
    !(a.series_uid && a.series_uid === b.series_uid) &&
    !(a.due_date && b.due_date && a.due_date !== b.due_date) &&
    !isRelated(a, b);

// The best match of one open task: an exact name match first, then the
// closest fuzzy match at or above the similarity threshold.
function bestMatch(task, closedTasks, threshold) {
    if (!normalizeName(task.name)) return null;
    let best = null;
    for (const closed of closedTasks) {
        if (closed.uid === task.uid || !canBeTwins(task, closed)) continue;
        const exact = normalizeName(closed.name) === normalizeName(task.name);
        const similarity = exact ? 1 : jaccard(task.name, closed.name);
        if (!exact && similarity < threshold) continue;
        const candidate = {
            task_uid: task.uid,
            closed_uid: closed.uid,
            closed_name: closed.name,
            closed: true,
            twin: closed,
            kind: exact ? 'probable' : 'possible',
            similarity,
        };
        if (!best || similarity > best.similarity) best = candidate;
    }
    return best;
}

// Two open tasks with the same name. The second, in a stable order, is the one
// proposed for cancelling.
function openTwins(tasks) {
    const firstByName = new Map();
    const found = [];
    for (const task of [...tasks].sort((a, b) =>
        String(a.uid).localeCompare(String(b.uid))
    )) {
        const name = normalizeName(task.name);
        if (!name) continue;
        const twin = (firstByName.get(name) || []).find((other) =>
            canBeTwins(task, other)
        );
        if (twin) {
            found.push({
                task_uid: task.uid,
                closed_uid: twin.uid,
                closed_name: twin.name,
                closed: false,
                twin,
                kind: 'probable',
                similarity: 1,
            });
        }
        firstByName.set(name, [...(firstByName.get(name) || []), task]);
    }
    return found;
}

function findDuplicates(input, settings) {
    const closedTasks = (input.closedTasks || []).filter((closed) =>
        isWithinLookback(closed.completed_at, {
            timezone: input.timezone,
            today: input.today,
            days: settings.thresholds.closedLookbackDays,
        })
    );
    const threshold = settings.thresholds.duplicateSimilarity;
    const againstClosed = input.tasks
        .map((task) => bestMatch(task, closedTasks, threshold))
        .filter(Boolean);
    const matched = new Set(againstClosed.map((match) => match.task_uid));
    return [
        ...againstClosed,
        ...openTwins(input.tasks).filter(
            (match) => !matched.has(match.task_uid)
        ),
    ];
}

// What tells two tasks apart, so nobody has to guess from their names alone.
function describe(task) {
    return [
        task.completed_at
            ? texts.duplicate.closedOn(task.completed_at.slice(0, 10))
            : null,
        task.due_date ? texts.duplicate.due(task.due_date) : null,
        task.project_name ? texts.duplicate.project(task.project_name) : null,
    ]
        .filter(Boolean)
        .join(' · ');
}

function duplicateCards(input, settings) {
    const tasksByUid = new Map(input.tasks.map((t) => [t.uid, t]));
    return findDuplicates(input, settings).map((match) => {
        const open = tasksByUid.get(match.task_uid);
        const title = titleOf(open.name);
        const other = titleOf(match.closed_name);
        const sameName =
            normalizeName(open.name) === normalizeName(match.closed_name);
        const key = `duplicate:${match.task_uid}:${match.closed_uid}`;
        let text;
        if (!match.closed) text = texts.duplicate.openTwin;
        else if (sameName) text = texts.duplicate.sameNameClosed;
        else text = texts.duplicate.similarClosed(other);
        return {
            key,
            type: 'duplicate',
            text,
            details: [
                texts.duplicate.thisTask(describe(open) || title),
                texts.duplicate.otherTask(describe(match.twin) || other),
            ],
            task_uids: [match.task_uid],
            event_refs: [],
            question: null,
        };
    });
}

module.exports = {
    normalizeName,
    jaccard,
    findDuplicates,
    duplicateCards,
};
