import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { Task } from '../../entities/Task';
import { isTaskDone } from '../../constants/taskStatus';
import { DailyPlanItem } from '../../utils/dailyPlanService';
import { isItemDone } from './planUtils';

interface DayReviewProps {
    // The past day reviewed (YYYY-MM-DD) and its name.
    date: string;
    dayLabel: string;
    items: DailyPlanItem[];
    dayTasks: Task[];
}

// What the past day holds: the plan's done items, plus the day's tasks
// completed on it, each once. Pure so the page and tests share it.
export const reviewDay = (
    date: string,
    items: DailyPlanItem[],
    dayTasks: Task[]
): { done: Task[]; notDone: Task[] } => {
    const done = new Map<string, Task>();
    const notDone: Task[] = [];
    for (const item of items) {
        if (isItemDone(item)) done.set(item.task_uid, item.task);
        else if (item.task) notDone.push(item.task);
    }
    const localDay = (iso: string) => {
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    for (const task of dayTasks) {
        const uid = task.uid as string;
        if (!uid || done.has(uid) || !isTaskDone(task.status)) continue;
        if (!task.completed_at || localDay(task.completed_at) === date) {
            done.set(uid, task);
        }
    }
    return { done: [...done.values()], notDone };
};

// Past days: no planning prompts, a summary of what got done instead.
const DayReview: React.FC<DayReviewProps> = ({
    date,
    dayLabel,
    items,
    dayTasks,
}) => {
    const { t } = useTranslation();
    const { done, notDone } = reviewDay(date, items, dayTasks);
    return (
        <section className="flex flex-col gap-3" data-testid="day-review">
            <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {t('dailyPlan.reviewTitle', 'What you did on {{date}}', {
                    date: dayLabel,
                })}
            </h3>
            {done.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t(
                        'dailyPlan.reviewNothingDone',
                        'Nothing completed that day.'
                    )}
                </p>
            ) : (
                <>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t('dailyPlan.reviewDoneCount', 'Done: {{count}}', {
                            count: done.length,
                        })}
                    </p>
                    <ul className="flex flex-col gap-1">
                        {done.map((task) => (
                            <li
                                key={task.uid}
                                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                            >
                                <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                                <span className="truncate">{task.name}</span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {notDone.length > 0 && (
                <>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {t('dailyPlan.reviewNotDone', 'Planned, not done')}
                    </p>
                    <ul className="flex flex-col gap-1">
                        {notDone.map((task) => (
                            <li
                                key={task.uid}
                                className="truncate text-sm text-gray-500 dark:text-gray-400"
                            >
                                {task.name}
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
};

export default DayReview;
