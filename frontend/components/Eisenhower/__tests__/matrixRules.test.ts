import { Task } from '../../../entities/Task';
import {
    assignToQuadrants,
    DEFAULT_MATRIX,
    emptyRule,
    matchesRule,
    taskPriority,
} from '../matrixRules';
import { EisenhowerMatrixConfig } from '../../../utils/profileService';

const NOW = new Date(2026, 9, 29, 12, 0, 0); // 29 Oct 2026, local noon

const task = (overrides: Partial<Task> = {}): Task =>
    ({ id: 1, name: 'T', priority: 0, tags: [], ...overrides }) as Task;

describe('taskPriority', () => {
    it('maps numbers, names and empty values', () => {
        expect(taskPriority(task({ priority: null }))).toBe('none');
        expect(taskPriority(task({ priority: undefined }))).toBe('none');
        expect(taskPriority(task({ priority: 0 }))).toBe('low');
        expect(taskPriority(task({ priority: 1 }))).toBe('medium');
        expect(taskPriority(task({ priority: 'high' }))).toBe('high');
    });
});

describe('matchesRule', () => {
    it('matches everything with an empty rule', () => {
        expect(matchesRule(task(), emptyRule(), { now: NOW })).toBe(true);
    });

    it('filters by any of the priorities', () => {
        const rule = { ...emptyRule(), priorities: ['none', 'high'] as any };
        expect(matchesRule(task({ priority: null }), rule)).toBe(true);
        expect(matchesRule(task({ priority: 2 }), rule)).toBe(true);
        expect(matchesRule(task({ priority: 0 }), rule)).toBe(false);
    });

    it('filters by the due window', () => {
        const ctx = { now: NOW };
        const rule = (type: any, days?: number) => ({
            ...emptyRule(),
            due: { type, days },
        });
        const overdue = task({ due_date: '2026-10-28' });
        const today = task({ due_date: '2026-10-29' });
        const inThree = task({ due_date: '2026-11-01' });
        const noDate = task({ due_date: undefined });

        expect(matchesRule(overdue, rule('overdue'), ctx)).toBe(true);
        expect(matchesRule(today, rule('overdue'), ctx)).toBe(false);
        expect(matchesRule(noDate, rule('overdue'), ctx)).toBe(false);

        expect(matchesRule(today, rule('today'), ctx)).toBe(true);
        expect(matchesRule(inThree, rule('today'), ctx)).toBe(false);

        expect(matchesRule(inThree, rule('within', 3), ctx)).toBe(true);
        expect(matchesRule(inThree, rule('within', 2), ctx)).toBe(false);
        expect(matchesRule(overdue, rule('within', 2), ctx)).toBe(true);
        expect(matchesRule(noDate, rule('within', 2), ctx)).toBe(false);

        expect(matchesRule(noDate, rule('none'), ctx)).toBe(true);
        expect(matchesRule(today, rule('none'), ctx)).toBe(false);
    });

    it('filters by any of the tags, ignoring case', () => {
        const rule = { ...emptyRule(), tags: ['urgent', 'home'] };
        expect(
            matchesRule(task({ tags: [{ name: 'Home' }] as any }), rule)
        ).toBe(true);
        expect(
            matchesRule(task({ tags: [{ name: 'work' }] as any }), rule)
        ).toBe(false);
        expect(matchesRule(task({ tags: undefined }), rule)).toBe(false);
    });

    it('filters by project uid, from the task or the resolver', () => {
        const rule = { ...emptyRule(), projects: ['p1'] };
        expect(
            matchesRule(
                task({ Project: { uid: 'p1', name: 'P' } as any }),
                rule
            )
        ).toBe(true);
        expect(
            matchesRule(task({ project_id: 7 }), rule, {
                projectUid: (t) => (t.project_id === 7 ? 'p1' : undefined),
            })
        ).toBe(true);
        expect(matchesRule(task({ project_id: 8 }), rule)).toBe(false);
    });
});

describe('assignToQuadrants', () => {
    it('reproduces the built-in matrix', () => {
        const urgentTag = [{ name: 'urgent' }] as any;
        const doNow = task({ id: 1, priority: 2, tags: urgentTag });
        const schedule = task({ id: 2, priority: 1 });
        const delegate = task({ id: 3, priority: 0, tags: urgentTag });
        const eliminate = task({ id: 4, priority: null });

        const buckets = assignToQuadrants(
            [doNow, schedule, delegate, eliminate],
            DEFAULT_MATRIX
        );
        expect(buckets.map((b) => b.map((t) => t.id))).toEqual([
            [1],
            [2],
            [3],
            [4],
        ]);
    });

    it('places a task only in the first matching quadrant and drops unmatched ones', () => {
        const matrix: EisenhowerMatrixConfig = {
            id: 'm',
            name: 'M',
            quadrants: [
                { name: 'A', rule: { ...emptyRule(), priorities: ['high'] } },
                { name: 'B', rule: { ...emptyRule(), priorities: ['high'] } },
                { name: 'C', rule: { ...emptyRule(), tags: ['x'] } },
                { name: 'D', rule: { ...emptyRule(), tags: ['y'] } },
            ],
        };
        const buckets = assignToQuadrants(
            [task({ id: 1, priority: 2 }), task({ id: 2, priority: 0 })],
            matrix
        );
        expect(buckets.map((b) => b.map((t) => t.id))).toEqual([
            [1],
            [],
            [],
            [],
        ]);
    });
});
