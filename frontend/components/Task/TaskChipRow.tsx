import React, { forwardRef, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowPathIcon,
    BellSnoozeIcon,
    CalendarDaysIcon,
    CheckIcon,
    ClockIcon,
    FlagIcon,
    FolderIcon,
    HashtagIcon,
    MapPinIcon,
    PauseCircleIcon,
    PlayIcon,
    UserIcon,
    XCircleIcon,
    CalendarIcon,
} from '@heroicons/react/24/outline';
import { Task, PriorityType, RecurrenceType } from '../../entities/Task';
import { Person } from '../../entities/Person';
import ChipPopover, { OptionList, PopoverOption } from '../Shared/ChipPopover';
import DatePopover, { DateValue } from '../Shared/DatePopover';
import TagInput from '../Tag/TagInput';
import DurationChips from '../DailyPlan/DurationChips';
import { formatDuration } from '../DailyPlan/planUtils';
import TaskRecurrenceSection from './TaskForm/TaskRecurrenceSection';
import { TASK_STATUS, getStatusValue } from '../../constants/taskStatus';
import { getTodayDateString } from '../../utils/dateUtils';
import { fromDueParts, toDueParts } from '../../utils/dueDateTime';
import { resolveTaskArea } from '../../utils/taskArea';
import { useStore } from '../../store/useStore';

// One place for the chip colours, so they can follow the shared tokens.
const FILLED =
    'bg-indigo-50 text-indigo-800 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-200 dark:hover:bg-indigo-500/25';
const OVERDUE =
    'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25';
const EMPTY =
    'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700/60 dark:text-gray-400 dark:hover:bg-gray-700';

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: React.ReactNode;
    text: string;
    filled: boolean;
    overdue?: boolean;
}

const Chip = forwardRef<HTMLButtonElement, ChipProps>(
    ({ icon, text, filled, overdue, className = '', ...rest }, ref) => (
        <button
            ref={ref}
            type="button"
            {...rest}
            className={`inline-flex h-8 max-w-full items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-default disabled:opacity-60 ${
                overdue ? OVERDUE : filled ? FILLED : EMPTY
            } ${className}`}
        >
            <span className="flex-shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">
                {icon}
            </span>
            <span className="truncate">{text}</span>
        </button>
    )
);
Chip.displayName = 'Chip';

interface RecurrenceDraft {
    recurrence_type: RecurrenceType;
    recurrence_interval: number;
    recurrence_end_date: string | null;
    recurrence_weekday: number | null;
    recurrence_weekdays: number[];
    recurrence_month_day: number | null;
    recurrence_week_of_month: number | null;
    completion_based: boolean;
}

const toRecurrenceDraft = (task: Task): RecurrenceDraft => ({
    recurrence_type: (task.recurrence_type || 'none') as RecurrenceType,
    recurrence_interval: task.recurrence_interval || 1,
    recurrence_end_date: task.recurrence_end_date || null,
    recurrence_weekday: task.recurrence_weekday ?? null,
    recurrence_weekdays: task.recurrence_weekdays || [],
    recurrence_month_day: task.recurrence_month_day ?? null,
    recurrence_week_of_month: task.recurrence_week_of_month ?? null,
    completion_based: !!task.completion_based,
});

// The same payload the task page sends: fields that do not apply to the
// chosen pattern are cleared.
export const recurrencePayload = (r: RecurrenceDraft): Partial<Task> => ({
    recurrence_type: r.recurrence_type,
    recurrence_interval: r.recurrence_interval || 1,
    recurrence_end_date: r.recurrence_end_date || null,
    recurrence_weekday:
        r.recurrence_type === 'weekly' ||
        r.recurrence_type === 'monthly_weekday'
            ? (r.recurrence_weekday ?? null)
            : null,
    recurrence_weekdays:
        r.recurrence_type === 'weekly' ? r.recurrence_weekdays || [] : null,
    recurrence_month_day:
        r.recurrence_type === 'monthly'
            ? (r.recurrence_month_day ?? null)
            : null,
    recurrence_week_of_month:
        r.recurrence_type === 'monthly_weekday'
            ? (r.recurrence_week_of_month ?? null)
            : null,
    completion_based: r.completion_based,
});

