import { Task } from '../entities/Task';

// Sorts tasks by a saved manual order, the way the server does: tasks that
// are not in the order come first, newest first, then the rest by position.
export const sortByTaskOrder = (tasks: Task[], order: string[]): Task[] => {
    const rank = new Map(order.map((uid, index) => [uid, index]));
    const createdAt = (task: Task) =>
        new Date(task.created_at ?? 0).getTime() || 0;
    return [...tasks].sort((a, b) => {
        const rankA = rank.get(a.uid ?? '');
        const rankB = rank.get(b.uid ?? '');
        if (rankA === undefined && rankB === undefined) {
            return createdAt(b) - createdAt(a);
        }
        if (rankA === undefined) return -1;
        if (rankB === undefined) return 1;
        return rankA - rankB;
    });
};
