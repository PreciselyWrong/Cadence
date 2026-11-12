import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { isTaskCompleted } from '../../constants/taskStatus';
import { checkStrokeClass } from '../Shared/task/checkStroke';

// The one task checkbox (rows, cards, calendar blocks): a round 2px outline,
// primary fill when done, red stroke for high priority only (CHECK_STROKE).
const SIZE = {
    row: { box: 'h-[22px] w-[22px]', tick: 'h-4 w-4', hit: '-m-3 p-3' },
    card: { box: 'h-[18px] w-[18px]', tick: 'h-3 w-3', hit: '-m-1.5 p-1.5' },
    subtask: {
        box: 'h-[14px] w-[14px]',
        tick: 'h-2.5 w-2.5',
        hit: '-m-1.5 p-1.5',
    },
} as const;

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
    testId?: string;
    size?: keyof typeof SIZE;
    // Overrides the done state read from the task (a day's occurrence).
    checked?: boolean;
    // False toggles at once, without the tick-then-leave motion: for cards
    // that stay in place once done.
    delayed?: boolean;
}

const TaskCheckCircle: React.FC<TaskCheckCircleProps> = ({
    task,
    onToggle,
    testId,
    size = 'row',
    checked,
    delayed = true,
}) => {
    const { t } = useTranslation();
    const [checking, setChecking] = useState(false);
    const timers = useRef<number[]>([]);
    const rowRef = useRef<HTMLElement | null>(null);
    const done = checked ?? isTaskCompleted(task.status);
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
    }, [task.status, checked]);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (checking) return;
        if (done || !delayed) {
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
        : `${checkStrokeClass(task.priority)} hover:bg-primary/10`;
    const dims = SIZE[size];

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
            className={`group/check ${dims.hit} flex-shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary`}
            data-testid={testId ?? 'task-check-circle'}
        >
            <span
                className={`flex ${dims.box} items-center justify-center rounded-full border-2 transition-colors duration-[220ms] ${box} ${
                    checking && !done ? 'animate-check-pop' : ''
                }`}
            >
                <svg
                    viewBox="0 0 24 24"
                    className={`${dims.tick} fill-none stroke-primary-on stroke-[3.2] [stroke-linecap:round] [stroke-linejoin:round] ${
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