export interface TaskChipRowProps {
    task: Task;
    people: Person[];
    onDue: (value: DateValue) => void;
    onStart: (value: DateValue) => void;
    onDefer: (iso: string | null) => void;
    onPriority: (priority: PriorityType) => void;
    onProject: (projectId: number | null) => void;
    onArea: (areaId: number | null) => void;
    onTags: (names: string[]) => void;
    onStatus: (status: number) => void;
    onRecurrence: (payload: Partial<Task>) => void;
    onEstimate: (minutes: number | null) => void;
    onAssignee: (uid: string | null) => void;
    onOpenParent?: (uid: string) => void;
}

const TaskChipRow: React.FC<TaskChipRowProps> = ({
    task,
    people,
    onDue,
    onStart,
    onDefer,
    onPriority,
    onProject,
    onArea,
    onTags,
    onStatus,
    onRecurrence,
    onEstimate,
    onAssignee,
    onOpenParent,
}) => {
    const { t } = useTranslation();
    const projects = useStore((s: any) => s.projectsStore.projects) as any[];
    const areas = useStore((s: any) => s.areasStore.areas) as any[];
    const tagsStore = useStore((s: any) => s.tagsStore);

    const dueDate = task.due_date ? String(task.due_date).split('T')[0] : null;
    const dueTime = task.due_has_time ? (task.due_time ?? null) : null;
    const overdue =
        !!dueDate &&
        dueDate < getTodayDateString() &&
        getStatusValue(task.status as any) !== TASK_STATUS.DONE;

    const startDate = task.start_date
        ? String(task.start_date).split('T')[0]
        : null;
    const deferParts = toDueParts(task.defer_until || '');

    const priorityOptions: PopoverOption<string | null>[] = [
        { value: null, label: t('priority.none', 'None') },
        { value: 'low', label: t('priority.low', 'Low') },
        { value: 'medium', label: t('priority.medium', 'Medium') },
        { value: 'high', label: t('priority.high', 'High') },
    ];
    const priorityValue =
        typeof task.priority === 'string' ? task.priority : null;
    const priorityLabel = priorityOptions.find(
        (o) => o.value === priorityValue
    )?.label;

    const statusValue = getStatusValue(task.status as any);
    const statusOptions: PopoverOption<number>[] = [
        {
            value: TASK_STATUS.NOT_STARTED,
            label: t('task.status.notStarted', 'Not started'),
            icon: <PauseCircleIcon className="h-4 w-4 text-gray-500" />,
        },
        {
            value: TASK_STATUS.PLANNED,
            label: t('task.status.planned', 'Planned'),
            icon: <CalendarIcon className="h-4 w-4 text-purple-500" />,
        },
        {
            value: TASK_STATUS.IN_PROGRESS,
            label: t('task.status.inProgress', 'In progress'),
            icon: <PlayIcon className="h-4 w-4 text-blue-500" />,
        },
        {
            value: TASK_STATUS.WAITING,
            label: t('task.status.waiting', 'Waiting'),
            icon: <ClockIcon className="h-4 w-4 text-yellow-500" />,
        },
        {
            value: TASK_STATUS.DONE,
            label: t('tasks.done', 'Done'),
            icon: <CheckIcon className="h-4 w-4 text-green-500" />,
        },
        {
            value: TASK_STATUS.CANCELLED,
            label: t('task.status.cancelled', 'Cancelled'),
            icon: <XCircleIcon className="h-4 w-4 text-red-500" />,
        },
    ];
    const currentStatus = statusOptions.find((o) => o.value === statusValue);
    const statusLabel = currentStatus?.label ?? '';
    const statusIcon = currentStatus?.icon;

    const project = projects.find((p: any) => p.id === task.project_id);
    const inherited = resolveTaskArea(
        { area_id: task.area_id ?? null },
        task.project_id ?? null,
        projects,
        areas
    ).area;
    const ownArea = areas.find((a: any) => a.id === task.area_id);
    const areaName = (ownArea ?? inherited)?.name ?? null;

    const tagNames = task.tags?.map((tag) => tag.name) ?? [];
    const assignee =
        people.find((p) => p.uid === task.assigned_to) ??
        (task.AssignedTo as Person | undefined) ??
        null;

    const recurrenceLabels: Record<string, string> = {
        daily: t('recurrence.daily', 'Daily'),
        weekly: t('recurrence.weekly', 'Weekly'),
        monthly: t('recurrence.monthly', 'Monthly'),
        monthly_weekday: t('recurrence.monthly', 'Monthly'),
        monthly_last_day: t('recurrence.monthly', 'Monthly'),
    };
    const recurrenceType = task.recurrence_type || 'none';
    const isRecurring = recurrenceType !== 'none';
    const isInstance = !!task.recurring_parent_id;

    const tagsDraft = useRef<string[]>(tagNames);
    const [recurrenceDraft, setRecurrenceDraft] = useState<RecurrenceDraft>(
        () => toRecurrenceDraft(task)
    );

    const commitTags = () => {
        const next = tagsDraft.current;
        if (JSON.stringify(next) === JSON.stringify(tagNames)) return;
        const existing = tagsStore.tags?.map((tag: any) => tag.name) ?? [];
        const created = next.filter((name) => !existing.includes(name));
        if (created.length > 0) tagsStore.addNewTags?.(created);
        onTags(next);
    };

    const commitRecurrence = () => {
        const payload = recurrencePayload(recurrenceDraft);
        const current = recurrencePayload(toRecurrenceDraft(task));
        if (JSON.stringify(payload) !== JSON.stringify(current)) {
            onRecurrence(payload);
        }
    };

    return (
        <div
            role="toolbar"
            aria-label={t('taskPanel.fields', 'Task fields')}
            className="flex flex-wrap gap-2"
            data-testid="task-chip-row"
        >
            <DatePopover
                label={t('taskPanel.due', 'Due')}
                value={{ date: dueDate, time: dueTime }}
                onChange={onDue}
                renderTrigger={({ display, ...props }) => (
                    <Chip
                        {...props}
                        icon={<CalendarDaysIcon />}
                        text={display ?? t('taskPanel.due', 'Due')}
                        filled={!!display}
                        overdue={overdue}
                        data-testid="chip-due"
                        aria-label={`${t('taskPanel.due', 'Due')} : ${
                            display ?? t('datePopover.noDate', 'No date')
                        }`}
                    />
                )}
            />

            <DatePopover
                label={t('forms.startDate', 'Start')}
                value={{
                    date: startDate,
                    time: task.start_time ?? null,
                }}
                onChange={onStart}
                renderTrigger={({ display, ...props }) => (
                    <Chip
                        {...props}
                        icon={<PlayIcon />}
                        text={
                            display
                                ? `${t('forms.startDate', 'Start')} ${display}`
                                : t('forms.startDate', 'Start')
                        }
                        filled={!!display}
                        data-testid="chip-start"
                    />
                )}
            />

            <ChipPopover
                label={t('forms.priority', 'Priority')}
                widthClass="w-48"
                renderTrigger={(props) => (
                    <Chip
                        {...props}
                        icon={<FlagIcon />}
                        text={
                            priorityValue
                                ? (priorityLabel ?? '')
                                : t('forms.priority', 'Priority')
                        }
                        filled={!!priorityValue}
                        data-testid="chip-priority"
                    />
                )}
            >
                {(close) => (
                    <OptionList
                        label={t('forms.priority', 'Priority')}
                        options={priorityOptions}
                        value={priorityValue}
                        onSelect={(value) => {
                            onPriority(value as PriorityType);
                            close();
                        }}
                    />
                )}
            </ChipPopover>

            <ChipPopover
                label={t('taskPanel.project', 'Project')}
                renderTrigger={(props) => (
                    <Chip
                        {...props}
                        icon={<FolderIcon />}
                        text={
                            project?.name ?? t('taskPanel.project', 'Project')
                        }
                        filled={!!project}
                        data-testid="chip-project"
                    />
                )}
            >
                {(close) => (
                    <OptionList
                        label={t('taskPanel.project', 'Project')}
                        options={[
                            {
                                value: null,
                                label: t('taskPane.noProject', 'No project'),
                            },
                            ...projects.map((p: any) => ({
                                value: p.id as number | null,
                                label: p.name as string,
                            })),
                        ]}
                        value={task.project_id ?? null}
                        onSelect={(value) => {
                            onProject(value);
                            close();
                        }}
                    />
                )}
            </ChipPopover>

            <ChipPopover
                label={t('common.area', 'Area')}
                renderTrigger={(props) => (
                    <Chip
                        {...props}
                        icon={<MapPinIcon />}
                        text={areaName ?? t('common.area', 'Area')}
                        filled={!!areaName}
                        data-testid="chip-area"
                    />
                )}
            >
                {(close) => (
                    <OptionList
                        label={t('common.area', 'Area')}
                        options={[
                            {
                                value: null,
                                label: inherited
                                    ? `${t('taskPanel.areaInherited', 'Project area')} (${inherited.name})`
                                    : t('taskPanel.noArea', 'No area'),
                            },
                            ...areas.map((a: any) => ({
                                value: a.id as number | null,
                                label: a.name as string,
                            })),
                        ]}
                        value={task.area_id ?? null}
                        onSelect={(value) => {
                            onArea(value);
                            close();
                        }}
                    />
                )}
            </ChipPopover>

            <ChipPopover
                label={t('forms.tags', 'Tags')}
                widthClass="w-80"
                onClose={commitTags}
                renderTrigger={(props) => (
                    <Chip
                        {...props}
                        onClick={() => {
                            tagsDraft.current = tagNames;
                            props.onClick();
                        }}
                        icon={<HashtagIcon />}
                        text={
                            tagNames.length > 0
                                ? tagNames.map((n) => `#${n}`).join(' ')
                                : t('forms.tags', 'Tags')
                        }
                        filled={tagNames.length > 0}
                        data-testid="chip-tags"
                    />
                )}
            >
                {() => (
                    <TagInput
                        onTagsChange={(names) => {
                            tagsDraft.current = names;
                        }}
                        initialTags={tagNames}
                        availableTags={tagsStore.tags}
                        onFocus={() => {
                            if (!tagsStore.hasLoaded && !tagsStore.isLoading) {
                                tagsStore.loadTags();
                            }
                        }}
                    />
                )}
            </ChipPopover>

            <ChipPopover
                label={t('common.status', 'Status')}
                widthClass="w-52"
                renderTrigger={(props) => (
                    <Chip
                        {...props}
                        icon={statusIcon}
                        text={statusLabel}
                        filled={statusValue !== TASK_STATUS.NOT_STARTED}
                        data-testid="chip-status"
                        data-status={statusValue}
                    />
                )}
            >
                {(close) => (
                    <OptionList
                        label={t('common.status', 'Status')}
                        options={statusOptions}
                        value={statusValue as number}
                        onSelect={(value) => {
                            onStatus(value);
                            close();
                        }}
                    />
                )}
            </ChipPopover>

            {isInstance ? (
                <Chip
                    icon={<ArrowPathIcon />}
                    text={t('task.instanceOfShort', 'Occurrence')}
                    filled
                    title={t(
                        'task.instanceOf',
                        'This is an instance of a recurring task'
                    )}
                    onClick={() =>
                        task.recurring_parent_uid &&
                        onOpenParent?.(task.recurring_parent_uid)
                    }
                    data-testid="chip-recurrence"
                />
            ) : (
                <ChipPopover
                    label={t('forms.task.recurrence', 'Recurrence')}
                    widthClass="w-96"
                    onClose={commitRecurrence}
                    renderTrigger={(props) => (
                        <Chip
                            {...props}
                            onClick={() => {
                                setRecurrenceDraft(toRecurrenceDraft(task));
                                props.onClick();
                            }}
                            icon={<ArrowPathIcon />}
                            text={
                                isRecurring
                                    ? (recurrenceLabels[recurrenceType] ??
                                      t('recurrence.recurring', 'Recurring'))
                                    : t('forms.task.recurrence', 'Recurrence')
                            }
                            filled={isRecurring}
                            data-testid="chip-recurrence"
                        />
                    )}
                >
                    {() => (
                        <div className="max-h-[60vh] overflow-y-auto p-1">
                            <TaskRecurrenceSection
                                recurrenceType={recurrenceDraft.recurrence_type}
                                recurrenceInterval={
                                    recurrenceDraft.recurrence_interval
                                }
                                recurrenceEndDate={
                                    recurrenceDraft.recurrence_end_date ||
                                    undefined
                                }
                                recurrenceWeekday={
                                    recurrenceDraft.recurrence_weekday ??
                                    undefined
                                }
                                recurrenceWeekdays={
                                    recurrenceDraft.recurrence_weekdays
                                }
                                recurrenceMonthDay={
                                    recurrenceDraft.recurrence_month_day ??
                                    undefined
                                }
                                recurrenceWeekOfMonth={
                                    recurrenceDraft.recurrence_week_of_month ??
                                    undefined
                                }
                                completionBased={
                                    recurrenceDraft.completion_based
                                }
                                onChange={(field, value) =>
                                    setRecurrenceDraft((prev) => {
                                        const next = {
                                            ...prev,
                                            [field]: value,
                                        };
                                        if (
                                            field === 'recurrence_type' &&
                                            value === 'monthly' &&
                                            !prev.recurrence_month_day
                                        ) {
                                            next.recurrence_month_day =
                                                new Date().getDate();
                                        }
                                        return next;
                                    })
                                }
                            />
                        </div>
                    )}
                </ChipPopover>
            )}

            <ChipPopover
                label={t('task.estimate', 'Estimate')}
                widthClass="w-auto"
                renderTrigger={(props) => (
                    <Chip
                        {...props}
                        icon={<ClockIcon />}
                        text={
                            task.estimated_minutes
                                ? formatDuration(task.estimated_minutes)
                                : t('task.estimate', 'Estimate')
                        }
                        filled={!!task.estimated_minutes}
                        data-testid="chip-estimate"
                    />
                )}
            >
                {(close) => (
                    <div className="p-1">
                        <DurationChips
                            value={task.estimated_minutes ?? null}
                            size="md"
                            onChange={(minutes) => {
                                onEstimate(
                                    minutes === task.estimated_minutes
                                        ? null
                                        : minutes
                                );
                                close();
                            }}
                        />
                    </div>
                )}
            </ChipPopover>

            <DatePopover
                label={t('task.deferUntil', 'Defer Until')}
                value={{ date: deferParts.date, time: deferParts.time }}
                onChange={({ date, time }) =>
                    onDefer(date ? fromDueParts(date, time) : null)
                }
                renderTrigger={({ display, ...props }) => (
                    <Chip
                        {...props}
                        icon={<BellSnoozeIcon />}
                        text={
                            display
                                ? `${t('task.deferUntil', 'Defer Until')} ${display}`
                                : t('task.deferUntil', 'Defer Until')
                        }
                        filled={!!display}
                        data-testid="chip-defer"
                    />
                )}
            />

            {(people.length > 0 || assignee) && (
                <ChipPopover
                    label={t('tasks.assignedTo', 'Assigned to')}
                    renderTrigger={(props) => (
                        <Chip
                            {...props}
                            icon={<UserIcon />}
                            text={
                                assignee?.name ??
                                t('tasks.assignedTo', 'Assigned to')
                            }
                            filled={!!assignee}
                            data-testid="chip-assignee"
                        />
                    )}
                >
                    {(close) => (
                        <OptionList
                            label={t('tasks.assignedTo', 'Assigned to')}
                            options={[
                                {
                                    value: null as string | null,
                                    label: t('taskPanel.unassigned', 'Nobody'),
                                },
                                ...people.map((p) => ({
                                    value: p.uid as string | null,
                                    label: p.name,
                                })),
                            ]}
                            value={task.assigned_to ?? null}
                            onSelect={(value) => {
                                onAssignee(value);
                                close();
                            }}
                        />
                    )}
                </ChipPopover>
            )}
        </div>
    );
};

export default TaskChipRow;
