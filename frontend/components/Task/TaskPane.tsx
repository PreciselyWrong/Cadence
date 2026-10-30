import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowTopRightOnSquareIcon,
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
import TaskDecisionRow from '../Review/TaskDecisionRow';
import PostponementHistory from '../Review/PostponementHistory';
import { useTaskEditor } from './useTaskEditor';
import { TaskEditorBody, TaskEditorFooter } from './TaskEditorBody';

interface TaskPaneBodyProps {
    task: Task;
    onSaved: (task: Task) => void;
}

// The inline editor in the pane: a chip per field, description in place,
// subtasks, attachments and comments, saved field by field. Keyed by task
// uid by its parent, so local draft state resets when another task opens.
const TaskPaneBody: React.FC<TaskPaneBodyProps> = ({ task, onSaved }) => {
    const ed = useTaskEditor(task, onSaved);

    return (
        <>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-5">
                    <TaskEditorBody ed={ed} />
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

// Right-hand pane beside the task list (minimal mode). Full width sheet below md.
const TaskPane: React.FC = () => {
    const { t } = useTranslation();
    const isMinimal = useIsMinimal();
    const location = useLocation();
    const { openTaskUid, closeTask } = useTaskPane();
    const [task, setTask] = useState<Task | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);

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

    useEffect(() => {
        if (!openTaskUid) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeTask();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [openTaskUid, closeTask]);

    // The editor keeps its own copy of the task; rows learn of each save
    const handleSaved = useCallback((saved: Task) => {
        window.dispatchEvent(
            new CustomEvent<Task>(TASK_UPDATED_EVENT, { detail: saved })
        );
    }, []);

    if (
        !isMinimal ||
        !openTaskUid ||
        !canShowTaskPane(location.pathname, location.search)
    )
        return null;

    const fullPagePath = `/task/${encodeURIComponent(openTaskUid)}`;

    return (
        <aside
            aria-label={t('taskPane.label', 'Task details')}
            className="flex min-h-0 flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:w-[420px] md:flex-shrink-0 max-md:fixed max-md:inset-0 max-md:z-40"
        >
            <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-2 dark:border-gray-800">
                <Link
                    to={fullPagePath}
                    className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    {t('taskPane.openFullPage', 'Open full page')}
                </Link>
                <button
                    type="button"
                    onClick={closeTask}
                    aria-label={t('taskPane.close', 'Close')}
                    title={t('taskPane.close', 'Close')}
                    className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                >
                    <XMarkIcon className="h-5 w-5" />
                </button>
            </div>
            {task ? (
                <TaskPaneBody
                    key={task.uid}
                    task={task}
                    onSaved={handleSaved}
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
