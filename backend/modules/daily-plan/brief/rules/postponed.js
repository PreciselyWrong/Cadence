'use strict';

// A task pushed back often enough is worth asking about: do it, drop it, or
// plan it for real. The count comes from review/postponements.js, already
// limited to the review window, so this rule only compares it.
const { texts } = require('./texts');

function postponedCards(input, settings) {
    const threshold = settings.thresholds.postponements;
    return input.tasks
        .map((task) => ({
            task,
            count: input.postponements?.[task.uid]?.recent_count ?? 0,
        }))
        .filter(({ count }) => count >= threshold)
        .map(({ task, count }) => ({
            key: `postponed:${task.uid}`,
            type: 'postponed',
            text: texts.card.postponed(count),
            task_uids: [task.uid],
            event_refs: [],
            question: null,
        }));
}

module.exports = { postponedCards };
