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

    it('refuses an object with nothing usable left', () => {
        expect(
            validateAnswer('week', facts, {
                changes: [{ task_uid: 'x', op: 'drop' }],
            })
        ).toEqual({
            error: 'bad_answer',
        });
    });

    it('accepts a summary without changes', () => {
        expect(
            validateAnswer('week', facts, { summary: 'Rien à changer.' })
        ).toEqual({
            answer: { summary: 'Rien à changer.', questions: [], changes: [] },
        });
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
                items: [{ task_uid: 'p', choice: 'nope' }],
            })
        ).toEqual({
            error: 'bad_answer',
        });
        expect(
            validateAnswer('review', review, {
                items: [{ task_uid: 'p', choice: 'later', reason: 'r' }],
            })
        ).toEqual({
            answer: {
                summary: '',
                items: [{ task_uid: 'p', choice: 'later', reason: 'r' }],
            },
        });
    });
});
