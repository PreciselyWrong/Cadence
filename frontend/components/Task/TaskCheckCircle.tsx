import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { isTaskCompleted } from '../../constants/taskStatus';
import { PriorityLevel, toPriorityLevel } from '../Shared/PriorityBadge';

// Same look as the Android TaskCheckbox: rounded square, 2px outline stroke,
// primary fill when done, error stroke for high priority.
const STROKE: Record<PriorityLevel | 'none', string> = {
    high: 'border-danger',
    medium: 'border-outline',
    low: 'border-outline',
    none: 'border-outline',
};

// Tick animation (CSS, 180ms), then the row fades and collapses, then the
// task is toggled so the undo toast lands after the motion.
export const CHECK_DELAY_MS = 600;
const ROW_LEAVE_AT_MS = 420;
const ROW_LEAVE_MS = 180;
const REDUCED_DELAY_MS = 250;

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function collapseRow(row: HTMLElement) {
    const height = row.offsetHeight;
    row.style.height = `${height}px`;
    row.style.overflow = 'hidden';
    row.style.transition = `height ${ROW_LEAVE_MS}ms ease-out, opacity ${ROW_LEAVE_MS}ms ease-out`;
    requestAnimationFrame(() => {
        row.style.height = '0px';
        row.style.opacity = '0';
    });
}

function resetRow(row: HTMLElement | null) {
    if (!row) return;
    row.style.height = '';
    row.style.overflow = '';
    row.style.transition = '';
    row.style.opacity = '';
}

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
    const timers = useRef<number[]>([]);
    const rowRef = useRef<HTMLElement | null>(null);
    const done = isTaskCompleted(task.status);
    const shown = done || checking;

    const clearTimers = () => {
        timers.current.forEach((id) => window.clearTimeout(id));
        timers.current = [];
    };

    useEffect(
        () => () => {
            clearTimers();
        },
        []
    );

    useEffect(() => {
        setChecking(false);
        resetRow(rowRef.current);
    }, [task.status]);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (checking) return;
        if (done) {
            onToggle();
            return;
        }
        setChecking(true);
        if (prefersReducedMotion()) {
            timers.current.push(window.setTimeout(onToggle, REDUCED_DELAY_MS));
            return;
        }
        const row = e.currentTarget.closest<HTMLElement>('[data-task-row]');
        rowRef.current = row;
        if (row) {
            timers.current.push(
                window.setTimeout(() => collapseRow(row), ROW_LEAVE_AT_MS)
            );
        }
        timers.current.push(window.setTimeout(onToggle, CHECK_DELAY_MS));
    };

    const box = shown
        ? 'border-primary bg-primary'
        : `${STROKE[toPriorityLevel(task.priority) ?? 'none']} hover:bg-primary/10`;

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
            className="group/check -m-3 flex-shrink-0 p-3 rounded-control focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary"
            data-testid="task-check-circle"
        >
            <span
                className={`flex h-[22px] w-[22px] items-center justify-center rounded-checkbox border-2 transition-colors duration-[220ms] ${box} ${
                    checking && !done ? 'animate-check-pop' : ''
                }`}
            >
                <svg
                    viewBox="0 0 24 24"
                    className={`h-4 w-4 fill-none stroke-primary-on stroke-[3.2] [stroke-linecap:round] [stroke-linejoin:round] ${
                        shown ? 'opacity-100' : 'opacity-0'
                    } ${checking && !done ? 'animate-check-draw' : ''}`}
                    style={{ strokeDasharray: 24 }}
                    aria-hidden="true"
                >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
            </span>
        </button>
    );
};

export default TaskCheckCircle;
