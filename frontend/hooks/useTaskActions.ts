import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/Shared/ToastContext';
import { Task, PriorityType } from '../entities/Task';
import {
    TASK_DELETED_EVENT,
    TaskDeletedDetail,
    TASK_UPDATED_EVENT,
} from '../contexts/TaskPaneContext';
import {
    TASK_PANEL_SAVED_EVENT,
    TaskPanelSavedDetail,
} from '../store/taskPanelStore';
import {
    deleteTask,
    duplicateTask,
    fetchTaskByUid,
    toggleTaskCompletion,
    updateTask,
} from '../utils/tasksService';
import { openTaskPanel } from '../store/taskPanelStore';
import {
    deleteTaskWithScope,
    isRecurringScopeCancelled,
    isRecurringTask,
    moveTaskDue,
    saveTaskEdit,
} from '../utils/recurringScope';
import { DateShortcut, shortcutDate } from '../utils/dateShortcuts';
import { scheduleTaskDelete, taskRowElements } from '../utils/taskDeleteUndo';

const toIsoDay = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
    ).padStart(2, '0')}`;

export const announceDeleted = (uid: string) =>
    window.dispatchEvent(
        new CustomEvent<TaskDeletedDetail>(TASK_DELETED_EVENT, {
            detail: { uid },
        })
    );

// Lets rows and panes that show the task pick up the change.
export const announce = (task: Task) => {
    window.dispatchEvent(
        new CustomEvent<TaskPanelSavedDetail>(TASK_PANEL_SAVED_EVENT, {
            detail: { task },
        })
    );
    window.dispatchEvent(
        new CustomEvent<Task>(TASK_UPDATED_EVENT, { detail: task })
    );
};

// Task changes made from the keyboard, on a task known only by its uid: the
// command palette and the row keys both go through here.
export const useTaskActions = () => {
    const { t } = useTranslation();
    const { showErrorToast, showSuccessToast, showUndoToast } = useToast();

    const run = useCallback(
        async (change: () => Promise<Task>, done?: string) => {
            try {
                const saved = await change();
                announce(saved);
                if (done) showSuccessToast(done);
                return saved;
            } catch (error) {
                if (isRecurringScopeCancelled(error)) return null;
                console.error('Task action failed:', error);
                showErrorToast(
                    t('commandCenter.actionError', 'Could not update the task')
                );
                return null;
            }
        },
        [showErrorToast, showSuccessToast, t]
    );

    const toggle = useCallback(
        (uid: string) => run(() => toggleTaskCompletion(uid)),
        [run]
    );

    // A recurring task asks which occurrences the change reaches.
    const setPriority = useCallback(
        (uid: string, priority: PriorityType) =>
            run(
                async () =>
                    saveTaskEdit(await fetchTaskByUid(uid), { priority }),
                t('success.taskUpdated', 'Task updated!')
            ),
        [run, t]
    );

    const setDueShortcut = useCallback(
        (uid: string, when: DateShortcut | 'none') =>
            run(
                async () => {
                    const task = await fetchTaskByUid(uid);
                    const due_date =
                        when === 'none'
                            ? null
                            : toIsoDay(shortcutDate(when, new Date()));
                    return moveTaskDue(task, { due_date });
                },
                t('success.taskUpdated', 'Task updated!')
            ),
        [run, t]
    );

    const moveToProject = useCallback(
        (uid: string, projectId: number | null) =>
            run(
                async () =>
                    saveTaskEdit(await fetchTaskByUid(uid), {
                        project_id: projectId,
                    }),
                t('success.taskUpdated', 'Task updated!')
            ),
        [run, t]
    );

    // A recurring task asks which occurrences go instead of offering undo.
    const removeRecurring = useCallback(
        async (task: Task) => {
            try {
                const kept = await deleteTaskWithScope(task, () =>
                    deleteTask(task.uid as string)
                );
                if (kept) announce(kept);
                else {
                    taskRowElements(task.uid as string).forEach((row) => {
                        row.style.display = 'none';
                    });
                    announceDeleted(task.uid as string);
                }
            } catch (error) {
                if (isRecurringScopeCancelled(error)) return;
                showErrorToast(
                    t('commandCenter.deleteError', 'Could not delete the task')
                );
            }
        },
        [showErrorToast, t]
    );

    const removeWithUndo = useCallback(
        async (uid: string, name: string) => {
            const task = await fetchTaskByUid(uid).catch(() => null);
            if (task?.due_date && isRecurringTask(task)) {
                await removeRecurring(task);
                return;
            }
            const rows = taskRowElements(uid);
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
                    await deleteTask(uid);
                    announceDeleted(uid);
                },
                onCommitError: () =>
                    showErrorToast(
                        t(
                            'commandCenter.deleteError',
                            'Could not delete the task'
                        )
                    ),
            });
            showUndoToast(
                t('commandCenter.taskDeleted', 'Deleted "{{name}}"', { name }),
                scheduled.undo
            );
        },
        [removeRecurring, showErrorToast, showUndoToast, t]
    );

    // A date or project change offers to put back the value it replaced. A
    // recurring task answers its scope prompt instead, so it gets none.
    const changeWithUndo = useCallback(
        async (
            uid: string,
            change: (task: Task) => Promise<Task>,
            // Gets the task as it was before the change, and as it is now.
            back: (before: Task, current: Task) => Promise<Task>,
            message: string
        ) => {
            let before: Task;
            try {
                before = await fetchTaskByUid(uid);
            } catch (error) {
                console.error('Task action failed:', error);
                showErrorToast(
                    t('commandCenter.actionError', 'Could not update the task')
                );
                return null;
            }
            const saved = await run(() => change(before));
            if (!saved || isRecurringTask(before)) return saved;
            showUndoToast(message, () => {
                void run(async () => back(before, await fetchTaskByUid(uid)));
            });
            return saved;
        },
        [run, showErrorToast, showUndoToast, t]
    );

    const setDue = useCallback(
        (uid: string, date: string | null, time: string | null = null) =>
            changeWithUndo(
                uid,
                (task) =>
                    moveTaskDue(task, {
                        due_date: date,
                        due_time: date ? time : null,
                    }),
                (before, current) =>
                    moveTaskDue(current, {
                        due_date: before.due_date?.slice(0, 10) ?? null,
                        due_time: before.due_time ?? null,
                    }),
                t('tasks.contextMenu.dateChanged', 'Date changed')
            ),
        [changeWithUndo, t]
    );

    const moveToProjectUndoable = useCallback(
        (uid: string, projectId: number | null) =>
            changeWithUndo(
                uid,
                (task) => saveTaskEdit(task, { project_id: projectId }),
                (before, current) =>
                    saveTaskEdit(current, {
                        project_id: before.project_id ?? null,
                    }),
                t('tasks.contextMenu.projectChanged', 'Project changed')
            ),
        [changeWithUndo, t]
    );

    const setPinned = useCallback(
        (uid: string, pinned: boolean) =>
            run(() => updateTask(uid, { pinned })),
        [run]
    );

    // The copy opens in the side panel.
    const duplicate = useCallback(
        async (uid: string) => {
            try {
                const copy = await duplicateTask(await fetchTaskByUid(uid));
                showSuccessToast(t('task.duplicated', 'Task duplicated'));
                announce(copy);
                if (copy.uid) openTaskPanel(copy.uid);
                return copy;
            } catch (error) {
                console.error('Failed to duplicate task:', error);
                showErrorToast(
                    t('task.duplicateError', 'Could not duplicate the task.')
                );
                return null;
            }
        },
        [showErrorToast, showSuccessToast, t]
    );

    return {
        toggle,
        setPriority,
        setDueShortcut,
        moveToProject,
        removeWithUndo,
        setDue,
        moveToProjectUndoable,
        setPinned,
        duplicate,
    };
};
