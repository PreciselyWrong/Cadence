import { renderHook } from '@testing-library/react';
import { useProjectMetrics } from '../useProjectMetrics';
import { Task } from '../../../entities/Task';

const task = (overrides: Partial<Task>): Task =>
    ({
        id: 1,
        uid: 't1',
        name: 'A task',
        status: 'not_started',
        priority: 'low',
        ...overrides,
    }) as Task;

const t = ((_key: string, fallback?: string) => fallback ?? _key) as never;

const nextFor = (tasks: Task[], nextTaskUid?: string | null) =>
    renderHook(() =>
        useProjectMetrics(
            tasks,
            jest.fn().mockResolvedValue(undefined),
            t,
            undefined,
            nextTaskUid
        )
    ).result.current.nextBestAction;

describe('useProjectMetrics next action', () => {
    const urgent = task({
        id: 1,
        uid: 'urgent',
        name: 'Urgent',
        priority: 'high',
    });
    const picked = task({ id: 2, uid: 'picked', name: 'Picked by me' });

    it('suggests automatically when nothing is designated', () => {
        expect(nextFor([urgent, picked])?.uid).toBe('urgent');
    });

    it('prefers the designated task over the automatic suggestion', () => {
        expect(nextFor([urgent, picked], 'picked')?.uid).toBe('picked');
    });

    it('falls back on the automatic suggestion when the pick is done or gone', () => {
        const done = task({ id: 2, uid: 'picked', status: 'done' });
        expect(nextFor([urgent, done], 'picked')?.uid).toBe('urgent');
        expect(nextFor([urgent], 'missing')?.uid).toBe('urgent');
    });
});
