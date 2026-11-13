'use strict';

// Validates what the agent answered (docs/47-proposals.md). Whatever is not
// valid is dropped; an answer with nothing usable left is refused.
const { validateWeekAnswer } = require('./week');
const { validateReviewAnswer } = require('./review');

const isObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

// `{ answer }` with the kept content, or `{ error: 'bad_answer' }`.
function validateAnswer(kind, facts, raw) {
    if (!isObject(raw)) return { error: 'bad_answer' };
    const answer =
        kind === 'week'
            ? validateWeekAnswer(facts, raw)
            : validateReviewAnswer(facts, raw);
    const usable =
        answer.summary ||
        answer.changes?.length ||
        answer.questions?.length ||
        answer.items?.length;
    return usable ? { answer } : { error: 'bad_answer' };
}

module.exports = { validateAnswer };
