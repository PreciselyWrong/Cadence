import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FlagIcon } from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import { formatDuration, formatMinute } from '../DailyPlan/planUtils';
import { DayLine, lineAt } from '../Today/dayModel';
import { subtasksWithoutCard } from './groupCards';
import TaskCardBody, { taskCardClass } from '../Shared/task/TaskCardBody';

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

export interface TaskCardProps {
    line: DayLine;
    date: string;
    // Its detail is open in the side pane.
    selected: boolean;
    // Keys of the tasks that have a card of their own in the column; such a
    // subtask is not listed under its parent.
    ownCardKeys?: ReadonlySet<string>;
    onToggle(line: DayLine): void;
    onOpen(line: DayLine): void;
    onToggleSubtask(subtask: Task): void;
}

/**
 * One task of a day as a card, Todoist-style: a round check and the title on
 * the first line; a subtask also names its parent; below, a meta line (time,
 * duration, then project and tag on the right). The first line of the note is
 * greyed. Nothing appears on hover. Enter opens; only the check toggles, and
 * open cards can be dragged (Space picks one up from the keyboard).
 */
const TaskCard: React.FC<TaskCardProps> = ({
    line,
    date,
    selected,
    ownCardKeys = new Set<string>(),
    onToggle,
    onOpen,
    onToggleSubtask,
}) => {
    const { task, uid } = line;
    const subtasks = subtasksWithoutCard(task.subtasks ?? [], ownCardKeys);
    const at = lineAt(line);
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
        if (event.key === 'Enter') {
            event.preventDefault();
            onOpen(line);
            return;
        }
        dragKeyDown?.(event);
    };

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
            className={taskCardClass(selected, isDragging)}
        >
            <TaskCardBody
                task={task}
                done={line.done}
                onToggle={() => onToggle(line)}
                subtasks={subtasks}
                onToggleSubtask={onToggleSubtask}
                meta={
                    <>
                        {at !== null && (
                            <span
                                className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums ${
                                    line.start !== null
                                        ? 'text-primary'
                                        : 'text-surface-on-variant'
                                }`}
                            >
                                {line.start === null && (
                                    <FlagIcon
                                        aria-hidden="true"
                                        className="h-3 w-3"
                                    />
                                )}
                                {formatMinute(at)}
                            </span>
                        )}
                        {line.durationKnown && (
                            <span className="shrink-0 text-xs tabular-nums text-surface-on-variant">
                                {formatDuration(line.duration)}
                            </span>
                        )}
                    </>
                }
            />
        </div>
    );
};

export default TaskCard;
