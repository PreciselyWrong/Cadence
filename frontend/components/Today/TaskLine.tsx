import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EllipsisHorizontalIcon, FlagIcon } from '@heroicons/react/24/outline';
import TaskCheckCircle from '../Task/TaskCheckCircle';
import { Task } from '../../entities/Task';
import { isTaskDone } from '../../constants/taskStatus';
import Menu, { MenuEntry, MenuItem } from '../Shared/ui/Menu';
import { IconButton } from '../Shared/ui/Button';
import { formatDuration, formatMinute } from '../DailyPlan/planUtils';
import { DayLine, lineAt } from './dayModel';

export const findEntry = (
    entries: MenuEntry[],
    key: string
): MenuItem | undefined =>
    entries.find(
        (entry): entry is MenuItem =>
            typeof entry === 'object' && 'key' in entry && entry.key === key
    );

const shortDate = (date: string, language: string): string => {
    const [y, m, d] = date.slice(0, 10).split('-').map(Number);
    return new Intl.DateTimeFormat(language, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    }).format(new Date(y, m - 1, d));
};

const MAX_TAGS = 2;

// "9" and "30" of 09:30: the hour carries the row, the minutes sit above
// the line, small (as in Sorted³'s day list).
const BigTime: React.FC<{ minute: number; strong: boolean }> = ({
    minute,
    strong,
}) => {
    const hours = Math.floor(minute / 60);
    const minutes = String(minute % 60).padStart(2, '0');
    return (
        <span
            className={`inline-flex items-start tabular-nums leading-none ${
                strong ? 'text-primary' : 'text-surface-on-variant'
            }`}
            aria-label={formatMinute(minute)}
        >
            <span className="text-title font-semibold leading-none">
                {hours}
            </span>
            <span className="ml-px text-xs font-semibold leading-none">
                {minutes}
            </span>
        </span>
    );
};

const Chip: React.FC<{
    children: React.ReactNode;
    tone?: 'neutral' | 'warning';
    title?: string;
}> = ({ children, tone = 'neutral', title }) => (
    <span
        title={title}
        className={`inline-flex h-5 max-w-[12rem] items-center gap-1 truncate rounded-md px-1.5 text-xs tabular-nums ${
            tone === 'warning'
                ? 'bg-warning-container/70 text-warning'
                : 'bg-surface-high text-surface-on-variant'
        }`}
    >
        {children}
    </span>
);

export interface TaskLineProps {
    line: DayLine;
    dateOfDay: string;
    current?: boolean;
    // Its detail is open in the side pane.
    selected?: boolean;
    onToggle(line: DayLine): void;
    onOpen(line: DayLine): void;
    menu: MenuEntry[];
    sortable?: boolean;
    // Show the description and the subtasks under the row.
    expanded?: boolean;
    onToggleSubtask?(subtask: Task): void;
}

/**
 * One task of the day: the time in the margin, the title, then one row of
 * chips (project, tags, length and end time, deadline). The whole row is the
 * drag handle when `sortable`; keys act on the row itself.
 */
