import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { isTaskCompleted } from '../../constants/taskStatus';

export const ARRANGE_DRAG_PREFIX = 'arrange-';

export type ArrangeTab = 'nodate' | 'overdue';

export interface ArrangeTask {
    id: number | string;
    uid?: string;
    name?: string;
    original_name?: string;
    status?: any;
    priority?: any;
    due_date?: string | null;
    parent_task_id?: number | null;
    is_virtual_occurrence?: boolean;
    habit_mode?: boolean;
    Project?: { id?: number; name?: string } | null;
    project?: { id?: number; name?: string } | null;
    project_id?: number | null;
    tags?: { name: string }[];
}

export interface ArrangeFilter {
    project: string;
    tag: string;
    priority: string;
}

// Task lists send the project as `Project`.
const projectOf = (task: ArrangeTask) => task.Project ?? task.project;

const PRIORITY_NAMES = ['low', 'medium', 'high'];
const priorityName = (priority: any) =>
    typeof priority === 'number' ? PRIORITY_NAMES[priority] : priority || '';

// The open tasks the panel offers for each tab: no due date, or a due day
// before `today` (YYYY-MM-DD). Done and cancelled tasks, habits and
// recurring previews are left out.
export const arrangeTasks = (
    tasks: ArrangeTask[],
    tab: ArrangeTab,
    today: string,
    filter: ArrangeFilter = { project: '', tag: '', priority: '' }
): ArrangeTask[] =>
    tasks.filter((task) => {
        if (task.is_virtual_occurrence || task.habit_mode) return false;
        if (task.parent_task_id) return false;
        if (
            isTaskCompleted(task.status) ||
            task.status === 'cancelled' ||
            task.status === 5
        ) {
            return false;
        }
        const day = task.due_date ? task.due_date.slice(0, 10) : null;
        if (tab === 'nodate' ? day !== null : !day || day >= today)
            return false;
        if (
            filter.project &&
            (projectOf(task)?.name || '') !== filter.project
        ) {
            return false;
        }
        if (
            filter.tag &&
            !(task.tags || []).some((t) => t.name === filter.tag)
        ) {
            return false;
        }
        if (
            filter.priority &&
            priorityName(task.priority) !== filter.priority
        ) {
            return false;
        }
        return true;
    });

interface ArrangePanelProps {
    tasks: ArrangeTask[];
    onClose: () => void;
}

