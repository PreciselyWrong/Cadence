'use strict';

const {
    QUEUE_SIZE,
    buildQueue,
    reviewFacts,
    validateReviewAnswer,
} = require('../../../modules/proposals/core/review');

const item = (uid, fields = {}) => ({
    uid,
    name: `Task ${uid}`,
    project: null,
    updated_at: '2026-11-01T10:00:00.000Z',
    reviewed_at: null,
    last_activity_at: '2026-11-01T10:00:00.000Z',
    review_due: false,
    pushed_times: 0,
    ...fields,
});

const lists = (over = {}) => ({ pushed: [], later: [], stale: [], ...over });

describe('buildQueue', () => {
    it('lists what needs a look first, then parked ideas', () => {
        const queue = buildQueue(
            lists({
                pushed: [item('p1')],
                stale: [item('s1')],
                later: [item('l1', { review_due: true }), item('l2')],
            })
        );
        expect(queue.map((entry) => entry.item.uid)).toEqual([
            'p1',
            'l1',
            's1',
            'l2',
        ]);
    });

    it('caps at the queue size and keeps parked places when there are some', () => {
        const pushed = Array.from({ length: 12 }, (_, i) => item(`p${i}`));
        const later = [item('l1'), item('l2')];
        const queue = buildQueue(lists({ pushed, later }));
        expect(queue).toHaveLength(QUEUE_SIZE);
        expect(queue.filter((entry) => entry.list === 'later')).toHaveLength(2);
    });

    it('reads the parked ideas looked at longest ago first', () => {
        const queue = buildQueue(
            lists({
                later: [
                    item('recent', { reviewed_at: '2026-11-10T00:00:00Z' }),
                    item('never'),
                ],
            })
        );
        expect(queue.map((entry) => entry.item.uid)).toEqual([
            'never',
            'recent',
        ]);
    });
});

describe('reviewFacts', () => {
    it('sends only the items to judge and reuses unchanged judgements', () => {
        const { facts } = reviewFacts({
            lists: lists({
                stale: [
                    item('same'),
                    item('moved', { updated_at: '2026-11-12T08:00:00.000Z' }),
                ],
            }),
            previous: new Map([
                [
                    'same',
                    {
                        stamp: '2026-11-01T10:00:00.000Z',
                        choice: 'drop',
                        reason: 'old',
                    },
                ],
                [
                    'moved',
                    {
                        stamp: '2026-11-01T10:00:00.000Z',
                        choice: 'drop',
                        reason: 'old',
                    },
                ],
            ]),
        });
        expect(facts.items.map((entry) => entry.uid)).toEqual(['moved']);
        expect(facts.cached).toEqual([
            {
                task_uid: 'same',
                name: 'Task same',
                list: 'stale',
                choice: 'drop',
                reason: 'old',
            },
        ]);
        expect(facts.stamps).toEqual({
            same: '2026-11-01T10:00:00.000Z',
            moved: '2026-11-12T08:00:00.000Z',
        });
    });

    it('judges again when the choice no longer exists for the list', () => {
        const { facts } = reviewFacts({
            lists: lists({ pushed: [item('p')] }),
            previous: new Map([
                [
                    'p',
                    {
                        stamp: '2026-11-01T10:00:00.000Z',
                        choice: 'in_view',
                        reason: 'x',
                    },
                ],
            ]),
        });
        expect(facts.items.map((entry) => entry.uid)).toEqual(['p']);
        expect(facts.items[0].choices).toEqual([
            'do_today',
            'later',
            'drop',
            'keep',
        ]);
    });

    it('sends nothing to judge when every item is reused', () => {
        const { facts } = reviewFacts({
            lists: lists({ stale: [item('s')] }),
            previous: new Map([
                [
                    's',
                    {
                        stamp: '2026-11-01T10:00:00.000Z',
                        choice: 'keep',
                        reason: '',
                    },
                ],
            ]),
        });
        expect(facts.items).toEqual([]);
        expect(facts.cached).toHaveLength(1);
    });
});

describe('validateReviewAnswer', () => {
    const { facts } = reviewFacts({
        lists: lists({ pushed: [item('p')], stale: [item('s')] }),
    });

    it('keeps one valid choice per asked task', () => {
        const { items } = validateReviewAnswer(facts, {
            summary: 'Deux choses.',
            items: [
                { task_uid: 'p', choice: 'do_today', reason: 'urgent' },
                { task_uid: 'p', choice: 'drop', reason: 'again' },
                {
                    task_uid: 's',
                    choice: 'do_today',
                    reason: 'not allowed for stale',
                },
                { task_uid: 'other', choice: 'drop', reason: 'not asked' },
                { task_uid: 's', choice: 'drop', reason: 'ok' },
            ],
        });
        expect(items).toEqual([
            { task_uid: 'p', choice: 'do_today', reason: 'urgent' },
            { task_uid: 's', choice: 'drop', reason: 'ok' },
        ]);
    });
});
