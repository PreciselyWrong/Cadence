'use strict';

// "Préparer ma revue" (docs/47-proposals.md): the quick review queue, the
// same rule as buildQuickReview (frontend/components/Review/reviewUtils.ts),
// restricted to task lists. Items the agent already judged, with the task
// unchanged since, come back from the previous answer and are not sent again.
const { cleanText } = require('./text');

const QUEUE_SIZE = 10;
const PARKED_PLACES = 3;
const SUMMARY_MAX = 300;
const REASON_MAX = 140;

// The choices of each list, by id. `keep` writes nothing.
const REVIEW_CHOICES = {
    pushed: ['do_today', 'later', 'drop', 'keep'],
    later: ['do_today', 'this_week', 'in_view', 'done', 'drop', 'keep'],
    stale: ['this_week', 'in_view', 'later', 'drop', 'keep'],
};

const choicesFor = (list) => REVIEW_CHOICES[list] ?? [];

// Parked ideas (Later) are read at least PARKED_PLACES at a time, however
// much else needs a look. Lists are passed in the tab order.
// Each item: { uid, list, ... } with `list` one of pushed | later | stale.
function buildQueue(lists, size = QUEUE_SIZE) {
    const timeOf = (value) => (value ? Date.parse(value) || 0 : 0);
    const parked = [...lists.later].sort(
        (a, b) =>
            timeOf(a.reviewed_at) - timeOf(b.reviewed_at) ||
            timeOf(a.last_activity_at) - timeOf(b.last_activity_at)
    );
    const candidates = [
        ...lists.pushed.map((item) => ({ list: 'pushed', item })),
        ...lists.later
            .filter((item) => item.review_due)
            .map((item) => ({ list: 'later', item })),
        ...lists.stale.map((item) => ({ list: 'stale', item })),
        ...parked
            .filter((item) => !item.review_due)
            .map((item) => ({ list: 'later', item })),
    ];
    const seen = new Set();
    const unique = candidates.filter(({ item }) => {
        if (seen.has(item.uid)) return false;
        seen.add(item.uid);
        return true;
    });
    const isParked = (entry) => entry.list === 'later';
    const parkedCount = unique.filter(isParked).length;
    const attention = unique.filter((entry) => !isParked(entry));
    const attentionTaken = Math.min(
        attention.length,
        size - Math.min(PARKED_PLACES, parkedCount, size)
    );
    const chosen = new Set([
        ...attention.slice(0, attentionTaken),
        ...unique.filter(isParked).slice(0, size - attentionTaken),
    ]);
    return unique.filter((entry) => chosen.has(entry));
}

const stampOf = (updatedAt) => new Date(updatedAt).toISOString();

const CONTEXT = {
    pushed: (item) => ({ pushed_times: item.pushed_times }),
    later: (item) => ({ review_due: Boolean(item.review_due) }),
    stale: (item) => ({ last_activity: item.last_activity_at.slice(0, 10) }),
};

// `previous`: uid -> { stamp, choice, reason } from the latest answer that
// judged the task. A stamp is the task's updated_at at that time: when it has
// not moved, and the choice still exists for the list, the answer is reused.
function reviewFacts({ lists, previous = new Map(), size = QUEUE_SIZE }) {
    const queue = buildQueue(lists, size);
    const stamps = {};
    const items = [];
    const cached = [];
    for (const { list, item } of queue) {
        const stamp = stampOf(item.updated_at);
        stamps[item.uid] = stamp;
        const earlier = previous.get(item.uid);
        if (
            earlier &&
            earlier.stamp === stamp &&
            choicesFor(list).includes(earlier.choice)
        ) {
            cached.push({
                task_uid: item.uid,
                name: cleanText(item.name, 255),
                list,
                choice: earlier.choice,
                reason: earlier.reason,
            });
            continue;
        }
        items.push({
            uid: item.uid,
            name: cleanText(item.name, 255),
            list,
            choices: choicesFor(list),
            ...(item.project ? { project: item.project } : {}),
            ...CONTEXT[list](item),
        });
    }
    return { facts: { items, cached, stamps }, queueSize: queue.length };
}

// Keeps the valid judgements: a task of the facts that needs one, a choice of
// its list, one per task. The answer is `{ summary, items }`.
function validateReviewAnswer(facts, raw) {
    const asked = new Map(facts.items.map((item) => [item.uid, item]));
    const seen = new Set();
    const items = [];
    for (const item of Array.isArray(raw.items)
        ? raw.items.slice(0, 200)
        : []) {
        if (!item || typeof item !== 'object') continue;
        const target = asked.get(item.task_uid);
        if (!target || seen.has(item.task_uid)) continue;
        if (!target.choices.includes(item.choice)) continue;
        seen.add(item.task_uid);
        items.push({
            task_uid: item.task_uid,
            choice: item.choice,
            reason: cleanText(item.reason, REASON_MAX),
        });
    }
    return {
        summary: cleanText(raw.summary, SUMMARY_MAX),
        items,
    };
}

module.exports = {
    QUEUE_SIZE,
    REVIEW_CHOICES,
    choicesFor,
    buildQueue,
    reviewFacts,
    validateReviewAnswer,
};