// Side drawer with the tasks that still need a slot. Drag one onto the
// calendar to give it that day (and hour, in the week and day views).
const ArrangePanel: React.FC<ArrangePanelProps> = ({ tasks, onClose }) => {
    const { t } = useTranslation();
    const [tab, setTab] = useState<ArrangeTab>('nodate');
    const [filter, setFilter] = useState<ArrangeFilter>({
        project: '',
        tag: '',
        priority: '',
    });
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const today = format(new Date(), 'yyyy-MM-dd');

    const tabTasks = useMemo(
        () => arrangeTasks(tasks, tab, today),
        [tasks, tab, today]
    );
    const shown = arrangeTasks(tabTasks, tab, today, filter);
    const projectNames = Array.from(
        new Set(tabTasks.map((task) => projectOf(task)?.name).filter(Boolean))
    ).sort() as string[];
    const tagNames = Array.from(
        new Set(
            tabTasks.flatMap((task) => (task.tags || []).map((g) => g.name))
        )
    ).sort();

    const noProject = t('calendar.arrange.noProject', 'No project');
    const groups = new Map<string, ArrangeTask[]>();
    shown.forEach((task) => {
        const key = projectOf(task)?.name || noProject;
        groups.set(key, [...(groups.get(key) || []), task]);
    });

    const toggle = (key: string) =>
        setCollapsed((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    const selectClass =
        'min-w-0 flex-1 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-200 px-1.5 py-1';

    return (
        <aside
            aria-label={t('calendar.arrange.title', 'Arrange tasks')}
            className="w-72 shrink-0 flex flex-col min-h-0 bg-white dark:bg-gray-700 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600"
        >
            <div className="flex items-center justify-between px-3 pt-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {t('calendar.arrange.title', 'Arrange tasks')}
                </h3>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('common.close', 'Close')}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                    <XMarkIcon className="h-4 w-4 text-gray-600" />
                </button>
            </div>

            <div
                className="flex mx-3 mt-2 rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5"
                role="tablist"
            >
                {(['nodate', 'overdue'] as const).map((key) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={tab === key}
                        onClick={() => setTab(key)}
                        className={`flex-1 px-2 py-1 text-xs font-medium rounded-md ${
                            tab === key
                                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                                : 'text-gray-600 dark:text-gray-300'
                        }`}
                    >
                        {key === 'nodate'
                            ? t('calendar.arrange.noDate', 'No date')
                            : t('calendar.arrange.overdue', 'Overdue')}
                    </button>
                ))}
            </div>

            <div className="flex gap-1 mx-3 mt-2">
                <select
                    aria-label={t('calendar.arrange.filterProject', 'Project')}
                    value={filter.project}
                    onChange={(e) =>
                        setFilter({ ...filter, project: e.target.value })
                    }
                    className={selectClass}
                >
                    <option value="">
                        {t('calendar.arrange.filterProject', 'Project')}
                    </option>
                    {projectNames.map((name) => (
                        <option key={name} value={name}>
                            {name}
                        </option>
                    ))}
                </select>
                <select
                    aria-label={t('calendar.arrange.filterTag', 'Tag')}
                    value={filter.tag}
                    onChange={(e) =>
                        setFilter({ ...filter, tag: e.target.value })
                    }
                    className={selectClass}
                >
                    <option value="">
                        {t('calendar.arrange.filterTag', 'Tag')}
                    </option>
                    {tagNames.map((name) => (
                        <option key={name} value={name}>
                            {name}
                        </option>
                    ))}
                </select>
                <select
                    aria-label={t(
                        'calendar.arrange.filterPriority',
                        'Priority'
                    )}
                    value={filter.priority}
                    onChange={(e) =>
                        setFilter({ ...filter, priority: e.target.value })
                    }
                    className={selectClass}
                >
                    <option value="">
                        {t('calendar.arrange.filterPriority', 'Priority')}
                    </option>
                    {PRIORITY_NAMES.map((name) => (
                        <option key={name} value={name}>
                            {t(`priority.${name}`, name)}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto mt-2 pb-3">
                {shown.length === 0 && (
                    <p className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                        {tab === 'nodate'
                            ? t(
                                  'calendar.arrange.emptyNoDate',
                                  'No undated tasks to schedule'
                              )
                            : t(
                                  'calendar.arrange.emptyOverdue',
                                  'No overdue tasks to schedule'
                              )}
                    </p>
                )}
                {Array.from(groups.entries()).map(([key, groupTasks]) => (
                    <section key={key} className="mt-1">
                        <button
                            type="button"
                            onClick={() => toggle(key)}
                            aria-expanded={!collapsed.has(key)}
                            className="w-full flex items-center gap-1 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                        >
                            <ChevronRightIcon
                                className={`h-3 w-3 transition-transform ${
                                    collapsed.has(key) ? '' : 'rotate-90'
                                }`}
                            />
                            <span className="truncate">{key}</span>
                            <span className="ml-auto">{groupTasks.length}</span>
                        </button>
                        {!collapsed.has(key) &&
                            groupTasks.map((task) => (
                                <div
                                    key={task.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.effectAllowed = 'move';
                                        e.dataTransfer.setData(
                                            'text/plain',
                                            `${ARRANGE_DRAG_PREFIX}${task.id}`
                                        );
                                    }}
                                    className="mx-2 my-0.5 px-2 py-1.5 rounded-md text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-grab truncate"
                                    title={task.original_name || task.name}
                                >
                                    {task.original_name || task.name}
                                    {tab === 'overdue' && task.due_date && (
                                        <span className="ml-1 text-xs text-red-500">
                                            {task.due_date.slice(0, 10)}
                                        </span>
                                    )}
                                </div>
                            ))}
                    </section>
                ))}
            </div>
        </aside>
    );
};

export default ArrangePanel;
