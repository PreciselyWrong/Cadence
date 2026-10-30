import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowTopRightOnSquareIcon,
    PlusCircleIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import {
    createTask,
    fetchSubtasks,
    fetchTaskByUid,
    toggleTaskCompletion,
} from '../../utils/tasksService';
import { useStore } from '../../store/useStore';
import { isTaskCompleted } from '../../constants/taskStatus';
import { useToast } from '../Shared/ToastContext';
import ConfirmDialog from '../Shared/ConfirmDialog';
import MarkdownRenderer from '../Shared/MarkdownRenderer';
import TagInput from '../Tag/TagInput';
import TaskCheckCircle from './TaskCheckCircle';
import MinimalQuickEdits from './TaskRow/MinimalQuickEdits';
import { useTaskRowSave } from './TaskRow/useTaskRowSave';
import { dueToneClass, formatDueLabel } from './TaskRow/TaskRowCollapsed';
import {
    canShowTaskPane,
    TASK_UPDATED_EVENT,
    useTaskPane,
} from '../../contexts/TaskPaneContext';
import { useIsMinimal } from '../../hooks/useUiDensity';
import TaskDecisionRow from '../Review/TaskDecisionRow';
import PostponementHistory from '../Review/PostponementHistory';

const sectionLabel =
    'mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400';

interface TaskPaneBodyProps {
    task: Task;
    subtasks: Task[];
    onSaved: (task: Task) => Promise<void>;
    onSubtasksChange: (subtasks: Task[]) => void;
}

