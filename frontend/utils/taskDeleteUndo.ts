// Delete with undo: the row is hidden at once and the server delete only
// runs once the undo window has passed, so Undo restores the very same task.

export const UNDO_WINDOW_MS = 6000;

export interface ScheduledDelete {
    undo: () => void;
}

interface ScheduleOptions {
    hide: () => void;
    restore: () => void;
    commit: () => Promise<void>;
    onCommitError: (error: unknown) => void;
    delayMs?: number;
}

export const scheduleTaskDelete = ({
    hide,
    restore,
    commit,
    onCommitError,
    delayMs = UNDO_WINDOW_MS,
}: ScheduleOptions): ScheduledDelete => {
    hide();
    let cancelled = false;
    const timer = setTimeout(() => {
        if (cancelled) return;
        commit().catch((error) => {
            restore();
            onCommitError(error);
        });
    }, delayMs);
    return {
        undo: () => {
            if (cancelled) return;
            cancelled = true;
            clearTimeout(timer);
            restore();
        },
    };
};

// Every row showing the task, across list and pane copies
export const taskRowElements = (uid: string): HTMLElement[] =>
    Array.from(
        document.querySelectorAll<HTMLElement>(
            `[data-task-uid="${CSS.escape(uid)}"]`
        )
    );
