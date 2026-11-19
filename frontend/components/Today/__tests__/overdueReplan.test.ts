import { Task } from '../../../entities/Task';
import { TASK_STATUS } from '../../../constants/taskStatus';
import {
    allTomorrowChoices,
    replanKinds,
    replanPatch,
    restoreTaskPatch,
    spreadOverdueChoices,
    weekDayCounts,
} from '../overdueReplan';

const task = (uid: string, fields: Partial<Task> = {}): Task =>
    ({
        uid,
        name: `Task ${uid}`,
        status: TASK_STATUS.NOT_STARTED,
        due_date: '2026-11-10',
        ...fields,
    }) as Task;

describe('overdueReplan', () => {
    describe('replanKinds', () => {
        it('allows day, horizon, done, and drop for a normal task', () => {
            expect(replanKinds(task('a'))).toEqual(
                new Set(['day', 'horizon', 'done', 'drop'])
            );
        });

        it('restricts recurring tasks to done and skip only', () => {
            expect(
                replanKinds(task('r', { recurrence_type: 'daily' }))
            ).toEqual(new Set(['done', 'skip']));
        });

        it('forbids drop on TODO.md file-backed tasks', () => {
            expect(replanKinds(task('f', { source_key: 'todo:1' }))).toEqual(
                new Set(['day', 'horizon', 'done'])
            );
        });
    });

    describe('replanPatch & restoreTaskPatch', () => {
        const today = '2026-11-19';

        it('moves a task to a chosen day, clearing commitments and keeping due_time if set', () => {
            const t = task('a', {
                due_date: '2026-11-10',
                due_time: '14:30',
                due_has_time: true,
                week_of: '2026-11-09',
            });
            expect(
                replanPatch(t, { kind: 'day', date: '2026-11-20' }, today, 1)
            ).toEqual({
                due_date: '2026-11-20',
                due_time: '14:30',
                week_of: null,
                month_of: null,
                unplan: true,
            });
        });

        it('does not unplan when already planned on the chosen day', () => {
            const t = task('a', { due_date: '2026-11-10' });
            expect(
                replanPatch(
                    t,
                    { kind: 'day', date: '2026-11-21' },
                    today,
                    1,
                    '2026-11-21'
                )
            ).toEqual({
                due_date: '2026-11-21',
                due_time: null,
            });
        });

        it('moves a task to a horizon, clearing due date and unplanning', () => {
            const t = task('a', { due_date: '2026-11-10' });
            expect(
                replanPatch(
                    t,
                    { kind: 'horizon', horizon: 'next_week' },
                    today,
                    1
                )
            ).toEqual({
                week_of: 'next_week',
                month_of: null,
                due_date: null,
                due_time: null,
                due_has_time: false,
                unplan: true,
            });
        });

        it('drops a task by cancelling and unplanning it', () => {
            const t = task('a');
            expect(replanPatch(t, { kind: 'drop' }, today, 1)).toEqual({
                status: TASK_STATUS.CANCELLED,
                unplan: true,
            });
        });

        it('builds an undo patch that restores due date, commitments, and status', () => {
            const t = task('a', {
                due_date: '2026-11-10',
                due_time: '09:00',
                due_has_time: true,
                week_of: '2026-11-09',
                status: TASK_STATUS.IN_PROGRESS,
                tags: [{ name: 'someday' } as never],
            });
            expect(restoreTaskPatch(t)).toEqual({
                due_date: '2026-11-10',
                due_time: '09:00',
                due_has_time: true,
                week_of: '2026-11-09',
                month_of: null,
                later: true,
                status: TASK_STATUS.IN_PROGRESS,
            });
        });
    });

    describe('bulk actions', () => {
        const today = '2026-11-19';

        it('allTomorrowChoices targets tomorrow and skips recurring tasks', () => {
            const tasks = [
                task('a'),
                task('r', { recurrence_type: 'weekly' }),
                task('b'),
            ];
            expect(allTomorrowChoices(tasks, today)).toEqual([
                { task: tasks[0], choice: { kind: 'day', date: '2026-11-20' } },
                { task: tasks[2], choice: { kind: 'day', date: '2026-11-20' } },
            ]);
        });

        it('spreadOverdueChoices reuses spreadOverdue and skips recurring tasks', () => {
            const tasks = [
                task('low', { priority: 0, due_date: '2026-11-01' }),
                task('rec', {
                    recurrence_type: 'daily',
                    due_date: '2026-11-01',
                }),
                task('high', { priority: 2, due_date: '2026-11-09' }),
            ];
            const choices = spreadOverdueChoices(tasks, today, {
                '2026-11-19': [{ estimated_minutes: 60 }],
            });
            expect(choices.map((c) => c.task.uid)).toEqual(['high', 'low']);
            expect(choices[0].choice).toEqual({
                kind: 'day',
                date: '2026-11-20',
            });
        });
    });

    describe('weekDayCounts', () => {
        it('returns 7 days starting from today with counts (null when not loaded)', () => {
            expect(
                weekDayCounts('2026-11-19', {
                    '2026-11-19': 3,
                    '2026-11-21': 2,
                })
            ).toEqual([
                { date: '2026-11-19', count: 3 },
                { date: '2026-11-20', count: null },
                { date: '2026-11-21', count: 2 },
                { date: '2026-11-22', count: null },
                { date: '2026-11-23', count: null },
                { date: '2026-11-24', count: null },
                { date: '2026-11-25', count: null },
            ]);
        });
    });
});
