import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { Person } from '../../entities/Person';
import {
    updateTask,
    fetchTaskByUid,
    fetchSubtasks,
    deleteTask,
    toggleTaskCompletion,
} from '../../utils/tasksService';
import {
    fetchPeople,
    fetchAssignablePeopleForProject,
} from '../../utils/peopleService';
import { useStore } from '../../store/useStore';
import { useToast } from '../Shared/ToastContext';
import { isTaskCompleted } from '../../constants/taskStatus';
import { isStartAfterDue } from '../../utils/dueDateTime';
import { isTodoMdTask } from '../../utils/todoMd';
import { datePresets } from '../../utils/datePresets';
import { DateValue } from '../Shared/DatePopover';
import useTaskAutosave from './useTaskAutosave';
import {
    TASK_PANEL_SAVED_EVENT,
    TaskPanelSavedDetail,
} from '../../store/taskPanelStore';

const notifyTaskSaved = (task: Task) =>
    window.dispatchEvent(
        new CustomEvent<TaskPanelSavedDetail>(TASK_PANEL_SAVED_EVENT, {
            detail: { task },
        })
    );

const dayOf = (value?: string | null) =>
    value ? String(value).split('T')[0] : null;

// All the state and saves of the inline task editor, shared by the side panel
// and the task pane. Every field saves by itself as soon as it is committed
// (blur, choice in a popover) and goes back to its saved value when the save
// fails. Subtasks, attachments and comments save as soon as they change.
// `active` is false while a panel stays mounted but closed.
export const useTaskEditor = (
    initialTask: Task,
    onSaved?: (task: Task) => void,
    active = true
) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const projects = useStore(
        (state: any) => state.projectsStore.projects
    ) as any[];
    const { task, state, run, runFields, reset } = useTaskAutosave(
        initialTask,
        onSaved
    );

    const [nameSeed, setNameSeed] = useState(initialTask.name ?? '');
    const draftName = useRef(initialTask.name ?? '');
    const [isEditingNote, setIsEditingNote] = useState(false);
    const [note, setNote] = useState(initialTask.note ?? '');
    const [error, setError] = useState<string | null>(null);
    const [people, setPeople] = useState<Person[]>([]);
    const [subtasks, setSubtasks] = useState<Task[]>([]);
    const [blockedConfirm, setBlockedConfirm] = useState(false);

    // A save never feeds back through initialTask, so a field being typed in
    // is not reset by another field's save: only opening a task resets.
    const initialRef = useRef(initialTask);
    initialRef.current = initialTask;
    useEffect(() => {
        if (!active) return;
        const opened = initialRef.current;
        reset(opened);
        setNameSeed(opened.name ?? '');
        draftName.current = opened.name ?? '';
        setNote(opened.note ?? '');
        setIsEditingNote(false);
        setError(null);
    }, [active, initialTask.uid, reset]);

    useEffect(() => {
        if (!active || !task.uid) return;
        let cancelled = false;
        fetchSubtasks(task.uid)
            .then((list) => !cancelled && setSubtasks(list))
            .catch(() => !cancelled && setSubtasks([]));
        return () => {
            cancelled = true;
        };
    }, [active, task.uid]);

    // Tokens typed in the name move into their fields when it saves, so the
    // name box follows the saved name.
    useEffect(() => {
        setNameSeed(task.name ?? '');
    }, [task.name]);

    const selectedProjectUid =
        projects.find((project: any) => project.id === task.project_id)?.uid ??
        null;
    useEffect(() => {
        if (!active) return;
        const loader = selectedProjectUid
            ? fetchAssignablePeopleForProject(selectedProjectUid)
            : fetchPeople();
        loader.then((list) => setPeople(list || [])).catch(() => setPeople([]));
    }, [active, selectedProjectUid]);
    const assignablePeople =
        task.AssignedTo && !people.some((p) => p.uid === task.AssignedTo!.uid)
            ? [...people, task.AssignedTo]
            : people;

    // Mirrored from a TODO.md file: only the done toggle edits it
    const readOnly = isTodoMdTask(task);

    const commitTitle = async (text = draftName.current) => {
        if (readOnly) return;
        const next = text.trim();
        if (!next) {
            setError(t('task.nameRequired', 'Task name is required'));
            draftName.current = task.name ?? '';
            setNameSeed(`${task.name ?? ''}`);
            return;
        }
        if (next === task.name) return;
        setError(null);
        await run({ name: next }, (s) => s.setTitle(next));
    };

    const saveNote = (next: string) => {
        if (readOnly) return;
        setError(null);
        void run({ note: next }, (s) => s.setNote(next)).then((ok) => {
            if (!ok) setNote(task.note ?? '');
        });
    };

    const commitNote = () => {
        setIsEditingNote(false);
        if (note.trim() !== (task.note ?? '').trim()) saveNote(note.trim());
    };

    const startAfterDueError = t(
        'task.startAfterDueError',
        'Start cannot be after the due date'
    );
    const deferAfterDueError = t(
        'task.deferAfterDueError',
        'Defer until date cannot be after the due date'
    );

    // Due dates are date-only; any time on the due day is fine
    const deferAfterDue = (
        deferIso: string | null | undefined,
        due: string | null
    ) =>
        !!deferIso &&
        !!due &&
        !task.recurring_parent_id &&
        new Date(deferIso) > new Date(`${due}T23:59:59.999`);

    const changeDue = (value: DateValue) => {
        if (
            isStartAfterDue(
                dayOf(task.start_date),
                task.start_time,
                value.date,
                value.time
            )
        ) {
            setError(startAfterDueError);
            return;
        }
        if (deferAfterDue(task.defer_until, value.date)) {
            setError(deferAfterDueError);
            return;
        }
        setError(null);
        void run(
            {
                due_date: (value.date ?? null) as unknown as string,
                due_time: value.date ? value.time : null,
                due_has_time: !!(value.date && value.time),
            },
            (s) => s.setDue(value.date, value.time)
        );
    };

    const changeStart = (value: DateValue) => {
        if (
            isStartAfterDue(
                value.date,
                value.time,
                dayOf(task.due_date),
                task.due_has_time ? task.due_time : null
            )
        ) {
            setError(startAfterDueError);
            return;
        }
        setError(null);
        void run({ start_date: value.date, start_time: value.time }, (s) =>
            s.setStart(value.date, value.time)
        );
    };

    const changeDefer = (iso: string | null) => {
        if (deferAfterDue(iso, dayOf(task.due_date))) {
            setError(deferAfterDueError);
            return;
        }
        setError(null);
        void run({ defer_until: (iso ?? null) as unknown as string }, (s) =>
            s.setDeferUntil(iso)
        );
    };

    // Closing never loses what was typed but not yet committed
    const flush = () => {
        void commitTitle();
        if (isEditingNote) commitNote();
    };
    const flushRef = useRef(flush);
    flushRef.current = flush;
    useEffect(() => () => flushRef.current(), []);

    const done = isTaskCompleted(task.status);
    const toggleCompletion = () => {
        if (!task.uid) return;
        const uid = task.uid;
        void run(
            {},
            async (_setters, commit) => {
                await toggleTaskCompletion(uid, task);
                await commit();
            },
            { allowReadOnly: true }
        ).then((ok) => {
            if (!ok) {
                showErrorToast(
                    t('task.statusUpdateError', 'Failed to update status')
                );
            }
        });
    };

    const handleComplete = () => {
        if (task.is_blocked && !done) {
            setBlockedConfirm(true);
            return;
        }
        toggleCompletion();
    };

    const postponeToTomorrow = () =>
        changeDue({
            date: datePresets(new Date()).tomorrow,
            time: task.due_has_time ? (task.due_time ?? null) : null,
        });

    // Subtask edits save straight away and refresh the parent everywhere
    const refreshParent = async () => {
        if (!task.uid) return;
        try {
            const fresh = await fetchTaskByUid(task.uid);
            useStore.getState().tasksStore.updateTaskInStore(fresh);
            notifyTaskSaved(fresh);
        } catch {
            // The subtask itself is saved; the row refreshes on next load
        }
    };

    const handleSubtaskUpdate = async (updated: Task) => {
        if (!updated.uid || readOnly) return;
        try {
            const saved = await updateTask(updated.uid, updated);
            setSubtasks((prev) =>
                prev.map((s) => (s.id === saved.id ? { ...s, ...saved } : s))
            );
            void refreshParent();
        } catch {
            showErrorToast(
                t('task.statusUpdateError', 'Failed to update status')
            );
        }
    };

    const handleSubtaskDelete = async (subtaskUid: string) => {
        if (readOnly) return;
        try {
            await deleteTask(subtaskUid);
            setSubtasks((prev) => prev.filter((s) => s.uid !== subtaskUid));
            void refreshParent();
        } catch {
            showErrorToast(t('task.deleteError', 'Failed to delete task'));
        }
    };

    const handleQuickAddSubtask = async (name: string) => {
        if (!task.uid || !task.id || readOnly) return;
        const newSubtask = {
            name,
            status: 'not_started',
            today: false,
            parent_task_id: task.id,
            _isNew: true,
            isNew: true,
            completed_at: null,
        } as unknown as Task;
        try {
            await updateTask(task.uid, {
                subtasks: [...subtasks, newSubtask],
            } as Partial<Task>);
            setSubtasks(await fetchSubtasks(task.uid));
            void refreshParent();
        } catch {
            showErrorToast(
                t('errors.failedToSaveTask', 'Failed to save task.')
            );
        }
    };

    return {
        t,
        task,
        readOnly,
        state,
        error,
        setError,
        projects,
        nameSeed,
        draftName,
        isEditingNote,
        setIsEditingNote,
        note,
        setNote,
        assignablePeople,
        subtasks,
        blockedConfirm,
        setBlockedConfirm,
        commitTitle,
        commitNote,
        saveNote,
        changeDue,
        changeStart,
        changeDefer,
        flush,
        reset,
        done,
        toggleCompletion,
        handleComplete,
        postponeToTomorrow,
        handleSubtaskUpdate,
        handleSubtaskDelete,
        handleQuickAddSubtask,
        run,
        runFields,
    };
};

export type TaskEditor = ReturnType<typeof useTaskEditor>;
