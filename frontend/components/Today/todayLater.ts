import { isTaskDone } from '../../constants/taskStatus';
import { Task } from '../../entities/Task';
import type { DayResponse } from '../../utils/dayService';

export interface TodayLater {
    tomorrow: Task[];
    suggested: Task[];
}

/**
 * Computes the collapsed "Tomorrow" and "Suggestions" folds under Today's
 * list, ensuring each task appears at most once: never if already in `shown`,
 * and Tomorrow takes precedence over Suggestions.
 */
export const computeTodayLater = (
    tomorrowDay: DayResponse | null,
    suggestions: Task[],
    shown: Set<string>
): TodayLater => {
    const taken = new Set(shown);
    const take = (tasks: Task[]): Task[] =>
        tasks.filter((task) => {
            if (!task.uid || taken.has(task.uid)) return false;
            taken.add(task.uid);
            return true;
        });

    const tomorrowPlanned = (tomorrowDay?.plan?.items ?? [])
        .filter(
            (item) => !item.occurrence_done && !isTaskDone(item.task?.status)
        )
        .map((item) => item.task);
    const tomorrowDue = (tomorrowDay?.due ?? []).filter(
        (task) => !isTaskDone(task.status)
    );

    return {
        tomorrow: take([...tomorrowPlanned, ...tomorrowDue]),
        suggested: take(suggestions),
    };
};