// Edits in place with the same save path as the expanded row. Keyed by task
// uid by its parent, so local draft state resets when another task opens.
const TaskPaneBody: React.FC<TaskPaneBodyProps> = ({
    task,
    subtasks,
    onSaved,
    onSubtasksChange,
}) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const setters = useTaskRowSave(task, onSaved);
    const projects = useStore((state: any) => state.projectsStore?.projects);
    const tagsStore = useStore((state: any) => state.tagsStore);

    const currentName = task.original_name || task.name;
    const [draftName, setDraftName] = useState(currentName);
    const [isEditingNote, setIsEditingNote] = useState(false);
    const [note, setNote] = useState(task.note || '');
    const [newSubtask, setNewSubtask] = useState('');
    const [isBlockedConfirmOpen, setIsBlockedConfirmOpen] = useState(false);

    useEffect(() => setDraftName(currentName), [currentName]);
    useEffect(() => setNote(task.note || ''), [task.note]);

    const commitTitle = async () => {
        const next = draftName.trim();
        if (!next || next === currentName) {
            setDraftName(currentName);
            return;
        }
        try {
            await setters.setTitle(next);
        } catch {
            setDraftName(currentName);
        }
    };

    const commitNote = () => {
        setIsEditingNote(false);
        if (note.trim() !== (task.note || '').trim()) {
            void setters.setNote(note).catch(() => setNote(task.note || ''));
        }
    };

    const performToggle = async () => {
        if (!task.uid) return;
        try {
            const response = await toggleTaskCompletion(task.uid, task);
            await onSaved({
                ...task,
                ...response,
                subtasks: response.subtasks || task.subtasks || [],
            });
            if (response.parent_child_logic_executed) {
                await onSaved(await fetchTaskByUid(task.uid));
            }
        } catch (error) {
            console.error('Task pane completion failed:', error);
            showErrorToast(
                t('task.statusUpdateError', 'Failed to update status')
            );
        }
    };

    // Completing a blocked task is allowed, but asked about first.
    const handleToggle = () => {
        if (task.is_blocked && !isTaskCompleted(task.status)) {
            setIsBlockedConfirmOpen(true);
            return;
        }
        void performToggle();
    };

    const addSubtask = async () => {
        const name = newSubtask.trim();
        if (!name || !task.uid) return;
        try {
            await createTask({
                name,
                status: 'not_started',
                completed_at: null,
                parent_task_id: task.id,
            } as Task);
            setNewSubtask('');
            onSubtasksChange(await fetchSubtasks(task.uid));
        } catch (error) {
            console.error('Failed to add subtask:', error);
            showErrorToast(
                t('task.subtasksUpdateError', 'Failed to add subtask')
            );
        }
    };

    const projectId = task.project_id ?? null;

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3">
                <div className="mt-1.5">
                    <TaskCheckCircle task={task} onToggle={handleToggle} />
                </div>
                <input
                    aria-label={t('taskPane.titleLabel', 'Task title')}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={() => void commitTitle()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-base font-medium text-gray-900 hover:bg-gray-100 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:text-gray-100 dark:hover:bg-gray-800 dark:focus:bg-gray-900"
                />
            </div>

            <MinimalQuickEdits
                task={task}
                onFieldUpdate={onSaved}
                dueClass={dueToneClass(task)}
                dueText={
                    task.due_date
                        ? `${formatDueLabel(task.due_date, t)}${
                              task.due_has_time && task.due_time
                                  ? ` ${task.due_time}`
                                  : ''
                          }`
                        : null
                }
            />

            <TaskDecisionRow task={task} onSaved={onSaved} />

            <div>
                <p className={sectionLabel}>
                    {t('taskPane.project', 'Project')}
                </p>
                <select
                    aria-label={t('taskPane.project', 'Project')}
                    value={projectId ?? ''}
                    onChange={(e) =>
                        void setters.setProject(
                            e.target.value ? Number(e.target.value) : null
                        )
                    }
                    className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                >
                    <option value="">
                        {t('taskPane.noProject', 'No project')}
                    </option>
                    {(projects || []).map((p: any) => (
                        <option key={p.id ?? p.uid} value={p.id}>
                            {p.name}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <p className={sectionLabel}>{t('taskPane.tags', 'Tags')}</p>
                <TagInput
                    initialTags={task.tags?.map((tag) => tag.name) || []}
                    availableTags={tagsStore?.tags || []}
                    onTagsChange={(names) => void setters.setTags(names)}
                    onFocus={() => void tagsStore?.loadTags?.()}
                />
            </div>

            <div>
                <p className={sectionLabel}>{t('taskPane.note', 'Note')}</p>
                {isEditingNote ? (
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onBlur={commitNote}
                        rows={5}
                        autoFocus
                        placeholder={t(
                            'forms.task.notePlaceholder',
                            'Add a note...'
                        )}
                        className="w-full resize-y rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-0 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    />
                ) : (
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                            if ((e.target as HTMLElement).closest('a')) return;
                            setIsEditingNote(true);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') setIsEditingNote(true);
                        }}
                        className="min-h-[2.5rem] cursor-text rounded-md bg-gray-50 px-2 py-1.5 text-sm dark:bg-gray-800/60"
                    >
                        {note.trim() ? (
                            <MarkdownRenderer
                                content={note}
                                className="prose prose-sm dark:prose-invert max-w-none break-words"
                            />
                        ) : (
                            <span className="text-gray-400 dark:text-gray-500">
                                {t(
                                    'forms.task.notePlaceholder',
                                    'Add a note...'
                                )}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div>
                <p className={sectionLabel}>
                    {t('taskPane.subtasks', 'Subtasks')}
                </p>
                <ul className="space-y-1">
                    {subtasks.map((subtask) => (
                        <li
                            key={subtask.uid}
                            className={`px-1 text-sm ${
                                isTaskCompleted(subtask.status)
                                    ? 'text-gray-400 line-through dark:text-gray-500'
                                    : 'text-gray-800 dark:text-gray-200'
                            }`}
                        >
                            {subtask.name}
                        </li>
                    ))}
                </ul>
                <div className="mt-2 flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1.5 dark:border-gray-700">
                    <PlusCircleIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    <input
                        value={newSubtask}
                        onChange={(e) => setNewSubtask(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void addSubtask();
                            }
                        }}
                        placeholder={t(
                            'subtasks.placeholder',
                            'Add a subtask...'
                        )}
                        className="w-full bg-transparent text-sm text-gray-900 focus:outline-none focus:ring-0 dark:text-gray-100"
                    />
                </div>
            </div>

            {task.uid && (
                <PostponementHistory
                    taskUid={task.uid}
                    version={task.due_date}
                />
            )}

            {isBlockedConfirmOpen && (
                <ConfirmDialog
                    title={t(
                        'relations.completeBlockedTitle',
                        'Task is blocked'
                    )}
                    message={t(
                        'relations.completeBlockedMessage',
                        'This task is blocked by {{count}} open task(s). Complete it anyway?',
                        { count: task.blocked_by_count || 1 }
                    )}
                    confirmButtonText={t(
                        'relations.completeAnyway',
                        'Complete anyway'
                    )}
                    onConfirm={() => {
                        setIsBlockedConfirmOpen(false);
                        void performToggle();
                    }}
                    onCancel={() => setIsBlockedConfirmOpen(false)}
                />
            )}
        </div>
    );
};

// Right-hand pane beside the task list (minimal mode). Full width sheet below md.
const TaskPane: React.FC = () => {
    const { t } = useTranslation();
    const isMinimal = useIsMinimal();
    const location = useLocation();
    const { openTaskUid, closeTask } = useTaskPane();
    const [task, setTask] = useState<Task | null>(null);
    const [subtasks, setSubtasks] = useState<Task[]>([]);
    const [loadFailed, setLoadFailed] = useState(false);

    useEffect(() => {
        if (!openTaskUid) return;
        let cancelled = false;
        setTask(null);
        setSubtasks([]);
        setLoadFailed(false);
        Promise.all([fetchTaskByUid(openTaskUid), fetchSubtasks(openTaskUid)])
            .then(([loaded, loadedSubtasks]) => {
                if (cancelled) return;
                setTask(loaded);
                setSubtasks(loadedSubtasks);
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

    const handleSaved = useCallback(async (saved: Task) => {
        setTask(saved);
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
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {task ? (
                    <TaskPaneBody
                        key={task.uid}
                        task={task}
                        subtasks={subtasks}
                        onSaved={handleSaved}
                        onSubtasksChange={setSubtasks}
                    />
                ) : loadFailed ? (
                    <p
                        role="alert"
                        className="text-sm text-red-600 dark:text-red-400"
                    >
                        {t('taskPane.loadError', 'Could not load this task.')}
                    </p>
                ) : null}
            </div>
        </aside>
    );
};

export default TaskPane;
