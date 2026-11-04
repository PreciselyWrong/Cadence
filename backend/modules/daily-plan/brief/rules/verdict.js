'use strict';

// The one sentence at the top of the brief, built from the counters only.
// An LLM may rewrite it later; this is the fallback and always available.
const { texts } = require('./texts');

function verdictText(counters) {
    const parts = [];
    if (counters.overdue) parts.push(texts.verdict.overdue(counters.overdue));
    if (counters.due_today)
        parts.push(texts.verdict.dueToday(counters.due_today));
    if (counters.conflicts)
        parts.push(texts.verdict.conflicts(counters.conflicts));
    if (counters.replies) parts.push(texts.verdict.replies(counters.replies));
    if (counters.tonight_minutes) {
        parts.push(texts.verdict.tonight(counters.tonight_minutes));
    }
    if (!parts.length) return texts.nothingUrgent;
    const sentence = `${parts.join(', ')}.`;
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

module.exports = { verdictText };
