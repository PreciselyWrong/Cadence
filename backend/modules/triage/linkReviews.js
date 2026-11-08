'use strict';

// Links with a review day (docs/37-links.md) come back in « À trier » on that
// day, one card each: keep (no more review day), archive, or 30 days later.
const { ValidationError } = require('../../shared/errors');
const linksRepository = require('../links/repository');
const linksService = require('../links/service');
const { laterReviewDay } = require('../links/core/reviewDate');

const DECISIONS = {
    keep: { review_at: null },
    archive: { status: 'dropped', review_at: null },
    later: () => ({ review_at: laterReviewDay() }),
};

async function reviewItems(userId, today) {
    const due = await linksRepository.dueForReview(userId, today);
    return due.map((link) => ({
        key: `link_review:${link.uid}`,
        type: 'link_review',
        source: 'links',
        task_uid: null,
        action: 'review_link',
        payload: {
            link_uid: link.uid,
            title: link.title || null,
            url: link.url,
            review_at: link.review_at,
        },
        reason: 'Lien à revoir',
        details: [],
        question: null,
    }));
}

async function decide(user, uid, decision) {
    const change = DECISIONS[decision];
    if (!change) {
        throw new ValidationError(
            `decision must be one of ${Object.keys(DECISIONS).join(', ')}`
        );
    }
    return linksService.update(
        user.id,
        uid,
        typeof change === 'function' ? change() : change
    );
}

module.exports = { reviewItems, decide };
