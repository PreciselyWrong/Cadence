import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon } from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import { isTaskCompleted } from '../../constants/taskStatus';
import { PriorityLevel, toPriorityLevel } from '../Shared/PriorityBadge';

// The ring takes the priority hue, so the row needs no separate badge colour.
const RING: Record<PriorityLevel | 'none', string> = {
    high: 'border-red-500 hover:bg-red-50 dark:hover:bg-red-900/30',
    medium: 'border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30',
    low: 'border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30',
    none: 'border-gray-400 hover:bg-gray-100 dark:border-gray-500 dark:hover:bg-gray-800',
};

// Long enough to see the tick land before the row leaves the list.
export const CHECK_DELAY_MS = 250;

interface TaskCheckCircleProps {
    task: Task;
    onToggle: () => void;
}

const TaskCheckCircle: React.FC<TaskCheckCircleProps> = ({
    task,
    onToggle,
}) => {
    const { t } = useTranslation();
    const [checking, setChecking] = useState(false);
    const timer = useRef<number | null>(null);
    const done = isTaskCompleted(task.status);
    const shown = done || checking;

    useEffect(
        () => () => {
            if (timer.current) window.clearTimeout(timer.current);
        },
        []
    );

    useEffect(() => setChecking(false), [task.status]);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (checking) return;
        if (done) {
            onToggle();
            return;
        }
        setChecking(true);
        timer.current = window.setTimeout(onToggle, CHECK_DELAY_MS);
    };

    const ring = shown
        ? 'border-gray-400 bg-gray-400 dark:border-gray-500 dark:bg-gray-500'
        : RING[toPriorityLevel(task.priority) ?? 'none'];

    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={shown}
            aria-label={
                done
                    ? t('tasks.markAsNotDone', 'Mark as not done')
                    : t('tasks.markAsDone', 'Mark as done')
            }
            onClick={handleClick}
            onKeyDown={(e) => e.stopPropagation()}
            className="group/check -m-2 flex-shrink-0 p-2 focus:outline-none"
            data-testid="task-check-circle"
        >
            <span
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 group-focus-visible/check:ring-2 group-focus-visible/check:ring-blue-500 ${ring}`}
            >
                <CheckIcon
                    className={`h-3 w-3 stroke-[3] transition-opacity duration-150 ${
                        shown
                            ? 'text-white opacity-100'
                            : 'text-gray-400 opacity-0 group-hover/check:opacity-100'
                    }`}
                />
            </span>
        </button>
    );
};

export default TaskCheckCircle;
