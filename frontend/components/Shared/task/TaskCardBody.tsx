import React from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../../entities/Task';
import { isTaskDone } from '../../../constants/taskStatus';
import TaskCheckCircle from '../../Task/TaskCheckCircle';
import TaskSourceBadge from '../TaskSourceBadge';
import TaskChip from './TaskChip';
import { plainPreview } from './plainText';
import { LinkThumb, SiteLine, useTaskLink } from '../../Links/LinkMarks';

// The one task card frame (Plan days and inbox, project board): a quiet
// border, the selected card ringed in the accent.
export const taskCardClass = (selected: boolean, dragging: boolean): string =>
    `cursor-default rounded-lg border bg-surface p-3 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary/60 ${
        selected
            ? 'border-primary ring-2 ring-primary'
            : 'border-outline-variant/50 hover:border-outline-variant'
    } ${dragging ? 'opacity-60 shadow-lg' : ''}`;

export interface TaskCardBodyProps {
    task: Task;
    done: boolean;
    // Without it the card shows no check (read-only).
    onToggle?(): void;
    // Subtasks listed under the title, each with its own check.
    subtasks?: Task[];
    onToggleSubtask?(subtask: Task): void;
    // Left part of the meta line (time, length, due day).
    meta?: React.ReactNode;
    hideProject?: boolean;
}

/**
 * The content of a task card, Todoist-style: a round check and the title;
 * a subtask names its parent; the note's first line as plain text; then a
 * meta line with the project and the first tag on the right.
 */
const TaskCardBody: React.FC<TaskCardBodyProps> = ({
    task,
    done,
    onToggle,
    subtasks = [],
    onToggleSubtask,
    meta,
    hideProject = false,
}) => {
    const { t } = useTranslation();
    const parentName = task.parent_task?.name;
    const project = hideProject ? undefined : task.Project;
    const tag = task.tags?.[0];
    const { link, preview } = useTaskLink(task);
    // A link's address reads as its site; the rest of the note stays.
    const note = plainPreview(link ? link.noteRest : task.note);
    const indent = onToggle ? 'ml-[26px]' : '';
    const hasMeta = !!meta || !!project?.name || !!tag;

    return (
        <>
            <LinkThumb
                image={preview?.image}
                className="mb-2.5 aspect-[1.91] max-h-28 w-full"
            />
            <div className="flex items-start gap-2.5">
                {onToggle && (
                    <span className="mt-px">
                        <TaskCheckCircle
                            task={task}
                            checked={done}
                            size="card"
                            delayed={false}
                            testId="upcoming-check"
                            onToggle={onToggle}
                        />
                    </span>
                )}
                <span
                    className={`min-w-0 flex-1 break-words text-body-m font-medium leading-5 ${
                        done
                            ? 'text-surface-on-variant line-through'
                            : 'text-surface-on'
                    }`}
                >
                    {task.name}
                </span>
                <TaskSourceBadge task={task} className="self-center" />
            </div>

            {parentName && (
                <p
                    className={`${indent} mt-0.5 truncate text-xs text-surface-on-variant`}
                >
                    {t('upcoming.subtaskOf', '↳ {{parent}}', {
                        parent: parentName,
                    })}
                </p>
            )}

            {link && (
                <SiteLine
                    link={link}
                    preview={preview}
                    className={`${indent} mt-0.5`}
                />
            )}

            {note && (
                <p
                    className={`${indent} mt-0.5 truncate text-xs text-surface-on-variant`}
                    data-testid="task-card-note"
                >
                    {note}
                </p>
            )}

            {subtasks.length > 0 && (
                <ul
                    className={`${indent} mt-1.5 flex flex-col gap-1`}
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
                                    onToggle={() => onToggleSubtask?.(sub)}
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

            {hasMeta && (
                <div
                    className={`${indent} mt-2 flex min-w-0 items-center gap-2`}
                >
                    {meta}
                    <span className="ml-auto flex min-w-0 items-center gap-1.5">
                        {project?.name && (
                            <TaskChip>
                                {project.color && (
                                    <span
                                        aria-hidden="true"
                                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                                        style={{
                                            backgroundColor: project.color,
                                        }}
                                    />
                                )}
                                <span className="truncate">{project.name}</span>
                            </TaskChip>
                        )}
                        {tag && (
                            <TaskChip>
                                <span className="truncate">#{tag.name}</span>
                            </TaskChip>
                        )}
                    </span>
                </div>
            )}
        </>
    );
};

export default TaskCardBody;
