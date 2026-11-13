'use strict';

const { validateAnswer } = require('../../../modules/proposals/core/answer');
const { reviewFacts } = require('../../../modules/proposals/core/review');

const facts = {
    period: { start: '2026-11-16', end: '2026-11-22' },
    tasks: [{ uid: 'a', name: 'A' }],
};

describe('validateAnswer', () => {
    it('refuses an answer that is not an object', () => {
        expect(validateAnswer('week', facts, 'text')).toEqual({
            error: 'bad_answer',
        });
        expect(validateAnswer('week', facts, [])).toEqual({
            error: 'bad_answer',
        });
        expect(validateAnswer('week', facts, null)).toEqual({
            error: 'bad_answer',
        });
    });

    it('refuses an answer without a headline, even with changes', () => {
        expect(
            validateAnswer('week', facts, {
                changes: [{ task_uid: 'a', op: 'drop' }],
            })
        ).toEqual({ error: 'bad_answer' });
        expect(
            validateAnswer('week', facts, { headline: '   ', summary: '' })
        ).toEqual({ error: 'bad_answer' });
    });

    it('keeps the headline and the subtitle, and no longer a summary', () => {
        expect(
            validateAnswer('week', facts, {
                headline: 'Mardi libre',
                subtitle: 'Deux retards replacés.',
            })
        ).toEqual({
            answer: {
                headline: 'Mardi libre',
                subtitle: 'Deux retards replacés.',
                questions: [],
                changes: [],
            },
        });
    });

    it('accepts a headline without subtitle', () => {
        expect(
            validateAnswer('week', facts, { headline: 'Rien à changer' })
        ).toEqual({
            answer: {
                headline: 'Rien à changer',
                subtitle: null,
                questions: [],
                changes: [],
            },
        });
    });

    it('maps a legacy summary to the subtitle and a default headline', () => {
        expect(
            validateAnswer('week', facts, { summary: 'Rien à changer.' })
        ).toEqual({
            answer: {
                headline: 'Ta semaine',
                subtitle: 'Rien à changer.',
                questions: [],
                changes: [],
            },
        });
    });

    it('caps the headline at 60 characters and the subtitle at 160', () => {
        const { answer } = validateAnswer('week', facts, {
            headline: 'h'.repeat(90),
            subtitle: 's'.repeat(300),
        });
        expect(answer.headline).toHaveLength(60);
        expect(answer.subtitle).toHaveLength(160);
    });

    it('checks review answers against the items it asked for', () => {
        const { facts: review } = reviewFacts({
            lists: {
                pushed: [
                    {
                        uid: 'p',
                        name: 'P',
                        updated_at: '2026-11-01T00:00:00Z',
                        pushed_times: 3,
                        review_due: false,
                        last_activity_at: '2026-11-01T00:00:00Z',
                    },
                ],
                later: [],
                stale: [],
            },
        });
        expect(
            validateAnswer('review', review, {
                headline: 'Revue',
                items: [{ task_uid: 'p', choice: 'nope' }],
            })
        ).toEqual({
            answer: { headline: 'Revue', subtitle: null, items: [] },
        });
        expect(
            validateAnswer('review', review, {
                headline: 'Une tâche',
                items: [{ task_uid: 'p', choice: 'later', reason: 'r' }],
            })
        ).toEqual({
            answer: {
                headline: 'Une tâche',
                subtitle: null,
                items: [{ task_uid: 'p', choice: 'later', reason: 'r' }],
            },
        });
    });

    it('maps a legacy review summary to the subtitle of the review', () => {
        const { facts: review } = reviewFacts({
            lists: { pushed: [], later: [], stale: [] },
        });
        expect(
            validateAnswer('review', review, {
                summary: 'Deux choses.',
                items: [],
            })
        ).toEqual({
            answer: {
                headline: 'Ta revue',
                subtitle: 'Deux choses.',
                items: [],
            },
        });
    });
});
