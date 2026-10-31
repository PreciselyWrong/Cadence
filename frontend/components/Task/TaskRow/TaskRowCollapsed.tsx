import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    CalendarIcon,
    CalendarDaysIcon,
    ArrowPathIcon,
    ArrowUpIcon,
    CheckIcon,
    ListBulletIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    ChatBubbleLeftIcon,
    NoSymbolIcon,
    EllipsisVerticalIcon,
    PencilIcon,
    TrashIcon,
    MapPinIcon,
} from '@heroicons/react/24/outline';
import {
    FolderIcon,
    FireIcon,
    MapPinIcon as MapPinSolidIcon,
    Squares2X2Icon,
} from '@heroicons/react/24/solid';
import { Task } from '../../../entities/Task';
import { Project } from '../../../entities/Project';
import TaskTagChips from './TaskTagChips';
import EntityIcon from '../../Shared/EntityIcon';
import TodoMdBadge from '../../Shared/TodoMdBadge';
import { isTodoMdTask } from '../../../utils/todoMd';
import { isTaskCompleted } from '../../../constants/taskStatus';
import { resolveTaskArea } from '../../../utils/taskArea';
import {
    parseDateString,
    getTodayDateString,
    getTomorrowDateString,
    getYesterdayDateString,
} from '../../../utils/dateUtils';
import TaskStatusControl from '../TaskStatusControl';
import TaskCheckCircle from '../TaskCheckCircle';
import { MinimalDueEdit, MinimalPriorityEdit } from './MinimalQuickEdits';
import CopyTaskLinkButton from '../CopyTaskLinkButton';
import QuickCaptureInput, {
    QuickCaptureInputHandle,
} from '../../Inbox/QuickCaptureInput';
import { useStore } from '../../../store/useStore';
import { useIsMinimal } from '../../../hooks/useUiDensity';
import {
    TaskRowFieldKey,
    normalizeTaskRowFields,
} from '../../../constants/taskRowFields';
import { MINIMAL_ROW_ATTRIBUTE } from '../useMinimalRowKeyboard';
import {
    requestDeleteTask,
    requestMoveToProject,
} from '../../../utils/commandEvents';
import PriorityBadge, {
    PriorityLevel,
    toPriorityLevel,
} from '../../Shared/PriorityBadge';
import { openTaskPanel } from '../../../store/taskPanelStore';

interface TaskRowCollapsedProps {
    task: Task;
    project?: Project | null;
    hideProjectName?: boolean;
    hideAreaName?: boolean;
    hideStatusControl?: boolean;
    condenseStatusControl?: boolean;
    // The row sits in a column or group that already states its due date.
    hideDueDate?: boolean;
    compact?: boolean;
    onActivate: (e: React.MouseEvent | React.KeyboardEvent) => void;
    onToggleCompletion?: () => void;
    onTaskUpdate?: (task: Task) => Promise<void>;
    // Saves a field edit (priority, due date) made from the minimal row.
    // Without it the row shows no quick-edit controls.
    onFieldUpdate?: (task: Task) => Promise<void>;
    onMenuOpenChange?: (open: boolean) => void;
    hasSubtasks?: boolean;
    showSubtasks?: boolean;
    onSubtasksToggle?: (e: React.MouseEvent) => void;
    commentCount?: number;
    // When the row is expanded the title becomes an inline editable field.
    editable?: boolean;
    onSaveTitle?: (name: string) => void | Promise<void>;
    onEscape?: () => void;
    onEdit?: () => void;
    onDelete?: (e: React.MouseEvent) => void;
    onTogglePin?: () => void;
    onActionsMenuOpenChange?: (open: boolean) => void;
    // Right click on a minimal row, when it is not expanded.
    onContextMenu?: (e: React.MouseEvent) => void;
}

const tagColorStyle = (color?: string): React.CSSProperties | undefined => {
    if (!color) return undefined;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return { backgroundColor: `rgba(${r}, ${g}, ${b}, 0.2)`, color };
};

