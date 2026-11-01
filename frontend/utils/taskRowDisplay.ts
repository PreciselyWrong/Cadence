import { useSyncExternalStore } from 'react';

// Per device, like the Android row setting: a browser keeps its own choice.
const STORAGE_KEY = 'cadence.taskRow.showDescription';
const CHANGE_EVENT = 'cadence:task-row-display';

export const readShowTaskDescription = (): boolean => {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
};

export const writeShowTaskDescription = (value: boolean): void => {
    try {
        window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
        // Blocked storage: the choice lasts until the page reloads.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
};

const subscribe = (listener: () => void): (() => void) => {
    window.addEventListener(CHANGE_EVENT, listener);
    return () => window.removeEventListener(CHANGE_EVENT, listener);
};

export const useShowTaskDescription = (): boolean =>
    useSyncExternalStore(subscribe, readShowTaskDescription, () => false);

// The note as plain text, on at most `lines` non-blank lines.
export const descriptionPreview = (
    note: string | null | undefined,
    lines = 2
): string | null => {
    if (!note) return null;
    const plain = note
        .split('\n')
        .map((line) =>
            line
                .replace(/^[\s#>*+-]+/, '')
                .replace(/[*_`]/g, '')
                .trim()
        )
        .filter(Boolean)
        .slice(0, lines)
        .join('\n');
    return plain || null;
};
