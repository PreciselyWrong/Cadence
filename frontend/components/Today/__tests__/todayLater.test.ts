import { Task } from '../../../entities/Task';
import { TASK_STATUS } from '../../../constants/taskStatus';
import type { DayResponse } from '../../../utils/dayService';
import { computeTodayLater } from '../todayLater';

const task = (uid: string, fields: Partial<Task> = {}): Task =>
    ({
        uid,
        name: `Task ${uid}`,
        status: TASK_STATUS.NOT_STARTED,
        ...fields,
    }) as Task;

const emptyDay = (date: string): DayResponse => ({
    date,
    is_today: false,
    day_hours: { start: 480, end: 1080 },
    focus_blocks_of_day: [],
    plan: null,
    etag: 'e1',
    due: [],
    overdue: [],
    suggestions: null,
    completed: [],
});

describe('computeTodayLater', () => {
    it('collects planned and due tasks for tomorrow, deduping against shown and then tomorrow before suggestions', () => {
        const tomorrowDay: DayResponse = {
            ...emptyDay('2026-11-20'),
            plan: {
                uid: 'p1',
                date: '2026-11-20',
                started_at: null,
                items: [
                    {
                        task_uid: 'shown1',
                        task: task('shown1'),
                        position: 0,
                        start_minute: null,
                        duration_minutes: 30,
                    },
                    {
                        task_uid: 'tmw-plan',
                        task: task('tmw-plan'),
                        position: 1,
                        start_minute: null,
                        duration_minutes: 30,
                    },
                    {
                        task_uid: 'tmw-done',
                        task: task('tmw-done', { status: TASK_STATUS.DONE }),
                        position: 2,
                        start_minute: null,
                        duration_minutes: 30,
                    },
                ],
            },
            due: [task('tmw-plan'), task('tmw-due')],
        };
        const suggestions = [
            task('shown1'),
            task('tmw-due'),
            task('sug1'),
            task('sug1'),
        ];

        const result = computeTodayLater(
            tomorrowDay,
            suggestions,
            new Set(['shown1'])
        );

        expect(result.tomorrow.map((t) => t.uid)).toEqual([
            'tmw-plan',
            'tmw-due',
        ]);
        expect(result.suggested.map((t) => t.uid)).toEqual(['sug1']);
    });

    it('returns empty tomorrow when tomorrowDay is null', () => {
        const result = computeTodayLater(
            null,
            [task('s1'), task('s2')],
            new Set(['s1'])
        );
        expect(result.tomorrow).toEqual([]);
        expect(result.suggested.map((t) => t.uid)).toEqual(['s2']);
    });
});
