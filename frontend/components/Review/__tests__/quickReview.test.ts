import { buildQuickReview, quickKey, QuickLists } from '../reviewUtils';
import {
    InboxReviewItem,
    ProjectReviewItem,
    PushedItem,
    TaskReviewItem,
} from '../../../utils/reviewService';
import { Task } from '../../../entities/Task';

const inbox = (uid: string): InboxReviewItem => ({
    uid,
    title: null,
    content: `Idea ${uid}`,
    created_at: '2026-10-01T00:00:00Z',
});
const pushed = (uid: string): PushedItem => ({
    task: { uid, name: `Pushed ${uid}` } as Task,
    push: {
        recent_count: 3,
        total_count: 3,
        last_postponed_on: null,
        last_planned_for: null,
        frequent: true,
    } as PushedItem['push'],
});
const project = (uid: string): ProjectReviewItem => ({
    project: {
        id: 1,
        uid,
        name: `Project ${uid}`,
        status: 'in_progress',
        due_date_at: null,
    },
    reasons: ['quiet'],
    open_tasks: 1,
    last_activity_at: null,
});
const task = (
    uid: string,
    touched: string,
    reviewed: string | null = null,
    due = false
): TaskReviewItem => ({
    task: { uid, name: `Task ${uid}`, reviewed_at: reviewed } as Task,
    review_due: due,
    last_activity_at: touched,
});

const empty: QuickLists = {
    undecided: [],
    pushed: [],
    projects: [],
    later: [],
    stale: [],
};

describe('buildQuickReview', () => {
    it('puts what needs a look first, in the order of a review', () => {
        const lists: QuickLists = {
            undecided: [inbox('i1')],
            pushed: [pushed('t1')],
            projects: [project('p1')],
            later: [
                task('l1', '2026-10-30T00:00:00Z'),
                task('l2', '2026-10-01T00:00:00Z', null, true),
            ],
            stale: [task('s1', '2026-05-01T00:00:00Z')],
        };
        expect(buildQuickReview(lists).map(quickKey)).toEqual([
            'i:i1',
            't:t1',
            'p:p1',
            't:l2',
            't:s1',
            't:l1',
        ]);
    });

    it('fills the rest with the parked ideas looked at longest ago', () => {
        const lists: QuickLists = {
            ...empty,
            later: [
                task('recent', '2026-10-30T00:00:00Z', '2026-10-30T00:00:00Z'),
                task('never-new', '2026-10-20T00:00:00Z'),
                task(
                    'old-review',
                    '2026-10-25T00:00:00Z',
                    '2026-06-01T00:00:00Z'
                ),
                task('never-old', '2026-03-01T00:00:00Z'),
            ],
        };
        expect(buildQuickReview(lists).map(quickKey)).toEqual([
            't:never-old',
            't:never-new',
            't:old-review',
            't:recent',
        ]);
    });

    it('stays short and shows a task once even when two lists hold it', () => {
        const lists: QuickLists = {
            ...empty,
            pushed: [pushed('same')],
            stale: [task('same', '2026-01-01T00:00:00Z')],
            later: Array.from({ length: 30 }, (_, i) =>
                task(`l${i}`, '2026-10-01T00:00:00Z')
            ),
        };
        const session = buildQuickReview(lists);
        expect(session).toHaveLength(10);
        expect(session.filter((e) => quickKey(e) === 't:same')).toHaveLength(1);
        expect(session[0].category).toBe('pushed');
    });

    it('keeps three places for parked ideas when much needs a look', () => {
        const lists: QuickLists = {
            ...empty,
            undecided: Array.from({ length: 12 }, (_, i) => inbox(`i${i}`)),
            later: Array.from({ length: 5 }, (_, i) =>
                task(`l${i}`, `2026-10-0${i + 1}T00:00:00Z`)
            ),
        };
        const keys = buildQuickReview(lists).map(quickKey);
        expect(keys).toHaveLength(10);
        expect(keys.slice(0, 7)).toEqual(
            Array.from({ length: 7 }, (_, i) => `i:i${i}`)
        );
        expect(keys.slice(7)).toEqual(['t:l0', 't:l1', 't:l2']);
    });

    it('leaves out what was skipped earlier in the visit', () => {
        const lists: QuickLists = {
            ...empty,
            undecided: [inbox('i1'), inbox('i2')],
        };
        expect(buildQuickReview(lists, 10, ['i:i1']).map(quickKey)).toEqual([
            'i:i2',
        ]);
    });
});
