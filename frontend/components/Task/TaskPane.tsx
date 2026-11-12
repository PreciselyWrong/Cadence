import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowTopRightOnSquareIcon,
    ArrowsPointingInIcon,
    ArrowsPointingOutIcon,
    FolderIcon,
    TagIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import { fetchTaskByUid } from '../../utils/tasksService';
import {
    canShowTaskPane,
    TASK_UPDATED_EVENT,
    useTaskPane,
} from '../../contexts/TaskPaneContext';
import { useIsMinimal } from '../../hooks/useUiDensity';
import { createProjectUrl, createTagUrl } from '../../utils/slugUtils';
import { formatMinute } from '../DailyPlan/planUtils';
import TaskDecisionRow from '../Review/TaskDecisionRow';
import PostponementHistory from '../Review/PostponementHistory';
import { useTaskEditor } from './useTaskEditor';
import { TaskEditorBody, TaskEditorFooter } from './TaskEditorBody';

// The day a task is planned on, from `?task=uid&on=YYYY-MM-DD&at=minute`
// (the calendar that opened the sheet knows it; the task payload does not).
export interface PlannedOn {
    date: string;
    minute: number | null;
}

export const parsePlannedOn = (search: string): PlannedOn | null => {
    const params = new URLSearchParams(search);
    const date = params.get('on') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
        return null;
    }
    const at = params.get('at');
    const minute =
        at !== null && /^\d{1,4}$/.test(at) && Number(at) < 24 * 60
            ? Number(at)
            : null;
    return { date, minute };
};

// "Thu 12 Nov · 10:00" in the app language.
export const formatPlannedWhen = (
    planned: PlannedOn,
    language: string
): string => {
    const [year, month, day] = planned.date.split('-').map(Number);
    const dayLabel = new Intl.DateTimeFormat(language, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    }).format(new Date(year, month - 1, day));
    return planned.minute === null
        ? dayLabel
        : `${dayLabel} · ${formatMinute(planned.minute)}`;
};

interface TaskPaneBodyProps {
    task: Task;
    onSaved: (task: Task) => void;
    titleId: string;
    plannedLabel: string | null;
}

// The inline editor in the pane: a chip per field, description in place,
// subtasks, attachments and comments, saved field by field. Keyed by task
// uid by its parent, so local draft state resets when another task opens.
const TaskPaneBody: React.FC<TaskPaneBodyProps> = ({
    task,
    onSaved,
    titleId,
    plannedLabel,
}) => {
    const ed = useTaskEditor(task, onSaved);

    return (
        <>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-5">
                    <TaskEditorBody
                        ed={ed}
                        titleId={titleId}
                        plannedLabel={plannedLabel}
                    />
                    {ed.error && (
                        <p
                            role="alert"
                            className="text-sm text-red-600 dark:text-red-400"
                        >
                            {ed.error}
                        </p>
                    )}
                    <TaskDecisionRow
                        task={ed.task}
                        onSaved={async (saved) => {
                            ed.reset(saved);
                            onSaved(saved);
                        }}
                    />
                    {ed.task.uid && (
                        <PostponementHistory
                            taskUid={ed.task.uid}
                            version={ed.task.due_date}
                        />
                    )}
                </div>
            </div>
            <TaskEditorFooter ed={ed} withStatus />
        </>
    );
};

// The task's detail beside the list (minimal mode), or under the page where
// the right side is taken (Today's calendar). Full width sheet below md.
interface TaskPaneProps {
    placement?: 'side' | 'bottom';
}

