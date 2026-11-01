import { create } from 'zustand';
import { Task } from '../entities/Task';
import { isTaskDone } from '../constants/taskStatus';
import {
    deleteTaskOccurrence,
    editTaskOccurrence,
    RecurringScope,
    updateTask,
} from './tasksService';
import {
    TASK_PANEL_SAVED_EVENT,
    TaskPanelSavedDetail,
} from '../store/taskPanelStore';

export type { RecurringScope };

export type RecurringScopeKind = 'edit' | 'delete';

export const RECURRING_SCOPE_CANCELLED = 'RECURRING_SCOPE_CANCELLED';

export const isRecurringScopeCancelled = (error: unknown): boolean =>
    error instanceof Error && error.message === RECURRING_SCOPE_CANCELLED;

interface PendingRecurringScope {
    kind: RecurringScopeKind;
    resolve: (scope: RecurringScope | null) => void;
}

export const useRecurringScopeStore = create<{
    pending: PendingRecurringScope | null;
}>(() => ({ pending: null }));

// A newer prompt replaces an unanswered one, which resolves as cancelled.
export const askRecurringScope = (kind: RecurringScopeKind = 'edit') =>
    new Promise<RecurringScope | null>((resolve) => {
        useRecurringScopeStore.getState().pending?.resolve(null);
        useRecurringScopeStore.setState({ pending: { kind, resolve } });
    });

export const answerRecurringScope = (scope: RecurringScope | null) => {
    const { pending } = useRecurringScopeStore.getState();
    if (!pending) return;
    useRecurringScopeStore.setState({ pending: null });
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

// Fields that belong to the series as a whole, or to the day plan and the
// lists rather than to one occurrence: they never ask.
const SERIES_FIELDS = new Set([
    'recurrence_type',
    'recurrence_interval',
    'recurrence_end_date',
    'recurrence_weekday',
    'recurrence_weekdays',
    'recurrence_month_day',
    'recurrence_week_of_month',
    'completion_based',
    'update_parent_recurrence',
    'today',
    'pinned',
    'order',
    'section_uid',
    'subtasks',
]);

// Completing or reopening keeps its own rules: the series moves on to its
// next occurrence.
const isCompletionChange = (task: Task, changes: Record<string, unknown>) =>
    'status' in changes &&
    (isTaskDone(changes.status as Task['status']) || isTaskDone(task.status));

// True when saving these changes must ask which occurrences they reach.
export const needsRecurringScope = (
    task: Task,
    changes: Record<string, unknown>
): boolean =>
    !!task.uid &&
    !!task.due_date &&
    isRecurringTask(task) &&
    !isCompletionChange(task, changes) &&
    Object.keys(changes).some((key) => !SERIES_FIELDS.has(key));

// Lists only know the series: a split-off task is new to them, and the
// series itself may have moved on.
const announce = (series: Task, edited: Task) => {
    if (edited.uid === series.uid) return;
    window.dispatchEvent(new CustomEvent('taskCreated', { detail: edited }));
    window.dispatchEvent(
        new CustomEvent<TaskPanelSavedDetail>(TASK_PANEL_SAVED_EVENT, {
            detail: { task: series },
        })
    );
};

// Saves an edit. A recurring task first asks, once for the whole save,
// whether it reaches only this occurrence, this and the following ones, or
// the whole series; a virtual occurrence names its own day. Resolves with
// the task that now holds the edited occurrence (a new task for "this" and,
// unless it is the first occurrence, "following"). Throws
// RECURRING_SCOPE_CANCELLED when the prompt is dismissed, so callers revert
// without an error toast.
export const saveTaskEdit = async (
    task: Task,
    changes: Record<string, unknown>
): Promise<Task> => {
    if (!task.uid) throw new Error('Task has no uid');
    if (!needsRecurringScope(task, changes)) {
        return updateTask(task.uid, changes as Partial<Task>);
    }

    const scope = await askRecurringScope('edit');
    if (!scope) throw new Error(RECURRING_SCOPE_CANCELLED);

    const { task: series, edited } = await editTaskOccurrence(task.uid, {
        scope,
        occurrence_date: dayOf(task.due_date as string),
        changes,
    });
    announce(series, edited);
    return edited;
};

// Saves a due date. Leaving the day and time as they are, or clearing the
// date, never asks.
export const moveTaskDue = (
    task: Task,
    change: { due_date: string | null; due_time?: string | null }
): Promise<Task> => {
    if (!task.uid) throw new Error('Task has no uid');
    const { due_date, due_time } = change;
    const unchanged =
        !!due_date &&
        !!task.due_date &&
        dayOf(due_date) === dayOf(task.due_date) &&
        (due_time === undefined ||
            (due_time || null) ===
                (task.due_has_time ? (task.due_time ?? null) : null));
    if (!due_date || !task.due_date || unchanged) {
        return updateTask(task.uid, { due_date, due_time });
    }
    return saveTaskEdit(
        task,
        due_time === undefined ? { due_date } : { due_date, due_time }
    );
};

// Deletes a task. A recurring one asks first: "this" skips the occurrence,
// "following" ends the series before it, "all" deletes the series through
// deleteAll. Resolves with the series when it is kept, null when deleted.
export const deleteTaskWithScope = async (
    task: Task,
    deleteAll: () => Promise<void>
): Promise<Task | null> => {
    if (!task.uid || !task.due_date || !isRecurringTask(task)) {
        await deleteAll();
        return null;
    }

    const scope = await askRecurringScope('delete');
    if (!scope) throw new Error(RECURRING_SCOPE_CANCELLED);
    if (scope === 'all') {
        await deleteAll();
        return null;
    }

    const { task: series, deleted } = await deleteTaskOccurrence(task.uid, {
        scope,
        occurrence_date: dayOf(task.due_date),
    });
    if (deleted || !series) return null;
    window.dispatchEvent(
        new CustomEvent<TaskPanelSavedDetail>(TASK_PANEL_SAVED_EVENT, {
            detail: { task: series },
        })
    );
    return series;
};
