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
    updateTask,
} from '../utils/tasksService';
import { isRecurringMoveCancelled, moveTaskDue } from '../utils/recurringMove';
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
                if (isRecurringMoveCancelled(error)) return null;
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

    const setPriority = useCallback(
        (uid: string, priority: PriorityType) =>
            run(
                () => updateTask(uid, { priority }),
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
                () => updateTask(uid, { project_id: projectId }),
                t('success.taskUpdated', 'Task updated!')
            ),
        [run, t]
    );

    const removeWithUndo = useCallback(
        (uid: string, name: string) => {
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
        [showErrorToast, showUndoToast, t]
    );

    return {
        toggle,
        setPriority,
        setDueShortcut,
        moveToProject,
        removeWithUndo,
    };
};