// In quiet-sheet lists the card's colored edge is hidden, so priority shows
// as title weight instead: bolder for higher priority, low a shade lighter.
const sheetTitleWeightClass = (
    level: PriorityLevel | null,
    completed: boolean
): string => {
    switch (level) {
        case 'high':
            return '[.task-sheet_&]:font-semibold';
        case 'medium':
            return '[.task-sheet_&]:font-medium';
        case 'low':
            return completed
                ? ''
                : '[.task-sheet_&]:text-gray-500 dark:[.task-sheet_&]:text-gray-400';
        default:
            return '';
    }
};

type Translate = (key: string, fallback: string) => string;

// Relative names for today, tomorrow and yesterday; otherwise a short date.
export const formatDueLabel = (d: string, t: Translate): string => {
    if (d === getTodayDateString()) return t('dateIndicators.today', 'TODAY');
    if (d === getTomorrowDateString())
        return t('dateIndicators.tomorrow', 'TOMORROW');
    if (d === getYesterdayDateString())
        return t('dateIndicators.yesterday', 'YESTERDAY');
    const date = parseDateString(d);
    return date
        ? date.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
          })
        : d;
};

// Colour only flags what still needs doing: overdue red, today blue.
export const dueToneClass = (task: Task): string => {
    const today = getTodayDateString();
    if (!task.due_date || isTaskCompleted(task.status))
        return 'text-gray-600 dark:text-gray-300';
    if (task.due_date < today) return 'text-red-600 dark:text-red-400';
    if (task.due_date === today) return 'text-blue-600 dark:text-blue-400';
    return 'text-gray-600 dark:text-gray-300';
};

const slug = (s: string) =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

