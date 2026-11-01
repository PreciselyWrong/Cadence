// A delete that waits a few seconds so the user can take it back. The caller
// hides the item at once; the real delete runs when the window closes, or
// earlier when the page is left, as a keepalive request so it still goes out.

export const UNDO_WINDOW_MS = 5000;

export interface DeferredDeleteOptions {
    keepalive: boolean;
}

interface PendingDelete {
    commit: (options: DeferredDeleteOptions) => Promise<unknown> | unknown;
    onError?: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingDelete>();

const commitNow = (
    entry: PendingDelete,
    options: DeferredDeleteOptions
): void => {
    let result: Promise<unknown> | unknown;
    try {
        result = entry.commit(options);
    } catch (error) {
        result = Promise.reject(error);
    }
    Promise.resolve(result).catch((error: unknown) => {
        if (entry.onError) entry.onError(error);
        else console.error('Deferred delete failed:', error);
    });
};

const commitPending = (key: string, options: DeferredDeleteOptions): void => {
    const entry = pending.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(key);
    commitNow(entry, options);
};

/**
 * Schedules `commit` for `key` after the undo window. Returns `undo`, which
 * cancels the delete and returns true, or returns false once it has run.
 */
export function deferDelete(
    key: string,
    commit: PendingDelete['commit'],
    onError?: (error: unknown) => void
): () => boolean {
    const entry: PendingDelete = {
        commit,
        onError,
        timer: setTimeout(
            () => commitPending(key, { keepalive: false }),
            UNDO_WINDOW_MS
        ),
    };
    pending.set(key, entry);
    return () => {
        if (pending.get(key) !== entry) return false;
        clearTimeout(entry.timer);
        pending.delete(key);
        return true;
    };
}

// Runs every waiting delete now, for tests and for leaving the page.
export function flushDeferredDeletes(): void {
    for (const key of [...pending.keys()]) {
        commitPending(key, { keepalive: true });
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushDeferredDeletes);
}
