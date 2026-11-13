'use strict';

// Validates what the agent answered (docs/47-proposals.md). Whatever is not
// valid is dropped; an answer without a headline is refused.
const { cleanText } = require('./text');
const { validateWeekAnswer } = require('./week');
const { validateReviewAnswer } = require('./review');

const HEADLINE_MAX = 60;
const SUBTITLE_MAX = 160;
const DEFAULT_HEADLINE = { week: 'Ta semaine', review: 'Ta revue' };

const isObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

// The headline and subtitle of an answer. A legacy answer with only a
// `summary` keeps it as the subtitle and takes the default headline.
function headOf(kind, raw) {
    const headline = cleanText(raw.headline, HEADLINE_MAX);
    if (headline) {
        return {
            headline,
            subtitle: cleanText(raw.subtitle, SUBTITLE_MAX) || null,
        };
    }
    const summary = cleanText(raw.summary, SUBTITLE_MAX);
    if (summary) {
        return { headline: DEFAULT_HEADLINE[kind], subtitle: summary };
    }
    return null;
}

// `{ answer }` with the kept content, or `{ error: 'bad_answer' }`.
function validateAnswer(kind, facts, raw) {
    if (!isObject(raw)) return { error: 'bad_answer' };
    const head = headOf(kind, raw);
    if (!head) return { error: 'bad_answer' };
    const body =
        kind === 'week'
            ? validateWeekAnswer(facts, raw)
            : validateReviewAnswer(facts, raw);
    return { answer: { ...head, ...body } };
}

module.exports = {
    validateAnswer,
    HEADLINE_MAX,
    SUBTITLE_MAX,
    DEFAULT_HEADLINE,
};