const TaskRowCollapsed: React.FC<TaskRowCollapsedProps> = ({
    task,
    project,
    hideProjectName = false,
    hideAreaName = false,
    hideStatusControl = false,
    condenseStatusControl = false,
    hideDueDate = false,
    compact = false,
    onActivate,
    onToggleCompletion,
    onTaskUpdate,
    onFieldUpdate,
    onMenuOpenChange,
    hasSubtasks,
    showSubtasks,
    onSubtasksToggle,
    commentCount = 0,
    editable = false,
    onSaveTitle,
    onEscape,
    onEdit,
    onDelete,
    onTogglePin,
    onActionsMenuOpenChange,
    onContextMenu,
}) => {
    const { t } = useTranslation();
    const isMinimal = useIsMinimal();
    const currentName = task.original_name || task.name;
    const titleInputRef = useRef<QuickCaptureInputHandle>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    const pressingInsideTitleRef = useRef(false);
    const projects = useStore((state: any) => state.projectsStore?.projects);
    const savedRowFields = useStore(
        (state: any) => state.userSettingsStore?.taskRowFields
    );
    const rowFields = useMemo(
        () => normalizeTaskRowFields(savedRowFields),
        [savedRowFields]
    );
    const areas = useStore((state: any) => state.areasStore?.areas);
    const [draftName, setDraftName] = useState(currentName);
    const actionsMenuRef = useRef<HTMLDivElement>(null);
    const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);

    useEffect(() => {
        onActionsMenuOpenChange?.(isActionsMenuOpen);
        if (!isActionsMenuOpen) return;
        const onPointerDown = (e: MouseEvent) => {
            if (
                actionsMenuRef.current &&
                !actionsMenuRef.current.contains(e.target as Node)
            ) {
                setIsActionsMenuOpen(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsActionsMenuOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isActionsMenuOpen, onActionsMenuOpenChange]);

    useEffect(() => {
        setDraftName(currentName);
    }, [currentName, editable]);

    useEffect(() => {
        if (editable) {
            const id = window.setTimeout(
                () => titleInputRef.current?.focus(),
                60
            );
            return () => window.clearTimeout(id);
        }
    }, [editable]);

    const commitTitle = (text: string = draftName) => {
        const trimmed = text.trim();
        if (trimmed && trimmed !== currentName) {
            void onSaveTitle?.(trimmed);
        } else if (!trimmed) {
            setDraftName(currentName);
        }
    };

    const formatDue = (d: string) => formatDueLabel(d, t);
    const dueTime = task.due_has_time && task.due_time ? task.due_time : '';
    // A column that already names the day shows only the time of day.
    const dueText = !task.due_date
        ? null
        : hideDueDate
          ? dueTime || null
          : `${formatDue(task.due_date)}${dueTime ? ` ${dueTime}` : ''}`;

    const formatDefer = (v: string): string | null => {
        const date = new Date(v);
        if (Number.isNaN(date.getTime())) return null;
        const datePart = date.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
        });
        const timePart = date.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
        });
        return `${datePart} • ${timePart}`;
    };

    const formatRecurrence = (type: string) => {
        switch (type) {
            case 'daily':
                return t('recurrence.daily', 'Daily');
            case 'weekly':
                return t('recurrence.weekly', 'Weekly');
            case 'monthly':
            case 'monthly_weekday':
            case 'monthly_last_day':
                return t('recurrence.monthly', 'Monthly');
            default:
                return t('recurrence.recurring', 'Recurring');
        }
    };

    const deferText = task.defer_until ? formatDefer(task.defer_until) : null;
    const showProject = project && project.name && !hideProjectName;
    // Where the project is hidden (its own page, subtasks) its area would
    // only repeat on every row, so the area goes with it.
    const { area } =
        hideAreaName || hideProjectName
            ? { area: null }
            : resolveTaskArea(
                  task,
                  task.project_id ?? project?.id,
                  projects || [],
                  areas || []
              );
    const showArea = !!area?.name;
    const hasMeta =
        !compact &&
        (!!toPriorityLevel(task.priority) ||
            showProject ||
            showArea ||
            (task.tags && task.tags.length > 0) ||
            !!dueText ||
            (isTaskCompleted(task.status) && !!task.completed_at) ||
            (task.recurrence_type && task.recurrence_type !== 'none') ||
            !!task.recurring_parent_id ||
            !!deferText ||
            !!task.parent_task);

    const projectHref = project
        ? project.uid
            ? `/project/${project.uid}-${slug(project.name)}`
            : `/project/${project.id}`
        : '#';

    const stop = (e: React.MouseEvent) => e.stopPropagation();
    const showCheck =
        !hideStatusControl && !task.habit_mode && !!onToggleCompletion;

    // Minimal rows: Enter opens the task, Space toggles completion, D and P
    // open the inline date and priority pickers, X completes, E opens, M asks
    // for a project and Delete removes with undo. Keys pressed on a control
    // inside the row keep that control's meaning.
    const handleMinimalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) return;
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const key = e.key.toLowerCase();
        if (e.key === 'Enter') {
            e.preventDefault();
            onActivate(e);
        } else if (e.key === ' ' || (!editable && key === 'x')) {
            e.preventDefault();
            if (showCheck && onToggleCompletion) onToggleCompletion();
        } else if (!editable && key === 'e') {
            e.preventDefault();
            onActivate(e);
        } else if (!editable && key === 'm' && task.uid) {
            e.preventDefault();
            requestMoveToProject(task.uid);
        } else if (
            !editable &&
            e.key === 'Delete' &&
            task.uid &&
            !task.is_virtual_occurrence
        ) {
            e.preventDefault();
            requestDeleteTask(task.uid, currentName);
        } else if (!editable && (key === 'd' || key === 'p')) {
            const trigger = rowRef.current?.querySelector<HTMLButtonElement>(
                `[data-quick-edit="${key === 'd' ? 'due' : 'priority'}"]`
            );
            if (trigger) {
                e.preventDefault();
                trigger.click();
            }
        }
    };

    const dueClass = dueToneClass(task);
    const isRecurring =
        (!!task.recurrence_type && task.recurrence_type !== 'none') ||
        !!task.recurring_parent_id;

    const commentBadge = !editable && commentCount > 0 && (
        <span
            className={
                isMinimal
                    ? 'flex items-center gap-0.5 text-gray-500 dark:text-gray-400 flex-shrink-0'
                    : 'ml-1 flex items-center gap-0.5 h-5 px-1.5 rounded-full text-gray-500 dark:text-gray-400 flex-shrink-0'
            }
            title={t('comments.count', '{{count}} comments', {
                count: commentCount,
            })}
        >
            <ChatBubbleLeftIcon className="h-3.5 w-3.5" />
            <span className="text-[12px] font-medium">{commentCount}</span>
        </span>
    );

    // Minimal rows show a chevron before the check circle; Dense keeps the
    // list icon after the title.
    const subtasksToggle = !editable && hasSubtasks && onSubtasksToggle && (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onSubtasksToggle(e);
            }}
            aria-pressed={!isMinimal ? !!showSubtasks : undefined}
            aria-expanded={isMinimal ? !!showSubtasks : undefined}
            title={
                showSubtasks
                    ? t('tasks.hideSubtasks', 'Hide subtasks')
                    : t('tasks.showSubtasks', 'Show subtasks')
            }
            className={
                isMinimal
                    ? 'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-gray-500 transition-colors hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300'
                    : `ml-1 flex items-center gap-0.5 h-5 px-1.5 rounded-full border transition-colors flex-shrink-0 ${
                          showSubtasks
                              ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-100'
                              : 'text-gray-500 border-transparent hover:border-gray-200 hover:text-gray-600 dark:hover:border-gray-600'
                      }`
            }
        >
            {isMinimal ? (
                <ChevronRightIcon
                    className={`h-3.5 w-3.5 transition-transform ${
                        showSubtasks ? 'rotate-90' : ''
                    }`}
                    aria-hidden="true"
                />
            ) : (
                <>
                    <ListBulletIcon className="h-3.5 w-3.5" />
                    <ChevronDownIcon
                        className={`h-3 w-3 transition-transform ${
                            showSubtasks ? 'rotate-180' : ''
                        }`}
                    />
                </>
            )}
        </button>
    );

    // The details on a minimal row, by key. Each renders only when it has
    // something to show; the list below orders them and hides unchecked ones.
    const minimalChips: Record<TaskRowFieldKey, React.ReactNode> = {
        recurrence: isRecurring ? (
            <ArrowPathIcon
                className="h-3 w-3 text-gray-500 dark:text-gray-400"
                title={t('recurrence.recurring', 'Recurring')}
                aria-label={t('recurrence.recurring', 'Recurring')}
            />
        ) : null,
        comments: commentBadge,
        tags:
            !compact && task.tags && task.tags.length > 0 ? (
                <span className="flex items-center gap-1.5">
                    {task.tags.slice(0, 2).map((tag) => (
                        <span
                            key={tag.uid || tag.name}
                            className="inline-flex items-center gap-0.5"
                        >
                            <EntityIcon icon={tag.icon} className="h-3 w-3" />
                            {`#${tag.name}`}
                        </span>
                    ))}
                    {task.tags.length > 2 && (
                        <span>
                            {t('tasks.moreTags', '+{{count}}', {
                                count: task.tags.length - 2,
                            })}
                        </span>
                    )}
                </span>
            ) : null,
        project:
            !compact && showProject ? (
                <Link
                    to={projectHref}
                    onClick={stop}
                    className="inline-flex max-w-[10rem] items-center gap-0.5 hover:underline"
                >
                    <EntityIcon icon={project!.icon} className="h-3 w-3" />
                    <span className="truncate">{project!.name}</span>
                </Link>
            ) : null,
        priority:
            !compact && onFieldUpdate && !editable ? (
                <MinimalPriorityEdit
                    task={task}
                    onFieldUpdate={onFieldUpdate}
                />
            ) : null,
        due:
            !compact && onFieldUpdate && !editable ? (
                <MinimalDueEdit
                    task={task}
                    onFieldUpdate={onFieldUpdate}
                    dueClass={dueClass}
                    dueText={dueText}
                />
            ) : !compact && dueText ? (
                <span className={`whitespace-nowrap ${dueClass}`}>
                    {dueText}
                </span>
            ) : null,
    };
    return (
        <div
            ref={rowRef}
            {...(isMinimal ? { [MINIMAL_ROW_ATTRIBUTE]: '' } : {})}
            className={
                isMinimal
                    ? 'group flex items-center gap-3 px-4 py-2 min-h-[40px] cursor-pointer'
                    : `group flex items-center gap-3 px-4 ${
                          hasMeta ? 'py-2' : 'py-3'
                      } cursor-pointer`
            }
            role="button"
            tabIndex={0}
            onContextMenu={
                isMinimal && onContextMenu && !editable
                    ? (e) => {
                          e.preventDefault();
                          onContextMenu(e);
                      }
                    : undefined
            }
            onClick={onActivate}
            onKeyDown={(e) => {
                if (isMinimal) {
                    handleMinimalKeyDown(e);
                    return;
                }
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onActivate(e);
                }
            }}
        >
            {isMinimal && subtasksToggle}
            {showCheck && onToggleCompletion && (
                <div
                    className={hasMeta && !isMinimal ? 'self-start mt-0.5' : ''}
                >
                    <TaskCheckCircle
                        task={task}
                        onToggle={onToggleCompletion}
                    />
                </div>
            )}
            <div
                className={
                    isMinimal
                        ? 'flex flex-1 min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5'
                        : 'flex flex-1 min-w-0 flex-col'
                }
                data-testid={isMinimal ? 'task-row-minimal-line' : undefined}
            >
                <div
                    className={`flex items-center gap-1.5 min-w-0 ${
                        isMinimal ? 'flex-1 basis-40' : ''
                    }`}
                >
                    {task.pinned && (
                        <MapPinSolidIcon
                            className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0"
                            title={t('task.pinned', 'Pinned')}
                            aria-label={t('task.pinned', 'Pinned')}
                            data-testid="task-pinned-icon"
                        />
                    )}
                    {task.habit_mode && (
                        <FireIcon
                            className="h-4 w-4 text-orange-500 flex-shrink-0"
                            title={t('tasks.habit', 'Habit')}
                        />
                    )}
                    {editable && onSaveTitle ? (
                        <div
                            className="flex-1 min-w-0 text-[15px] font-normal tracking-tight"
                            onClick={stop}
                            onMouseDownCapture={() => {
                                pressingInsideTitleRef.current = true;
                                document.addEventListener(
                                    'mouseup',
                                    () => {
                                        pressingInsideTitleRef.current = false;
                                    },
                                    { once: true }
                                );
                            }}
                            onBlur={() => {
                                if (!pressingInsideTitleRef.current)
                                    commitTitle();
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                        >
                            <QuickCaptureInput
                                ref={titleInputRef}
                                mode="edit"
                                bare
                                multiline={false}
                                hidePrimaryButton
                                initialValue={currentName}
                                projects={projects}
                                onTextChange={setDraftName}
                                onSubmitOverride={async (text) => {
                                    commitTitle(text);
                                }}
                                onEscape={() => {
                                    setDraftName(currentName);
                                    onEscape?.();
                                }}
                            />
                        </div>
                    ) : (
                        <span
                            className={`text-[15px] font-normal tracking-tight ${
                                isMinimal
                                    ? 'min-w-0 truncate'
                                    : condenseStatusControl
                                      ? 'line-clamp-3 break-words leading-snug'
                                      : 'max-sm:line-clamp-2 max-sm:break-words sm:truncate'
                            } ${
                                isTaskCompleted(task.status)
                                    ? 'text-gray-500 dark:text-gray-400 line-through'
                                    : 'text-gray-900 dark:text-gray-200'
                            } ${sheetTitleWeightClass(
                                toPriorityLevel(task.priority),
                                isTaskCompleted(task.status)
                            )}`}
                        >
                            {currentName}
                        </span>
                    )}
                    {!editable && task.uid && !task.is_virtual_occurrence && (
                        <CopyTaskLinkButton
                            path={`/${task.habit_mode ? 'habit' : 'task'}/${encodeURIComponent(task.uid)}`}
                            className="hidden [@media(hover:hover)]:block opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            iconClassName="h-3.5 w-3.5"
                        />
                    )}
                    {task.is_blocked && !isTaskCompleted(task.status) && (
                        <span
                            className="ml-1 flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex-shrink-0"
                            title={t(
                                'relations.blockedTooltip',
                                'Blocked by {{count}} open task(s)',
                                { count: task.blocked_by_count || 1 }
                            )}
                            data-testid="task-blocked-badge"
                        >
                            <NoSymbolIcon className="h-3.5 w-3.5" />
                            <span className="text-[12px] font-medium">
                                {t('relations.blocked', 'Blocked')}
                            </span>
                        </span>
                    )}
                    {isTodoMdTask(task) && <TodoMdBadge />}
                    {!isMinimal && commentBadge}
                    {!isMinimal && subtasksToggle}
                    {!isMinimal && !compact && (
                        <div
                            className="ml-auto flex flex-shrink-0 items-center gap-2 pl-2 text-xs text-gray-600 dark:text-gray-300 max-w-[60%]"
                            data-testid="task-row-right"
                        >
                            {task.tags && task.tags.length > 0 && (
                                <TaskTagChips
                                    tags={task.tags}
                                    className="hidden sm:flex"
                                />
                            )}
                            {showProject && (
                                <span className="flex min-w-0 items-center">
                                    <EntityIcon
                                        icon={project!.icon}
                                        className="h-3.5 w-3.5 mr-1"
                                        fallback={
                                            <FolderIcon className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                                        }
                                    />
                                    <Link
                                        to={projectHref}
                                        onClick={stop}
                                        className="hover:underline max-w-[9rem] truncate"
                                    >
                                        {project!.name}
                                    </Link>
                                </span>
                            )}
                            {dueText && (
                                <span
                                    className={`flex items-center whitespace-nowrap ${dueClass}`}
                                    data-testid="task-row-due"
                                >
                                    <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                                    {dueText}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {isMinimal && (
                    <div className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">
                        {rowFields
                            .filter((field) => field.visible)
                            .map((field) => (
                                <React.Fragment key={field.key}>
                                    {minimalChips[field.key]}
                                </React.Fragment>
                            ))}
                    </div>
                )}

                {hasMeta && !isMinimal && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                        <PriorityBadge priority={task.priority} />
                        {task.parent_task && (
                            <span className="flex items-center">
                                <ArrowUpIcon className="h-3 w-3 mr-1 flex-shrink-0" />
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        stop(e);
                                        openTaskPanel(task.parent_task!.uid!);
                                    }}
                                    className="hover:underline max-w-[12rem] truncate"
                                >
                                    {task.parent_task.name}
                                </button>
                            </span>
                        )}
                        {showArea && (
                            <span
                                className="flex items-center"
                                data-testid="task-row-area"
                            >
                                <Squares2X2Icon className="h-3 w-3 mr-1" />
                                {area!.uid ? (
                                    <Link
                                        to={`/area/${area!.uid}-${slug(area!.name)}`}
                                        onClick={stop}
                                        className="hover:underline max-w-[12rem] truncate"
                                    >
                                        {area!.name}
                                    </Link>
                                ) : (
                                    <span className="max-w-[12rem] truncate">
                                        {area!.name}
                                    </span>
                                )}
                            </span>
                        )}
                        {task.tags && task.tags.length > 0 && (
                            <span className="flex flex-wrap items-center gap-1.5 sm:hidden">
                                {task.tags.map((tag) => (
                                    <Link
                                        key={tag.uid || tag.name}
                                        to={`/tag/${tag.uid ? `${tag.uid}-` : ''}${slug(tag.name)}`}
                                        onClick={stop}
                                        className="inline-flex items-center gap-1 px-2 py-px rounded-full text-[12px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 [.task-sheet_&]:!bg-transparent [.task-sheet_&]:!px-0 [.task-sheet_&]:text-[12px] [.task-sheet_&]:font-normal [.task-sheet_&]:!text-gray-600 dark:[.task-sheet_&]:!text-gray-500"
                                        style={tagColorStyle(tag.color)}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="hidden [.task-sheet_&]:inline-block h-1.5 w-1.5 rounded-full bg-gray-400"
                                            style={
                                                tag.color
                                                    ? {
                                                          backgroundColor:
                                                              tag.color,
                                                      }
                                                    : undefined
                                            }
                                        />
                                        {tag.name}
                                    </Link>
                                ))}
                            </span>
                        )}
                        {isTaskCompleted(task.status) && task.completed_at && (
                            <span className="flex items-center whitespace-nowrap">
                                <CheckIcon className="h-3 w-3 mr-1" />
                                {formatDue(task.completed_at.split('T')[0])}
                            </span>
                        )}
                        {task.recurrence_type &&
                            task.recurrence_type !== 'none' && (
                                <span className="flex items-center">
                                    <ArrowPathIcon className="h-3 w-3 mr-1" />
                                    {formatRecurrence(task.recurrence_type)}
                                </span>
                            )}
                        {task.recurring_parent_id && (
                            <span className="flex items-center">
                                <ArrowPathIcon className="h-3 w-3 mr-1" />
                                {t('recurrence.instance', 'Recurring instance')}
                            </span>
                        )}
                        {deferText && (
                            <span className="flex items-center whitespace-nowrap">
                                <CalendarDaysIcon className="h-3 w-3 mr-1" />
                                {deferText}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {!editable && (onEdit || onDelete || onTogglePin) && (
                <div
                    ref={actionsMenuRef}
                    className="relative flex-shrink-0"
                    onClick={stop}
                    onKeyDown={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        onClick={() => setIsActionsMenuOpen((open) => !open)}
                        aria-haspopup="menu"
                        aria-expanded={isActionsMenuOpen}
                        aria-label={t('common.moreActions', 'More actions')}
                        title={t('common.moreActions', 'More actions')}
                        data-testid="task-actions-menu-button"
                        className={`flex items-center justify-center rounded-md p-1 max-sm:-m-2.5 max-sm:min-h-[44px] max-sm:min-w-[44px] text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-opacity focus-visible:opacity-100 ${
                            isActionsMenuOpen
                                ? 'opacity-100'
                                : '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100'
                        }`}
                    >
                        <EllipsisVerticalIcon className="h-4 w-4" />
                    </button>
                    {isActionsMenuOpen && (
                        <div
                            role="menu"
                            className="absolute right-0 top-full mt-1 w-36 py-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg z-50 overflow-hidden"
                        >
                            {onEdit && (
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        setIsActionsMenuOpen(false);
                                        onEdit();
                                    }}
                                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <PencilIcon className="h-4 w-4" />
                                    {t('common.edit', 'Edit')}
                                </button>
                            )}
                            {onTogglePin && (
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        setIsActionsMenuOpen(false);
                                        onTogglePin();
                                    }}
                                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <MapPinIcon className="h-4 w-4" />
                                    {task.pinned
                                        ? t('task.unpin', 'Unpin')
                                        : t('task.pin', 'Pin')}
                                </button>
                            )}
                            {onDelete && (
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={(e) => {
                                        setIsActionsMenuOpen(false);
                                        onDelete(e);
                                    }}
                                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                    <TrashIcon className="h-4 w-4" />
                                    {t('common.delete', 'Delete')}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* The full status menu waits until the row is opened. */}
            {showCheck && editable && (
                <div className="flex-shrink-0" onClick={stop}>
                    <TaskStatusControl
                        task={task}
                        onToggleCompletion={onToggleCompletion}
                        onTaskUpdate={onTaskUpdate}
                        showMobileVariant={false}
                        onMenuOpenChange={onMenuOpenChange}
                        hideLabel={condenseStatusControl}
                    />
                </div>
            )}
        </div>
    );
};

export default TaskRowCollapsed;
