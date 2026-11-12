import { format } from 'date-fns';

import { CalendarEvent, taskIdOf } from './taskEvents';

// The task fields a calendar block needs to find its task.
export interface ClickableTask {
    id: number | string;
    uid?: string;
    due_date?: string | null;
    is_virtual_occurrence?: boolean;
    occurrence_index?: number;
}

// A plain task (not a later occurrence) drawn by `eventId`.
export const findPlainTask = <T extends ClickableTask>(
    eventId: string,
    tasks: T[]
) => {
    const taskId = taskIdOf(eventId);
    return tasks.find(
        (t) => t.id.toString() === taskId && !t.is_virtual_occurrence
    );
};

// A later occurrence of a recurring task: its event id ends in its index.
export const findOccurrence = <T extends ClickableTask>(
    eventId: string,
    tasks: T[]
) => {
    const index = eventId.match(/-occ-(\d+)$/)?.[1];
    if (index === undefined) return undefined;
    const taskId = taskIdOf(eventId);
    return tasks.find(
        (t) =>
            t.id.toString() === taskId &&
            !!t.is_virtual_occurrence &&
            (t.occurrence_index ?? 0) === Number(index)
    );
};

export type TaskClickAction =
    // Opens the task in the floating sheet (`?task=uid`), on the day drawn.
    | { kind: 'sheet'; uid: string; date: string }
    // Opens the occurrence dialog of a later occurrence, on its own day.
    | { kind: 'occurrence'; uid: string; date: string | undefined }
    // The sheet already shows this task: a second click closes it.
    | { kind: 'close'; uid: string };

// What a click on a task block does. Null when the block draws no task
// that can be opened.
export const taskClickAction = <T extends ClickableTask>(
    event: CalendarEvent,
    tasks: T[],
    openTaskUid: string | null
): TaskClickAction | null => {
    if (event.type !== 'task') return null;
    const occurrence = findOccurrence(event.id, tasks);
    const task = occurrence ?? findPlainTask(event.id, tasks);
    if (!task?.uid) return null;
    const uid = task.uid;
    if (occurrence) {
        return {
            kind: 'occurrence',
            uid,
            date: task.due_date?.slice(0, 10),
        };
    }
    if (openTaskUid === uid) return { kind: 'close', uid };
    return { kind: 'sheet', uid, date: format(event.start, 'yyyy-MM-dd') };
};
