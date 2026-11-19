import { TASK_STATUS } from '../../constants/taskStatus';
import { Task } from '../../entities/Task';
import { isTodoMdTask } from '../../utils/todoMd';
import {
    commitmentClearPatch,
    commitmentOf,
    HorizonKey,
    horizonDuePatch,
} from '../Upcoming/horizons';
import { shiftDay } from '../Upcoming/planOps';
import { spreadOverdue } from '../Upcoming/spreadOverdue';

export type ReplanChoice =
    | { kind: 'day'; date: string }
    | { kind: 'horizon'; horizon: HorizonKey }
    | { kind: 'done' }
    | { kind: 'drop' }
    | { kind: 'skip' };

export type ReplanKind = 'day' | 'horizon' | 'done' | 'drop' | 'skip';

type HorizonTask = Task & {
    month_of?: string | null;
    later?: boolean;
    unplan?: boolean;
};

const isRecurring = (task: Task): boolean =>
    !!task.recurrence_type && task.recurrence_type !== 'none';

const isSomeday = (task: Task): boolean =>
    (task.tags ?? []).some((tag) => tag.name?.toLowerCase() === 'someday');

/**
 * Allowed choice families for an overdue task: recurring tasks can only be
 * completed or skipped; TODO.md-backed tasks cannot be dropped from Cadence.
 */
export const replanKinds = (task: Task): Set<ReplanKind> => {
    if (isRecurring(task)) return new Set(['done', 'skip']);
    if (isTodoMdTask(task)) return new Set(['day', 'horizon', 'done']);
    return new Set(['day', 'horizon', 'done', 'drop']);
};

/**
 * Builds the `PATCH /task` payload for a replan choice (`day`, `horizon`,
 * or `drop`). `done` and `skip` use their dedicated endpoints.
 */
export const replanPatch = (
    task: Task,
    choice: ReplanChoice,
    today: string,
    firstDayOfWeek: number,
    plannedDate?: string | null
): Partial<HorizonTask> | null => {
    if (choice.kind === 'day') {
        const clear = commitmentClearPatch(task) ?? {};
        const keepTime = !!task.due_has_time && !!task.due_time;
        const needsUnplan = plannedDate !== choice.date;
        return {
            ...clear,
            due_date: choice.date,
            due_time: keepTime ? task.due_time : null,
            ...(needsUnplan ? { unplan: true } : {}),
        };
    }
    if (choice.kind === 'horizon') {
        return horizonDuePatch(
            commitmentOf(task, today, firstDayOfWeek),
            choice.horizon
        );
    }
    if (choice.kind === 'drop') {
        return { status: TASK_STATUS.CANCELLED, unplan: true };
    }
    return null;
};

/** Builds the `PATCH /task` payload to undo a replan choice. */
export const restoreTaskPatch = (task: Task): Partial<HorizonTask> => {
    const held = task as HorizonTask;
    return {
        due_date: task.due_date ?? null,
        due_time: task.due_time ?? null,
        due_has_time: !!task.due_has_time,
        week_of: task.week_of ?? null,
        month_of: held.month_of ?? null,
        ...(isSomeday(task) ? { later: true } : {}),
        status: task.status,
    };
};

const movableOverdue = (tasks: Task[]): Task[] => {
    const seen = new Set<string>();
    return tasks.filter((task) => {
        if (!task.uid || isRecurring(task) || seen.has(task.uid)) return false;
        seen.add(task.uid);
        return true;
    });
};

/** Bulk choice: move all non-recurring overdue tasks to tomorrow. */
export const allTomorrowChoices = (
    tasks: Task[],
    today: string
): Array<{ task: Task; choice: ReplanChoice }> => {
    const tomorrow = shiftDay(today, 1);
    return movableOverdue(tasks).map((task) => ({
        task,
        choice: { kind: 'day', date: tomorrow },
    }));
};

/**
 * Bulk choice: spread non-recurring overdue tasks across the next 7 days
 * using the shared `spreadOverdue` rule.
 */
export const spreadOverdueChoices = (
    tasks: Task[],
    today: string,
    plannedByDay: Record<string, Array<{ estimated_minutes?: number | null }>>
): Array<{ task: Task; choice: ReplanChoice }> => {
    const movable = movableOverdue(tasks);
    const byUid = new Map(movable.map((task) => [task.uid as string, task]));
    return spreadOverdue(
        movable.map((task) => ({
            uid: task.uid as string,
            priority: task.priority,
            due_date: task.due_date,
            estimated_minutes: task.estimated_minutes,
            start_date: task.start_date,
            defer_until: task.defer_until,
        })),
        today,
        plannedByDay
    )
        .map(({ uid, date }) => {
            const task = byUid.get(uid);
            return task
                ? { task, choice: { kind: 'day' as const, date } }
                : null;
        })
        .filter(
            (
                entry
            ): entry is { task: Task; choice: { kind: 'day'; date: string } } =>
                entry !== null
        );
};

export const WEEK_DAYS = 7;

/** Next 7 days starting from `today` with their known task counts. */
export const weekDayCounts = (
    today: string,
    counts: Record<string, number>
): Array<{ date: string; count: number }> =>
    Array.from({ length: WEEK_DAYS }, (_, i) => {
        const date = shiftDay(today, i);
        return { date, count: counts[date] ?? 0 };
    });
