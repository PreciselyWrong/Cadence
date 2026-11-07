'use strict';

const { laterReviewDay } = require('./reviewDate');

// A link is to read (`new`) or set aside (`dropped`, hidden by default, never
// deleted). "Later" is a review day, not a status.
const LINK_STATUSES = ['new', 'dropped'];
// The former statuses. Every input path reads them as `new`.
const LEGACY_LINK_STATUSES = ['to_evaluate', 'tested', 'kept', 'parked'];
const LINK_STATUS_INPUTS = [...LINK_STATUSES, ...LEGACY_LINK_STATUSES];
const LINK_KINDS = ['repo', 'article', 'video', 'tool', 'other'];
const LINK_SOURCES = ['inbox_item', 'task', 'note'];

const foldLinkStatus = (status) =>
    LEGACY_LINK_STATUSES.includes(status) ? 'new' : status;

// The fields a write stores for the status it carries (`input` keys are the
// column names). A former status becomes `new`; a former `parked` also sets a
// review day 30 days out unless the write gives one. Returns `{ fields }`, or
// `{ invalid: 'status' }` for a value that is neither kind.
function normalizeLinkStatus(input) {
    if (!('status' in input)) return { fields: input };
    if (!LINK_STATUS_INPUTS.includes(input.status)) {
        return { invalid: 'status' };
    }
    if (!LEGACY_LINK_STATUSES.includes(input.status)) {
        return { fields: input };
    }
    const fields = { ...input, status: foldLinkStatus(input.status) };
    if (input.status === 'parked' && !('review_at' in input)) {
        fields.review_at = laterReviewDay();
    }
    return { fields };
}

module.exports = {
    LINK_STATUSES,
    LEGACY_LINK_STATUSES,
    LINK_STATUS_INPUTS,
    LINK_KINDS,
    LINK_SOURCES,
    foldLinkStatus,
    normalizeLinkStatus,
};
