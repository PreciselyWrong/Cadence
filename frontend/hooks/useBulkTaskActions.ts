import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/Shared/ToastContext';
import { PriorityType, Task } from '../entities/Task';
import { TASK_STATUS } from '../constants/taskStatus';
import { deleteTask, fetchTaskByUid, updateTask } from '../utils/tasksService';
import {
    isRecurringScopeCancelled,
    isRecurringTask,
    moveTaskDue,
    saveTaskEdit,
} from '../utils/recurringScope';
import { scheduleTaskDelete, taskRowElements } from '../utils/taskDeleteUndo';
import { announce, announceDeleted } from './useTaskActions';

type Change = (task: Task) => Promise<Task>;
// Puts a task back as it was (`before`), from how it is now (`current`).
type Back = (before: Task, current: Task) => Promise<Task>;

// One action on every selected task, with one toast and one undo for all.
export const useBulkTaskActions = () => {
    const { t } = useTranslation();
    const { showErrorToast, showUndoToast } = useToast();

    const apply = useCallback(
        async (uids: string[], change: Change, back: Back, done: string) => {
            const befores = (
                await Promise.all(
                    uids.map((uid) => fetchTaskByUid(uid).catch(() => null))
                )
            ).filter((task): task is Task => !!task?.uid);
            const changed: Task[] = [];
            let failed = 0;
            // One by one: a recurring task may ask which occurrences go.
            for (const before of befores) {
                try {
                    announce(await change(before));
                    changed.push(before);
                } catch (error) {
                    if (isRecurringScopeCancelled(error)) continue;
                    console.error('Bulk task action failed:', error);
                    failed += 1;
                }
            }
            if (failed > 0) {
                showErrorToast(
                    t('tasks.selection.someFailed', 'Not changed: {{count}}', {
                        count: failed,
                    })
                );
            }
            if (changed.length === 0) return;
            showUndoToast(done, () => {
                void Promise.all(
                    changed.map(async (before) => {
                        const current = await fetchTaskByUid(
                            before.uid as string
                        );
                        announce(await back(before, current));
                    })
                ).catch(() =>
                    showErrorToast(
                        t(
                            'commandCenter.actionError',
                            'Could not update the task'
                        )
                    )
                );
            });
        },
        [showErrorToast, showUndoToast, t]
    );

    const complete = (uids: string[]) =>
        apply(
            uids,
            (task) =>
                updateTask(task.uid as string, { status: TASK_STATUS.DONE }),
            (before, current) =>
                updateTask(current.uid as string, { status: before.status }),
            t('tasks.selection.completed', 'Completed: {{count}}', {
                count: uids.length,
            })
        );

    const setDue = (uids: string[], date: string | null) =>
        apply(
            uids,
            (task) => moveTaskDue(task, { due_date: date, due_time: null }),
            (before, current) =>
                moveTaskDue(current, {
                    due_date: before.due_date?.slice(0, 10) ?? null,
                    due_time: before.due_time ?? null,
                }),
            t('tasks.selection.dated', 'Date changed: {{count}}', {
                count: uids.length,
            })
        );

    const setPriority = (uids: string[], priority: PriorityType) =>
        apply(
            uids,
            (task) => saveTaskEdit(task, { priority }),
            (before, current) =>
                saveTaskEdit(current, { priority: before.priority ?? null }),
            t('tasks.selection.prioritized', 'Priority changed: {{count}}', {
                count: uids.length,
            })
        );

    const moveTo = (uids: string[], projectId: number | null) =>
        apply(
            uids,
            (task) => saveTaskEdit(task, { project_id: projectId }),
            (before, current) =>
                saveTaskEdit(current, {
                    project_id: before.project_id ?? null,
                }),
            t('tasks.selection.moved', 'Moved: {{count}}', {
                count: uids.length,
            })
        );

    // The rows hide at once and the deletes wait for the undo window. A
    // recurring series is never deleted by a selection: it is kept and said.
    const remove = async (uids: string[]) => {
        const tasks = (
            await Promise.all(
                uids.map((uid) => fetchTaskByUid(uid).catch(() => null))
            )
        ).filter((task): task is Task => !!task?.uid);
        const kept = tasks.filter(
            (task) => task.due_date && isRecurringTask(task)
        );
        const gone = tasks.filter((task) => !kept.includes(task));
        if (kept.length > 0) {
            showErrorToast(
                t(
                    'tasks.selection.recurringKept',
                    'Recurring tasks kept, delete them one by one: {{count}}',
                    { count: kept.length }
                )
            );
        }
        if (gone.length === 0) return;
        const rows = gone.flatMap((task) =>
            taskRowElements(task.uid as string)
        );
        const display = rows.map((row) => row.style.display);
        const scheduled = scheduleTaskDelete({
            hide: () =>
                rows.forEach((row) => {
                    row.style.display = 'none';
                }),
            restore: () =>
                rows.forEach((row, i) => {
                    row.style.display = display[i];
                }),
            commit: async () => {
                await Promise.all(
                    gone.map(async (task) => {
                        await deleteTask(task.uid as string);
                        announceDeleted(task.uid as string);
                    })
                );
            },
            onCommitError: () =>
                showErrorToast(
                    t('commandCenter.deleteError', 'Could not delete the task')
                ),
        });
        showUndoToast(
            t('tasks.selection.deleted', 'Deleted: {{count}}', {
                count: gone.length,
            }),
            scheduled.undo
        );
    };

    return { complete, setDue, setPriority, moveTo, remove };
};
