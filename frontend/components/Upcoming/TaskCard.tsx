import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FlagIcon } from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import { isTaskDone } from '../../constants/taskStatus';
import TaskCheckCircle from '../Task/TaskCheckCircle';
import { formatDuration, formatMinute } from '../DailyPlan/planUtils';
import { DayLine, lineAt } from '../Today/dayModel';
import { subtasksWithoutCard } from './groupCards';
import TaskSourceBadge from '../Shared/TaskSourceBadge';

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
    const { t } = useTranslation();
    const { task, uid } = line;
    const subtasks = subtasksWithoutCard(task.subtasks ?? [], ownCardKeys);
    const parentName = task.parent_task?.name;
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
            className={`cursor-default rounded-lg border bg-surface p-3 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary/60 ${
                selected
                    ? 'border-primary ring-2 ring-primary'
                    : 'border-outline-variant/50 hover:border-outline-variant'
            } ${isDragging ? 'opacity-60 shadow-lg' : ''}`}
        >
            <div className="flex items-start gap-2.5">
                <span className="mt-px">
                    <TaskCheckCircle
                        task={task}
                        checked={line.done}
                        size="card"
                        delayed={false}
                        testId="upcoming-check"
                        onToggle={() => onToggle(line)}
                    />
                </span>
                <span
                    className={`min-w-0 flex-1 break-words text-body-m font-medium leading-5 ${
                        line.done
                            ? 'text-surface-on-variant line-through'
                            : 'text-surface-on'
                    }`}
                >
                    {task.name}
                </span>
                <TaskSourceBadge task={task} className="self-center" />
            </div>

            {parentName && (
                <p className="ml-[26px] mt-0.5 truncate text-xs text-surface-on-variant">
                    {t('upcoming.subtaskOf', '↳ {{parent}}', {
                        parent: parentName,
                    })}
                </p>
            )}

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
                                <TaskCheckCircle
                                    task={sub}
                                    checked={subDone}
                                    size="subtask"
                                    delayed={false}
                                    testId="upcoming-check"
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
