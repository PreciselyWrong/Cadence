import { useEffect, useRef } from 'react';
import { Task } from '../entities/Task';
import {
    TASK_DELETED_EVENT,
    TaskDeletedDetail,
    TASK_UPDATED_EVENT,
} from '../contexts/TaskPaneContext';

// Calls `onUpdated` with each task saved from the right-hand task pane.
// Events without a task uid are ignored. The latest callback is used, so
// callers do not need to memoise it.
export function useTaskUpdatedEvent(onUpdated: (saved: Task) => void): void {
    const handlerRef = useRef(onUpdated);
    handlerRef.current = onUpdated;

    useEffect(() => {
        const listener = (event: Event) => {
            const saved = (event as CustomEvent<Task>).detail;
            if (!saved?.uid) return;
            handlerRef.current(saved);
        };
        window.addEventListener(TASK_UPDATED_EVENT, listener);
        return () => window.removeEventListener(TASK_UPDATED_EVENT, listener);
    }, []);
}

// Calls `onDeleted` with the uid of each task whose delete reached the
// server (after its undo window), so lists keeping their own copy drop it.
export function useTaskDeletedEvent(onDeleted: (uid: string) => void): void {
    const handlerRef = useRef(onDeleted);
    handlerRef.current = onDeleted;

    useEffect(() => {
        const listener = (event: Event) => {
            const uid = (event as CustomEvent<TaskDeletedDetail>).detail?.uid;
            if (uid) handlerRef.current(uid);
        };
        window.addEventListener(TASK_DELETED_EVENT, listener);
        return () => window.removeEventListener(TASK_DELETED_EVENT, listener);
    }, []);
}
