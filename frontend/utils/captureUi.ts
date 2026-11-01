import { useSyncExternalStore } from 'react';
import { CaptureTarget, CapturedItem } from './captureText';

// "today": opened from Plan my day, so the box only makes tasks and each
// one goes on today's plan.
export type CaptureScope = 'today';

// The project the box was opened from. Matched by uid, since two projects
// can share a name.
export interface CaptureProject {
    uid: string;
    name: string;
}

// The goal the box was opened for (a bucket-list item turned into a task):
// a task saved from that open is linked to it, the goal itself stays.
export interface CaptureGoal {
    id: number;
    uid: string;
    title: string;
}

interface CaptureUiState {
    open: boolean;
    target: CaptureTarget;
    scope: CaptureScope | null;
    // Text the box starts with, e.g. +"Project" when opened from a project
    initialText: string;
    project: CaptureProject | null;
    goal: CaptureGoal | null;
    // Changes on every open, so the composer can start from the same place
    openCount: number;
}

export interface CaptureSavedEvent {
    scope: CaptureScope | null;
    items: CapturedItem[];
    // True when the items were just removed again with Undo
    undone: boolean;
}

let state: CaptureUiState = {
    open: false,
    target: 'inbox',
    scope: null,
    initialText: '',
    project: null,
    goal: null,
    openCount: 0,
};
const listeners = new Set<() => void>();
const savedListeners = new Set<(event: CaptureSavedEvent) => void>();

const setState = (next: CaptureUiState) => {
    state = next;
    listeners.forEach((listener) => listener());
};

export const openCapture = (
    target: CaptureTarget = 'inbox',
    scope: CaptureScope | null = null,
    initialText = '',
    project: CaptureProject | null = null,
    goal: CaptureGoal | null = null
): void => {
    setState({
        open: true,
        target: scope === 'today' ? 'task' : target,
        scope,
        initialText,
        project,
        goal,
        openCount: state.openCount + 1,
    });
};

export const closeCapture = (): void => {
    if (state.open) {
        setState({ ...state, open: false });
    }
};

export const toggleCapture = (target: CaptureTarget = 'inbox'): void => {
    if (state.open) {
        closeCapture();
    } else {
        openCapture(target);
    }
};

export const emitCaptureSaved = (event: CaptureSavedEvent): void => {
    savedListeners.forEach((listener) => listener(event));
};

export const onCaptureSaved = (
    listener: (event: CaptureSavedEvent) => void
): (() => void) => {
    savedListeners.add(listener);
    return () => {
        savedListeners.delete(listener);
    };
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const useCaptureUi = (): CaptureUiState =>
    useSyncExternalStore(
        subscribe,
        () => state,
        () => state
    );