const TaskPane: React.FC<TaskPaneProps> = ({ placement = 'side' }) => {
    const { t, i18n } = useTranslation();
    const isMinimal = useIsMinimal();
    const location = useLocation();
    const titleId = useId();
    const { openTaskUid, closeTask } = useTaskPane();
    const [task, setTask] = useState<Task | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    // The floating sheet (placement bottom) can fill the page instead.
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (!openTaskUid) return;
        let cancelled = false;
        setTask(null);
        setLoadFailed(false);
        fetchTaskByUid(openTaskUid)
            .then((loaded) => {
                if (cancelled) return;
                setTask(loaded);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error('Failed to load task for pane:', error);
                setLoadFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [openTaskUid]);

    const floating = placement === 'bottom';
    const shown =
        isMinimal &&
        !!openTaskUid &&
        canShowTaskPane(location.pathname, location.search);

    useEffect(() => {
        if (!openTaskUid) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeTask();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [openTaskUid, closeTask]);

    // The floating sheet takes focus when it opens and gives it back to the
    // element that opened it when it closes.
    const sheetRef = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (!shown || !floating) return;
        const opener =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        sheetRef.current?.focus();
        return () => {
            if (opener?.isConnected) opener.focus();
        };
    }, [shown, floating]);

    // A click outside the floating sheet closes it, except on a task row or
    // a calendar block (they open another task or toggle this one) and on
    // menus and dialogs drawn in portals.
    useEffect(() => {
        if (!openTaskUid || placement !== 'bottom') return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Element | null;
            if (!target || sheetRef.current?.contains(target)) return;
            if (
                target.closest(
                    '[data-task-row],[data-calendar-block],[role="menu"],[role="dialog"],[role="listbox"]'
                )
            ) {
                return;
            }
            closeTask();
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [openTaskUid, placement, closeTask]);

    // The editor keeps its own copy of the task; rows learn of each save
    const handleSaved = useCallback((saved: Task) => {
        window.dispatchEvent(
            new CustomEvent<Task>(TASK_UPDATED_EVENT, { detail: saved })
        );
    }, []);

    if (!shown || !openTaskUid) return null;

    const fullPagePath = `/task/${encodeURIComponent(openTaskUid)}`;
    const planned = parsePlannedOn(location.search);
    const plannedLabel = planned
        ? t('taskPane.planned', 'Planned {{when}}', {
              when: formatPlannedWhen(planned, i18n.language),
          })
        : null;
    // Jump to the task's project or tag: their pages list the other tasks.
    const jumpClass =
        'inline-flex h-7 max-w-[14rem] items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';
    const iconButton =
        'rounded-md p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100';

    return (
        <aside
            ref={sheetRef}
            role={floating ? 'dialog' : undefined}
            aria-modal={floating ? 'false' : undefined}
            aria-labelledby={floating ? titleId : undefined}
            aria-label={
                floating ? undefined : t('taskPane.label', 'Task details')
            }
            tabIndex={floating ? -1 : undefined}
            className={`flex min-h-0 flex-col bg-white outline-none dark:bg-gray-900 max-md:fixed max-md:inset-0 max-md:z-40 md:flex-shrink-0 ${
                floating
                    ? // A sheet over the page: the page shows on the sides and below.
                      `md:absolute md:inset-x-3 md:bottom-3 md:z-40 md:overflow-hidden md:rounded-2xl md:shadow-2xl md:ring-1 md:ring-black/10 dark:md:ring-white/10 ${
                          expanded ? 'md:top-3' : 'md:h-[46%] md:min-h-[300px]'
                      }`
                    : 'border-l border-gray-200 dark:border-gray-800 md:w-[420px]'
            }`}
        >
            <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-2 dark:border-gray-800">
                {floating ? (
                    <button
                        type="button"
                        onClick={() => setExpanded((value) => !value)}
                        aria-pressed={expanded}
                        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                    >
                        {expanded ? (
                            <ArrowsPointingInIcon className="h-4 w-4" />
                        ) : (
                            <ArrowsPointingOutIcon className="h-4 w-4" />
                        )}
                        {expanded
                            ? t('taskPane.shrink', 'Shrink')
                            : t('taskPane.expand', 'Expand')}
                    </button>
                ) : (
                    <Link
                        to={fullPagePath}
                        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                    >
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        {t('taskPane.openFullPage', 'Open full page')}
                    </Link>
                )}
                {task && (
                    <nav
                        aria-label={t('taskPane.goTo', 'Go to')}
                        className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5"
                    >
                        {task.Project?.uid && task.Project.name && (
                            <Link
                                to={createProjectUrl({
                                    uid: task.Project.uid,
                                    name: task.Project.name,
                                })}
                                className={jumpClass}
                            >
                                <FolderIcon className="h-4 w-4 shrink-0" />
                                <span className="truncate">
                                    {task.Project.name}
                                </span>
                            </Link>
                        )}
                        {(task.tags ?? []).slice(0, 3).map((tag) =>
                            tag.uid ? (
                                <Link
                                    key={tag.uid}
                                    to={createTagUrl({
                                        uid: tag.uid,
                                        name: tag.name,
                                    })}
                                    className={jumpClass}
                                >
                                    <TagIcon className="h-4 w-4 shrink-0" />
                                    <span className="truncate">{tag.name}</span>
                                </Link>
                            ) : null
                        )}
                    </nav>
                )}
                <button
                    type="button"
                    onClick={closeTask}
                    aria-label={t('taskPane.close', 'Close')}
                    title={t('taskPane.close', 'Close')}
                    className={iconButton}
                >
                    <XMarkIcon className="h-5 w-5" />
                </button>
            </div>
            {task ? (
                <TaskPaneBody
                    key={task.uid}
                    task={task}
                    onSaved={handleSaved}
                    titleId={titleId}
                    plannedLabel={plannedLabel}
                />
            ) : loadFailed ? (
                <p
                    role="alert"
                    className="px-4 py-4 text-sm text-red-600 dark:text-red-400"
                >
                    {t('taskPane.loadError', 'Could not load this task.')}
                </p>
            ) : null}
        </aside>
    );
};

export default TaskPane;
