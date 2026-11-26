import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TFunction } from 'i18next';
import {
    ArrowTopRightOnSquareIcon,
    ExclamationTriangleIcon,
    FolderIcon,
    PlusIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { BoardTreeSubProject, ProjectStatus } from '../../../entities/Project';
import { Task } from '../../../entities/Task';
import { createUidSlug } from '../../../utils/slugUtils';
import EntityIcon from '../../Shared/EntityIcon';
import { getProjectStatusTint } from '../projectStatusStyles';
import { normalizeTaskStatus, PORTFOLIO_STATUS_ORDER } from './boardModel';

interface SubProjectDrawerProps {
    project: BoardTreeSubProject | null;
    tasks: Task[];
    onClose: () => void;
    onOpenTask: (task: Task) => void;
    onToggleTask: (task: Task) => void;
    onQuickAddTask: (projectUid: string, name: string) => Promise<void>;
    onChangeStatus: (
        projectUid: string,
        status: ProjectStatus
    ) => Promise<void>;
    statusLabel: (status: ProjectStatus) => string;
    readOnly?: boolean;
    t: TFunction;
}

const DONE_STATUSES = new Set<unknown>([2, 'done']);

const SubProjectDrawer: React.FC<SubProjectDrawerProps> = ({
    project,
    tasks,
    onClose,
    onOpenTask,
    onToggleTask,
    onQuickAddTask,
    onChangeStatus,
    statusLabel,
    readOnly = false,
    t,
}) => {
    const [newTaskName, setNewTaskName] = useState('');
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        if (!project) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [project, onClose]);

    if (!project) return null;

    const inProgressTasks = tasks.filter(
        (tk) => normalizeTaskStatus(tk.status) === 'in_progress'
    );
    const otherTasks = tasks.filter(
        (tk) => normalizeTaskStatus(tk.status) !== 'in_progress'
    );
    const handoff = project.handoff_state;
    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newTaskName.trim();
        if (!trimmed || adding) return;
        setAdding(true);
        try {
            await onQuickAddTask(project.uid, trimmed);
            setNewTaskName('');
        } finally {
            setAdding(false);
        }
    };

    const renderTask = (task: Task) => {
        const done = DONE_STATUSES.has(task.status);
        return (
            <li
                key={task.uid}
                className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50/70 px-2.5 py-2 hover:bg-gray-100/80 dark:border-gray-800 dark:bg-gray-800/50 dark:hover:bg-gray-800"
            >
                <input
                    type="checkbox"
                    checked={done}
                    disabled={readOnly}
                    onChange={() => onToggleTask(task)}
                    className="mt-0.5 h-4 w-4 rounded-full border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <button
                    type="button"
                    onClick={() => onOpenTask(task)}
                    className={`min-w-0 flex-1 text-left text-sm ${
                        done
                            ? 'text-gray-400 line-through'
                            : 'text-gray-900 dark:text-gray-100'
                    }`}
                >
                    {task.name}
                </button>
            </li>
        );
    };

    return (
        <div
            className="fixed inset-0 z-40 flex justify-end bg-black/25 backdrop-blur-[1px]"
            onClick={onClose}
            data-testid="subproject-drawer-backdrop"
        >
            <aside
                className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-gray-900 sm:border-l sm:border-gray-200 dark:sm:border-gray-800"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label={project.name}
                data-testid="subproject-drawer"
            >
                <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3.5 dark:border-gray-800">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            {project.color && (
                                <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: project.color }}
                                />
                            )}
                            <EntityIcon
                                icon={project.icon}
                                className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
                                fallback={
                                    <FolderIcon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                                }
                            />
                            <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                                {project.name}
                            </h2>
                            {project.source_type === 'todo_md' && (
                                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                    TODO.md
                                </span>
                            )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <select
                                aria-label={t('projects.status', 'Status')}
                                value={project.status}
                                disabled={readOnly}
                                onChange={(e) =>
                                    void onChangeStatus(
                                        project.uid,
                                        e.target.value as ProjectStatus
                                    )
                                }
                                className={`rounded-md border-0 px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${getProjectStatusTint(project.status)}`}
                            >
                                {PORTFOLIO_STATUS_ORDER.map((st) => (
                                    <option key={st} value={st}>
                                        {statusLabel(st)}
                                    </option>
                                ))}
                            </select>
                            <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                                {project.done_tasks_count}/
                                {project.total_tasks_count}{' '}
                                {t('tasks.completed', 'done')}
                            </span>
                            <Link
                                to={`/project/${createUidSlug(project.uid, project.name)}`}
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                            >
                                {t('projectBoard.openProject', 'Open page')}
                                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('common.close', 'Close')}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    >
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3.5">
                    {handoff && (
                        <section
                            className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs dark:border-indigo-900/50 dark:bg-indigo-950/30"
                            data-testid="drawer-handoff"
                        >
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                                <span className="font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                                    {handoff.section ||
                                        t(
                                            'projectBoard.handoffTitle',
                                            'Current state'
                                        )}
                                </span>
                                {handoff.branch && (
                                    <span className="truncate rounded bg-white/80 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 dark:bg-gray-900/80 dark:text-gray-300">
                                        {handoff.branch}
                                    </span>
                                )}
                            </div>
                            {handoff.next_action && (
                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                    → {handoff.next_action}
                                </p>
                            )}
                            {handoff.blockers && (
                                <p className="mt-1.5 flex items-start gap-1.5 text-amber-800 dark:text-amber-300">
                                    <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span>{handoff.blockers}</span>
                                </p>
                            )}
                            {handoff.tests && (
                                <p className="mt-1 text-gray-600 dark:text-gray-400">
                                    {handoff.tests}
                                </p>
                            )}
                        </section>
                    )}

                    {project.description && (
                        <p className="whitespace-pre-line text-xs text-gray-600 dark:text-gray-400">
                            {project.description}
                        </p>
                    )}

                    {!readOnly && (
                        <form onSubmit={handleAdd} className="flex gap-1.5">
                            <input
                                type="text"
                                value={newTaskName}
                                onChange={(e) => setNewTaskName(e.target.value)}
                                placeholder={t(
                                    'projectBoard.quickAddPlaceholder',
                                    'Add a task…'
                                )}
                                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                            />
                            <button
                                type="submit"
                                disabled={adding || !newTaskName.trim()}
                                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                            >
                                <PlusIcon className="h-3.5 w-3.5" />
                                {t('common.add', 'Add')}
                            </button>
                        </form>
                    )}

                    <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            {t('tasks.title', 'Tasks')} ({tasks.length})
                        </h3>
                        {inProgressTasks.length > 0 && (
                            <div
                                className="mb-3"
                                data-testid="drawer-in-progress"
                            >
                                <h4 className="mb-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                                    {t(
                                        'projectStatus.in_progress',
                                        'In progress'
                                    )}{' '}
                                    ({inProgressTasks.length})
                                </h4>
                                <ul className="space-y-1.5">
                                    {inProgressTasks.map(renderTask)}
                                </ul>
                            </div>
                        )}
                        {tasks.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                                {t(
                                    'projectBoard.noOpenTasks',
                                    'No open tasks in this sub-project.'
                                )}
                            </p>
                        ) : (
                            otherTasks.length > 0 && (
                                <ul className="space-y-1.5">
                                    {otherTasks.map(renderTask)}
                                </ul>
                            )
                        )}
                    </section>
                </div>
            </aside>
        </div>
    );
};

export default SubProjectDrawer;
