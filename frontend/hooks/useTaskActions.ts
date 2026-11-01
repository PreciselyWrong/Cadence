import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/Shared/ToastContext';
import { Task, PriorityType } from '../entities/Task';
import { TASK_UPDATED_EVENT } from '../contexts/TaskPaneContext';
import {
    TASK_PANEL_SAVED_EVENT,
    TaskPanelSavedDetail,
} from '../store/taskPanelStore';
import {
    deleteTask,
    fetchTaskByUid,
    toggleTaskCompletion,
} from '../utils/tasksService';
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

// Lets rows and panes that show the task pick up the change.
const announce = (task: Task) => {
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
                else
                    taskRowElements(task.uid as string).forEach((row) => {
                        row.style.display = 'none';
                    });
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
                commit: () => deleteTask(uid),
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

    return {
        toggle,
        setPriority,
        setDueShortcut,
        moveToProject,
        removeWithUndo,
    };
};
