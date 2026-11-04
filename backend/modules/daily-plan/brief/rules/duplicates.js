'use strict';

// Open tasks that look like a task closed in the lookback window. Closed
// before open is the order that matters: a task already done is the most
// likely reason an open one should not be planned again.
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

// The best match of one open task: an exact name match first, then the
// closest fuzzy match at or above the similarity threshold.
function bestMatch(task, closedTasks, threshold) {
    if (!normalizeName(task.name)) return null;
    let best = null;
    for (const closed of closedTasks) {
        if (closed.uid === task.uid || isRelated(task, closed)) continue;
        const exact = normalizeName(closed.name) === normalizeName(task.name);
        const similarity = exact ? 1 : jaccard(task.name, closed.name);
        if (!exact && similarity < threshold) continue;
        const candidate = {
            task_uid: task.uid,
            closed_uid: closed.uid,
            closed_name: closed.name,
            kind: exact ? 'probable' : 'possible',
            similarity,
        };
        if (!best || similarity > best.similarity) best = candidate;
    }
    return best;
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
    return input.tasks
        .map((task) => bestMatch(task, closedTasks, threshold))
        .filter(Boolean);
}

function duplicateCards(input, settings) {
    const tasksByUid = new Map(input.tasks.map((t) => [t.uid, t]));
    return findDuplicates(input, settings).map((match) => {
        const title = titleOf(tasksByUid.get(match.task_uid).name);
        const closed = titleOf(match.closed_name);
        const key = `duplicate:${match.task_uid}:${match.closed_uid}`;
        return {
            key,
            type: 'duplicate',
            text: texts.card.duplicate(title, closed),
            task_uids: [match.task_uid],
            event_refs: [],
            question: {
                key,
                text: texts.card.duplicateQuestion(title, closed),
                target: { scope: 'task', ref: match.task_uid },
            },
        };
    });
}

module.exports = {
    normalizeName,
    jaccard,
    findDuplicates,
    duplicateCards,
};
