import { useEffect, useRef } from 'react';
import { TASK_UPDATED_EVENT } from '../contexts/TaskPaneContext';
import { Task } from '../entities/Task';

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