const TaskLine: React.FC<TaskLineProps> = ({
    line,
    dateOfDay,
    current = false,
    selected = false,
    onToggle,
    onOpen,
    menu,
    sortable = true,
    expanded = false,
    onToggleSubtask,
}) => {
    const { t, i18n } = useTranslation();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuTrigger = useRef<HTMLButtonElement | null>(null);
    const { task, uid } = line;
    const note = task.note?.trim();
    const subtasks = task.subtasks ?? [];
    const at = lineAt(line);
    const project = task.Project;
    const tags = (task.tags ?? []).slice(0, MAX_TAGS);
    const dueDay = task.due_date?.slice(0, 10);
    const foreignDue = !!dueDay && dueDay !== dateOfDay;
    const lateDue = foreignDue && (dueDay as string) < dateOfDay;
    const timedDue = line.start !== null && line.dueMinute !== null;
    const dueOnly = line.start === null && line.dueMinute !== null;

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: `line:${uid}`,
        data: { kind: 'line', uid, duration: line.duration },
        disabled: !sortable,
    });
    const { onKeyDown: dragKeyDown, ...dragListeners } = listeners ?? {};

    const runKey = (key: string) => findEntry(menu, key)?.onSelect?.();

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        switch (event.key) {
            case ' ':
                event.preventDefault();
                onToggle(line);
                return;
            case 'Enter':
                event.preventDefault();
                onOpen(line);
                return;
            case 'd':
            case 'D':
                event.preventDefault();
                runKey('tomorrow');
                return;
            case 't':
            case 'T':
                event.preventDefault();
                runKey('plan');
                return;
            case 'Delete':
            case 'Backspace':
                event.preventDefault();
                if (findEntry(menu, 'unslot')) runKey('unslot');
                else runKey('remove');
                return;
        }
        dragKeyDown?.(event);
    };

    const lengthChip =
        line.start !== null ? (
            <Chip>
                {formatDuration(line.duration)} →{' '}
                {formatMinute(line.start + line.duration)}
            </Chip>
        ) : line.durationKnown ? (
            <Chip>{formatDuration(line.duration)}</Chip>
        ) : null;
    const chips = [
        project?.name ? (
            <Chip key="project">
                {project.color && (
                    <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: project.color }}
                    />
                )}
                <span className="truncate">{project.name}</span>
            </Chip>
        ) : null,
        ...tags.map((tag) => (
            <Chip key={`tag-${tag.name}`}>
                <span className="truncate">#{tag.name}</span>
            </Chip>
        )),
        lengthChip ? (
            <React.Fragment key="len">{lengthChip}</React.Fragment>
        ) : null,
        timedDue ? (
            <Chip key="due" title={t('today.dueAt', 'Due')}>
                <FlagIcon aria-hidden="true" className="h-3 w-3" />
                {formatMinute(line.dueMinute as number)}
            </Chip>
        ) : null,
        foreignDue ? (
            <Chip
                key="dueDay"
                tone={lateDue ? 'warning' : 'neutral'}
                title={t('today.dueAt', 'Due')}
            >
                <FlagIcon aria-hidden="true" className="h-3 w-3" />
                {shortDate(dueDay as string, i18n?.language ?? 'en')}
            </Chip>
        ) : null,
        !expanded && subtasks.length > 0 ? (
            <Chip key="subs">
                {subtasks.filter((sub) => isTaskDone(sub.status)).length}/
                {subtasks.length}
            </Chip>
        ) : null,
    ].filter(Boolean);

    return (
        <div
            ref={setNodeRef}
            data-task-row
            data-testid="task-line"
            className={`relative grid cursor-default grid-cols-[52px_auto_minmax(0,1fr)] items-start gap-x-3 rounded-xl px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/60 max-sm:py-2.5 ${
                selected
                    ? 'bg-surface-highest'
                    : current
                      ? 'bg-primary-container/50'
                      : 'hover:bg-surface-high/60'
            } ${isDragging ? 'opacity-60 shadow-lg' : ''}`}
            style={{
                transform: CSS.Transform.toString(transform),
                transition: isDragging ? undefined : transition,
            }}
            {...attributes}
            {...dragListeners}
            role="listitem"
            tabIndex={0}
            aria-selected={selected}
            onKeyDown={onKeyDown}
            // A click shows the detail in the side pane, as in TickTick.
            onClick={() => onOpen(line)}
            onContextMenu={(event) => {
                event.preventDefault();
                menuTrigger.current?.click();
            }}
        >
            <span className="flex flex-col items-end pt-0.5">
                {at !== null && <BigTime minute={at} strong={current} />}
                {dueOnly && (
                    <FlagIcon
                        aria-label={t('today.dueAt', 'Due')}
                        className="mt-1 h-3 w-3 text-surface-on-variant"
                    />
                )}
            </span>

            <span
                className="pt-0.5"
                onClick={(event) => event.stopPropagation()}
            >
                <TaskCheckCircle task={task} onToggle={() => onToggle(line)} />
            </span>

            <span className="min-w-0 pr-8">
                <span
                    className={`block max-w-full truncate text-body font-medium leading-6 ${
                        line.done
                            ? 'text-surface-on-variant line-through'
                            : 'text-surface-on'
                    }`}
                >
                    {task.name}
                </span>
                {chips.length > 0 && (
                    <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                        {chips}
                    </span>
                )}
                {expanded && note && (
                    <span className="mt-1.5 line-clamp-3 whitespace-pre-line text-body-m text-surface-on-variant">
                        {note}
                    </span>
                )}
            </span>

            {/* Subtasks hang from the task's check by a thread line, so
                they read as part of it (Things 3, Superlist). */}
            {expanded && subtasks.length > 0 && (
                <ul
                    className="relative col-span-2 col-start-2 mt-1.5"
                    onClick={(event) => event.stopPropagation()}
                >
                    <span
                        aria-hidden="true"
                        className="absolute bottom-3 left-[9px] top-0 w-px bg-outline-variant"
                    />
                    {subtasks.map((sub) => {
                        const subDone = isTaskDone(sub.status);
                        return (
                            <li
                                key={sub.uid ?? sub.id}
                                className="relative flex min-h-[28px] items-center gap-2 pl-6"
                            >
                                <span
                                    aria-hidden="true"
                                    className="absolute left-[9px] top-1/2 h-px w-3 bg-outline-variant"
                                />
                                <span className="shrink-0 scale-[0.8]">
                                    <TaskCheckCircle
                                        task={sub}
                                        onToggle={() => onToggleSubtask?.(sub)}
                                    />
                                </span>
                                <span
                                    className={`min-w-0 truncate text-body-m ${
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

            {/* Nothing appears on hover: the menu shows on the selected row,
                and a right click opens it on any row. */}
            <span
                className={`absolute right-2 top-2 ${
                    selected || menuOpen ? '' : 'invisible'
                }`}
                onClick={(event) => event.stopPropagation()}
            >
                <Menu
                    entries={menu}
                    align="end"
                    onOpenChange={setMenuOpen}
                    trigger={(triggerProps) => (
                        <IconButton
                            {...triggerProps}
                            ref={(node) => {
                                menuTrigger.current = node;
                                const forward = triggerProps.ref;
                                if (typeof forward === 'function')
                                    forward(node);
                                else if (forward)
                                    (
                                        forward as React.MutableRefObject<HTMLButtonElement | null>
                                    ).current = node;
                            }}
                            label={t('today.moreActions', 'More actions')}
                        >
                            <EllipsisHorizontalIcon />
                        </IconButton>
                    )}
                />
            </span>
        </div>
    );
};

export default TaskLine;
