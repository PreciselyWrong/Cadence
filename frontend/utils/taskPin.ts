import { Task } from '../entities/Task';

const pinnedTime = (task: Task): number | null => {
    if (!task.pinned) return null;
    const time = task.pinned_at ? new Date(task.pinned_at).getTime() : 0;
    return Number.isNaN(time) ? 0 : time;
};

// Pinned tasks sort before the rest, the most recently pinned first. Returns 0
// when neither is pinned so the list's own order applies.
export const comparePinnedTasks = (a: Task, b: Task): number => {
    const timeA = pinnedTime(a);
    const timeB = pinnedTime(b);
    if (timeA === null && timeB === null) return 0;
    if (timeA === null) return 1;
    if (timeB === null) return -1;
    return timeB - timeA;
};
