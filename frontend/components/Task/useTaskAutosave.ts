import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { fetchTaskByUid, updateTask } from '../../utils/tasksService';
import { isRecurringMoveCancelled } from '../../utils/recurringMove';
import { useStore } from '../../store/useStore';
import { useToast } from '../Shared/ToastContext';
import {
    TASK_PANEL_SAVED_EVENT,
    TaskPanelSavedDetail,
} from '../../store/taskPanelStore';
import { isTodoMdTask } from '../../utils/todoMd';
import useTaskRowSave, { TaskRowSetters } from './TaskRow/useTaskRowSave';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SAVED_VISIBLE_MS = 2000;

export interface TaskAutosave {
    // The saved task with the edits still in flight applied on top
    task: Task;
    state: SaveState;
    // Runs one save. `optimistic` shows at once and is rolled back if the
    // save fails or is cancelled. A task mirrored from a TODO.md file refuses
    // every save but the ones flagged `allowReadOnly` (the done toggle).
    run: (
        optimistic: Partial<Task>,
        op: (
            setters: TaskRowSetters,
            commit: () => Promise<void>
        ) => Promise<void>,
        options?: { allowReadOnly?: boolean }
    ) => Promise<boolean>;
    // Saves plain fields (status, area, estimate) with the same rollback
    runFields: (
        optimistic: Partial<Task>,
        payload: Record<string, unknown>,
        errorKey: string,
        fallback: string
    ) => Promise<boolean>;
    // Replaces the saved task, after a change made outside this hook
    reset: (task: Task) => void;
}

// Every edit in the task panel saves on its own: it shows at once, goes to
// the server in order, and goes back to the saved value when it fails. The
// saved task, not the shown one, is what the setters compare against, so a
// recurring task still asks which occurrences a new due date moves.
export const useTaskAutosave = (
    initial: Task,
    onSaved?: (task: Task) => void
): TaskAutosave => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const [saved, setSaved] = useState(initial);
    const [overrides, setOverrides] = useState<Partial<Task>>({});
    const [state, setState] = useState<SaveState>('idle');
    const queue = useRef<Promise<unknown>>(Promise.resolve());
    const inFlight = useRef(0);
    const idleTimer = useRef<number>();
    const onSavedRef = useRef(onSaved);
    onSavedRef.current = onSaved;

    useEffect(
        () => () => {
            window.clearTimeout(idleTimer.current);
        },
        []
    );

    const commit = useCallback(async () => {
        if (!saved.uid) return;
        const fresh = await fetchTaskByUid(saved.uid);
        setSaved(fresh);
        useStore.getState().tasksStore.updateTaskInStore(fresh);
        window.dispatchEvent(
            new CustomEvent<TaskPanelSavedDetail>(TASK_PANEL_SAVED_EVENT, {
                detail: { task: fresh },
            })
        );
        onSavedRef.current?.(fresh);
    }, [saved.uid]);

    const setters = useTaskRowSave(saved, commit);
    const settersRef = useRef(setters);
    settersRef.current = setters;
    const savedRef = useRef(saved);
    savedRef.current = saved;
    const commitRef = useRef(commit);
    commitRef.current = commit;

    const refuseReadOnly = useCallback(
        () =>
            showErrorToast(
                t(
                    'todoMd.readOnly',
                    'This comes from a TODO.md file. Edit the file instead.'
                )
            ),
        [showErrorToast, t]
    );
    const refuseRef = useRef(refuseReadOnly);
    refuseRef.current = refuseReadOnly;

    const execute = useCallback(
        (
            optimistic: Partial<Task>,
            op: () => Promise<void>,
            allowReadOnly = false
        ): Promise<boolean> => {
            // The file is the source of truth: nothing is sent, nothing shown
            if (!allowReadOnly && isTodoMdTask(savedRef.current)) {
                refuseRef.current();
                return Promise.resolve(false);
            }
            const keys = Object.keys(optimistic) as (keyof Task)[];
            setOverrides((current) => ({ ...current, ...optimistic }));
            inFlight.current += 1;
            window.clearTimeout(idleTimer.current);
            setState('saving');

            const finish = (ok: boolean, cancelled = false) => {
                setOverrides((current) => {
                    const next = { ...current };
                    keys.forEach((key) => delete next[key]);
                    return next;
                });
                inFlight.current -= 1;
                if (inFlight.current > 0) return;
                if (cancelled) {
                    setState('idle');
                } else if (ok) {
                    setState('saved');
                    idleTimer.current = window.setTimeout(
                        () => setState('idle'),
                        SAVED_VISIBLE_MS
                    );
                } else {
                    setState('error');
                }
            };

            const result = queue.current.then(async () => {
                try {
                    await op();
                    finish(true);
                    return true;
                } catch (error) {
                    finish(false, isRecurringMoveCancelled(error));
                    return false;
                }
            });
            queue.current = result;
            return result;
        },
        []
    );

    const run = useCallback<TaskAutosave['run']>(
        (optimistic, op, options) =>
            execute(
                optimistic,
                () => op(settersRef.current, commitRef.current),
                options?.allowReadOnly
            ),
        [execute]
    );

    const runFields = useCallback<TaskAutosave['runFields']>(
        (optimistic, payload, errorKey, fallback) =>
            execute(optimistic, async () => {
                const uid = savedRef.current.uid;
                if (!uid) return;
                try {
                    await updateTask(uid, payload as Partial<Task>);
                    await commitRef.current();
                } catch (error) {
                    showErrorToast(t(errorKey, fallback));
                    throw error;
                }
            }),
        [execute, showErrorToast, t]
    );

    const reset = useCallback((next: Task) => setSaved(next), []);

    return {
        task: { ...saved, ...overrides },
        state,
        run,
        runFields,
        reset,
    };
};

export default useTaskAutosave;
