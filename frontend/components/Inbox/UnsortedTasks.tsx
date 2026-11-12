import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { fetchTasks, toggleTaskCompletion } from '../../utils/tasksService';
import { decideTask, TaskDecision } from '../../utils/reviewService';
import { useTaskPane } from '../../contexts/TaskPaneContext';
import { useToast } from '../Shared/ToastContext';
import TaskCheckCircle from '../Task/TaskCheckCircle';
import TaskChip from '../Shared/task/TaskChip';
import { ROW_GROUP } from '../Shared/task/rowMenu';

const chip =
    'h-7 rounded-lg px-2.5 text-xs font-medium text-surface-on ring-1 ring-inset ring-outline-variant hover:bg-surface-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 max-sm:min-h-[44px]';

// A long backlog would push the ideas out of sight: the first few, then
// "Show all".
const VISIBLE = 5;

// « Tâches à classer » (docs/41-auto-classify.md): open tasks with no moment
// decided, filed nowhere or filed for the user (needs_when). A filed one asks
// « Quand ? » until a moment is chosen, so it cannot be forgotten in its area.
const UnsortedTasks: React.FC = () => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [picking, setPicking] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);
    const { openTaskUid, openTask, closeTask } = useTaskPane();

    const load = useCallback(
        () =>
            fetchTasks('?type=unsorted')
                .then(({ tasks: list }) => setTasks(list ?? []))
                .catch(() => setTasks([])),
        []
    );

    useEffect(() => {
        load();
    }, [load]);

    const decide = async (task: Task, decision: TaskDecision) => {
        if (!task.uid) return;
        setBusy(task.uid);
        try {
            await decideTask(task.uid, decision);
            setTasks((list) => list.filter((item) => item.uid !== task.uid));
            setPicking(null);
        } catch {
            showErrorToast(
                t('review.saveError', 'Could not save the decision.')
            );
        } finally {
            setBusy(null);
        }
    };

    // Done from the row's check: it leaves the list once saved.
    const complete = async (task: Task) => {
        if (!task.uid) return;
        try {
            await toggleTaskCompletion(task.uid, task);
            setTasks((list) => list.filter((item) => item.uid !== task.uid));
        } catch {
            showErrorToast(
                t('task.statusUpdateError', 'Failed to update status')
            );
        }
    };

    if (tasks.length === 0) return null;

    return (
        <section className="mb-4" aria-labelledby="unsorted-tasks-title">
            <h2
                id="unsorted-tasks-title"
                className="flex h-8 items-center gap-1.5 px-2 text-xs font-medium text-surface-on-variant"
            >
                {t('inbox.unsorted.title', 'Tâches à classer')}
                <span className="tabular-nums">{tasks.length}</span>
            </h2>
            <ul>
                {(showAll ? tasks : tasks.slice(0, VISIBLE)).map((task) => {
                    const place = task.Project?.name || task.Area?.name;
                    return (
                        <li
                            key={task.uid}
                            data-task-row=""
                            className={`${ROW_GROUP} flex items-start gap-3 rounded-xl px-2 py-2 ${
                                openTaskUid === task.uid
                                    ? 'bg-surface-highest'
                                    : 'hover:bg-surface-high/60'
                            }`}
                        >
                            <span className="pt-0.5">
                                <TaskCheckCircle
                                    task={task}
                                    onToggle={() => complete(task)}
                                />
                            </span>
                            <div className="min-w-0 flex-1">
                                <button
                                    type="button"
                                    className="block w-full truncate text-left text-body font-medium leading-6 text-surface-on outline-none focus-visible:underline"
                                    onClick={() =>
                                        task.uid &&
                                        (openTaskUid === task.uid
                                            ? closeTask()
                                            : openTask(task.uid))
                                    }
                                >
                                    {task.name}
                                </button>
                                {place && (
                                    <span className="mt-1 flex min-w-0">
                                        <TaskChip>
                                            <span className="truncate">
                                                {place}
                                            </span>
                                        </TaskChip>
                                    </span>
                                )}
                                {task.needs_when && (
                                    <div
                                        role="group"
                                        aria-label={t(
                                            'inbox.unsorted.when',
                                            'Quand ?'
                                        )}
                                        className="mt-1.5 flex flex-wrap items-center gap-1.5"
                                    >
                                        <span className="mr-1 text-xs text-surface-on-variant">
                                            {t(
                                                'inbox.unsorted.when',
                                                'Quand ?'
                                            )}
                                        </span>
                                        <button
                                            type="button"
                                            className={chip}
                                            disabled={busy === task.uid}
                                            onClick={() =>
                                                decide(task, {
                                                    week_of: 'this_week',
                                                })
                                            }
                                        >
                                            {t(
                                                'inbox.unsorted.thisWeek',
                                                'Cette semaine'
                                            )}
                                        </button>
                                        {picking === task.uid ? (
                                            <input
                                                type="date"
                                                autoFocus
                                                aria-label={t(
                                                    'inbox.unsorted.date',
                                                    'Une date'
                                                )}
                                                className="h-7 rounded-lg border-0 bg-surface-high px-2 text-xs text-surface-on"
                                                onChange={(event) =>
                                                    event.target.value &&
                                                    decide(task, {
                                                        due_date:
                                                            event.target.value,
                                                    })
                                                }
                                            />
                                        ) : (
                                            <button
                                                type="button"
                                                className={chip}
                                                disabled={busy === task.uid}
                                                onClick={() =>
                                                    setPicking(task.uid ?? null)
                                                }
                                            >
                                                {t(
                                                    'inbox.unsorted.date',
                                                    'Une date'
                                                )}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className={chip}
                                            disabled={busy === task.uid}
                                            onClick={() =>
                                                decide(task, { later: true })
                                            }
                                        >
                                            {t(
                                                'inbox.unsorted.later',
                                                'Plus tard'
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            className={chip}
                                            disabled={busy === task.uid}
                                            onClick={() =>
                                                decide(task, {
                                                    needs_when: false,
                                                })
                                            }
                                        >
                                            {t(
                                                'inbox.unsorted.noDate',
                                                'Sans date'
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
            {!showAll && tasks.length > VISIBLE && (
                <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="mt-1 h-7 rounded-lg px-3 text-xs font-medium text-surface-on-variant hover:bg-surface-high hover:text-surface-on"
                >
                    {t('common.showAll', 'Show All')}
                </button>
            )}
        </section>
    );
};

export default UnsortedTasks;
