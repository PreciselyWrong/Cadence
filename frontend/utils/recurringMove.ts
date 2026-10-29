import { create } from 'zustand';
import { Task } from '../entities/Task';
import {
    moveTaskOccurrence,
    RecurringMoveScope,
    updateTask,
} from './tasksService';

export type { RecurringMoveScope };

export const RECURRING_MOVE_CANCELLED = 'RECURRING_MOVE_CANCELLED';

export const isRecurringMoveCancelled = (error: unknown): boolean =>
    error instanceof Error && error.message === RECURRING_MOVE_CANCELLED;

interface PendingRecurringMove {
    resolve: (scope: RecurringMoveScope | null) => void;
}

export const useRecurringMoveStore = create<{
    pending: PendingRecurringMove | null;
}>(() => ({ pending: null }));

// A newer prompt replaces an unanswered one, which resolves as cancelled.
export const askRecurringMoveScope = () =>
    new Promise<RecurringMoveScope | null>((resolve) => {
        useRecurringMoveStore.getState().pending?.resolve(null);
        useRecurringMoveStore.setState({ pending: { resolve } });
    });

export const answerRecurringMove = (scope: RecurringMoveScope | null) => {
    const { pending } = useRecurringMoveStore.getState();
    if (!pending) return;
    useRecurringMoveStore.setState({ pending: null });
    pending.resolve(scope);
};

export const isRecurringTask = (
    task: Pick<Task, 'recurrence_type' | 'habit_mode'>
): boolean =>
    !!task.recurrence_type &&
    task.recurrence_type !== 'none' &&
    !task.habit_mode;

// Due dates are 'YYYY-MM-DD'; a datetime string keeps only its day.
const dayOf = (date: string) => date.slice(0, 10);

// Saves a due date. A recurring task asks which occurrences should move and
// moves them through the occurrence API. Throws RECURRING_MOVE_CANCELLED when
// the user dismisses the prompt, so callers can revert without an error toast.
export const moveTaskDue = async (
    task: Task,
    change: { due_date: string | null; due_time?: string | null }
): Promise<Task> => {
    if (!task.uid) throw new Error('Task has no uid');
    const uid = task.uid;
    const { due_date, due_time } = change;

    const sameDay =
        !!due_date &&
        !!task.due_date &&
        dayOf(due_date) === dayOf(task.due_date);
    if (!due_date || !task.due_date || sameDay || !isRecurringTask(task)) {
        return updateTask(uid, { due_date, due_time });
    }

    const scope = await askRecurringMoveScope();
    if (!scope) throw new Error(RECURRING_MOVE_CANCELLED);

    const { task: parent, moved } = await moveTaskOccurrence(uid, {
        scope,
        occurrence_date: dayOf(task.due_date),
        due_date: dayOf(due_date),
    });

    // Lists only know the series; the split-off task is new to them.
    if (moved) {
        window.dispatchEvent(new CustomEvent('taskCreated', { detail: moved }));
    }

    if (due_time === undefined) return parent;

    const targetUid =
        scope === 'this'
            ? moved?.uid
            : scope === 'following'
              ? (moved?.uid ?? uid)
              : uid;
    if (!targetUid) return parent;

    const timed = await updateTask(targetUid, { due_time });
    return targetUid === uid ? { ...parent, ...timed } : parent;
};

// Saves a calendar-style field update. A due-date change on a recurring task
// goes through moveTaskDue; any other fields go to the task itself.
export const saveTaskFieldsWithDue = async (
    task: Task,
    update: Record<string, unknown>
): Promise<Task> => {
    const { due_date, due_time, ...rest } = update as {
        due_date?: string | null;
        due_time?: string | null;
    };
    if (due_date === undefined || !isRecurringTask(task)) {
        return updateTask(task.uid as string, update as Partial<Task>);
    }
    const moved = await moveTaskDue(task, { due_date, due_time });
    // A single moved occurrence cannot carry the series' other fields.
    if (task.is_virtual_occurrence || Object.keys(rest).length === 0) {
        return moved;
    }
    const rested = await updateTask(task.uid as string, rest as Partial<Task>);
    return { ...moved, ...rested };
};
