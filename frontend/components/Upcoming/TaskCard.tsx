import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FlagIcon } from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import { isTaskDone } from '../../constants/taskStatus';
import { toPriorityLevel } from '../Shared/PriorityBadge';
import { formatDuration, formatMinute } from '../DailyPlan/planUtils';
import { DayLine, lineAt } from '../Today/dayModel';

export const cardId = (date: string, uid: string): string =>
    `card:${date}:${uid}`;

// What a drop needs to know about the card, read back in the board's onDragEnd.
export interface CardData {
    kind: 'card';
    uid: string;
    date: string;
    planned: boolean;
    timed: boolean;
    duration: number;
}

// Todoist-like priority ring: red, orange, blue; grey when unset.
const RING: Record<'high' | 'medium' | 'low' | 'none', string> = {
    high: 'border-danger',
    medium: 'border-orange-500',
    low: 'border-blue-500',
    none: 'border-outline',
};

interface RoundCheckProps {
    checked: boolean;
    priority: Task['priority'];
    label: string;
    size: 'card' | 'subtask';
    onToggle(): void;
}

// Round checkbox: priority colours the ring, a filled disc with a tick when done.
const RoundCheck: React.FC<RoundCheckProps> = ({
    checked,
    priority,
    label,
    size,
    onToggle,
}) => {
    const ring = checked
        ? 'border-primary bg-primary text-primary-on'
        : `${RING[toPriorityLevel(priority) ?? 'none']} hover:bg-primary/10`;
    const dimension =
        size === 'card' ? 'h-[18px] w-[18px]' : 'h-[14px] w-[14px]';
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={label}
            onClick={(event) => {
                event.stopPropagation();
                onToggle();
            }}
            className="-m-1.5 flex shrink-0 items-center justify-center rounded-full p-1.5 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary"
            data-testid="upcoming-check"
        >
            <span
                className={`flex items-center justify-center rounded-full border-2 transition-colors duration-150 ${dimension} ${ring}`}
            >
                {checked && (
                    <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className="h-[70%] w-[70%] fill-none stroke-current stroke-[3.5] [stroke-linecap:round] [stroke-linejoin:round]"
                    >
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                )}
            </span>
        </button>
    );
};

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="inline-flex h-5 max-w-[10rem] items-center gap-1 truncate rounded-md bg-surface-high px-1.5 text-xs tabular-nums text-surface-on-variant">
        {children}
    </span>
);

export interface TaskCardProps {
    line: DayLine;
    date: string;
    // Its detail is open in the side pane.
    selected: boolean;
    onToggle(line: DayLine): void;
    onOpen(line: DayLine): void;
    onToggleSubtask(subtask: Task): void;
}

/**
 * One task of a day as a card, Todoist-style: a round check and the title on
 * the first line; below, a meta line (time, duration, then project and tag on
 * the right). The first line of the note is greyed. Nothing appears on hover.
 * Space toggles, Enter opens; open cards can be dragged.
 */
const TaskCard: React.FC<TaskCardProps> = ({
    line,
    date,
    selected,
    onToggle,
    onOpen,
    onToggleSubtask,
}) => {
    const { t } = useTranslation();
    const { task, uid } = line;
    const subtasks = task.subtasks ?? [];
    const at = lineAt(line);
    const project = task.Project;
    const tag = task.tags?.[0];
    const note = task.note?.split('\n')[0].trim();
    const data: CardData = {
        kind: 'card',
        uid,
        date,
        planned: line.planned,
        timed: at !== null,
        duration: line.duration,
    };
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: cardId(date, uid),
        data,
        disabled: line.done,
    });
    const { onKeyDown: dragKeyDown, ...dragListeners } = listeners ?? {};

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === ' ') {
            event.preventDefault();
            onToggle(line);
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            onOpen(line);
            return;
        }
        dragKeyDown?.(event);
    };

    const checkLabel = line.done
        ? t('tasks.markAsNotDone', 'Mark as not done')
        : t('tasks.markAsDone', 'Mark as done');

    return (
        <div
            ref={setNodeRef}
            role="listitem"
            tabIndex={0}
            data-testid="upcoming-card"
            data-task-row=""
            data-uid={uid}
            aria-selected={selected}
            aria-label={task.name}
            style={{
                transform: CSS.Transform.toString(transform),
                transition: isDragging ? undefined : transition,
            }}
            {...attributes}
            {...dragListeners}
            onKeyDown={onKeyDown}
            onClick={() => onOpen(line)}
            className={`cursor-default rounded-lg border bg-surface p-3 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary/60 ${
                selected
                    ? 'border-primary ring-2 ring-primary'
                    : 'border-outline-variant/50 hover:border-outline-variant'
            } ${isDragging ? 'opacity-60 shadow-lg' : ''}`}
        >
            <div className="flex items-start gap-2.5">
                <RoundCheck
                    checked={line.done}
                    priority={task.priority}
                    label={checkLabel}
                    size="card"
                    onToggle={() => onToggle(line)}
                />
                <span
                    className={`min-w-0 flex-1 break-words text-body-m font-medium leading-5 ${
                        line.done
                            ? 'text-surface-on-variant line-through'
                            : 'text-surface-on'
                    }`}
                >
                    {task.name}
                </span>
            </div>

            {note && (
                <p className="ml-[26px] mt-0.5 truncate text-xs text-surface-on-variant">
                    {note}
                </p>
            )}

            {subtasks.length > 0 && (
                <ul
                    className="ml-[26px] mt-1.5 flex flex-col gap-1"
                    onClick={(event) => event.stopPropagation()}
                >
                    {subtasks.map((sub) => {
                        const subDone = isTaskDone(sub.status);
                        return (
                            <li
                                key={sub.uid ?? sub.id}
                                className="flex min-w-0 items-center gap-2"
                            >
                                <RoundCheck
                                    checked={subDone}
                                    priority={sub.priority}
                                    label={
                                        subDone
                                            ? t(
                                                  'tasks.markAsNotDone',
                                                  'Mark as not done'
                                              )
                                            : t(
                                                  'tasks.markAsDone',
                                                  'Mark as done'
                                              )
                                    }
                                    size="subtask"
                                    onToggle={() => onToggleSubtask(sub)}
                                />
                                <span
                                    className={`min-w-0 truncate text-xs ${
                                        subDone
                                            ? 'text-surface-on-variant line-through'
                                            : 'text-surface-on'
                                    }`}
                                >
                                    {sub.name}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className="ml-[26px] mt-2 flex min-w-0 items-center gap-2">
                {at !== null && (
                    <span
                        className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums ${
                            line.start !== null
                                ? 'text-primary'
                                : 'text-surface-on-variant'
                        }`}
                    >
                        {line.start === null && (
                            <FlagIcon aria-hidden="true" className="h-3 w-3" />
                        )}
                        {formatMinute(at)}
                    </span>
                )}
                {line.durationKnown && (
                    <span className="shrink-0 text-xs tabular-nums text-surface-on-variant">
                        {formatDuration(line.duration)}
                    </span>
                )}
                <span className="ml-auto flex min-w-0 items-center gap-1.5">
                    {project?.name && (
                        <Chip>
                            {project.color && (
                                <span
                                    aria-hidden="true"
                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: project.color }}
                                />
                            )}
                            <span className="truncate">{project.name}</span>
                        </Chip>
                    )}
                    {tag && (
                        <Chip>
                            <span className="truncate">#{tag.name}</span>
                        </Chip>
                    )}
                </span>
            </div>
        </div>
    );
};

export default TaskCard;
