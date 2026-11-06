'use strict';

// What can be deduced without a model: pure functions of the same input as the
// daily brief, with every open task in it. A rule proposes at most one thing
// per task, and only asks when it cannot decide (docs/40-triage.md).
const { duplicateCards } = require('../../daily-plan/brief/rules/duplicates');
const { deadlineCards } = require('../../daily-plan/brief/rules/noteDeadlines');
const { postponedCards } = require('../../daily-plan/brief/rules/postponed');
const { conflictCards } = require('../../daily-plan/brief/rules/conflicts');
const { isSilenced } = require('../../daily-plan/brief/rules/contexts');

const ACTION_OF = {
    duplicate: (card) => ({ action: 'cancel', payload: card.payload }),
    deadline_in_note: (card) => ({ action: 'set_due', payload: card.payload }),
    postponed: () => ({ action: 'cancel', payload: null }),
};

function toItem(card) {
    const proposed = ACTION_OF[card.type];
    const onTask = Boolean(proposed);
    const { action, payload } = onTask
        ? proposed(card)
        : { action: 'question', payload: null };
    return {
        key: card.key,
        type: card.type,
        source: 'rules',
        task_uid: onTask ? card.task_uids[0] : null,
        action,
        payload: payload ?? null,
        reason: card.text,
        details: card.details ?? [],
        // Only an event needs an answer: a task's card already says what to do.
        question: onTask ? null : card.question,
    };
}

// `input` as collectInput builds it. A file-backed task is the file's business,
// and each task gets the first thing found for it.
function ruleItems(input, settings) {
    const disabled = new Set(settings.alerts?.disabled || []);
    const fileBacked = new Set(
        input.tasks.filter((task) => task.file_backed).map((task) => task.uid)
    );
    const seen = new Set();
    return [
        ...duplicateCards(input, settings),
        ...deadlineCards(input),
        ...postponedCards(input, settings),
        ...conflictCards(input),
    ]
        .filter((card) => !disabled.has(card.type))
        .filter(
            (card) =>
                !card.question ||
                !isSilenced(card.question.target, input.contexts)
        )
        .map(toItem)
        .filter((item) => !fileBacked.has(item.task_uid))
        .filter((item) => {
            if (!item.task_uid) return true;
            if (seen.has(item.task_uid)) return false;
            seen.add(item.task_uid);
            return true;
        });
}

module.exports = { ruleItems };
