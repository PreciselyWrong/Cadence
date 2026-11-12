import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { fetchTasks } from '../../utils/tasksService';
import { decideTask, TaskDecision } from '../../utils/reviewService';
import { openTaskPanel } from '../../store/taskPanelStore';
import { useToast } from '../Shared/ToastContext';

const chip =
    'min-h-[32px] rounded-full border border-gray-200 px-3 text-xs text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800';

// « Tâches à classer » (docs/41-auto-classify.md): open tasks with no moment
// decided, filed nowhere or filed for the user (needs_when). A filed one asks
// « Quand ? » until a moment is chosen, so it cannot be forgotten in its area.
// `reloadKey` changes when the Inbox made a task here (an address captured).
const UnsortedTasks: React.FC<{ reloadKey?: number }> = ({ reloadKey = 0 }) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [picking, setPicking] = useState<string | null>(null);

    const load = useCallback(
        () =>
            fetchTasks('?type=unsorted')
                .then(({ tasks: list }) => setTasks(list ?? []))
                .catch(() => setTasks([])),
        []
    );

    useEffect(() => {
        load();
    }, [load, reloadKey]);

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

    if (tasks.length === 0) return null;

    return (
        <section className="mb-5" aria-labelledby="unsorted-tasks-title">
            <h2
                id="unsorted-tasks-title"
                className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200"
            >
                {t('inbox.unsorted.title', 'Tâches à classer')}
            </h2>
            <ul className="divide-y divide-gray-100 rounded-xl bg-white dark:divide-gray-800 dark:bg-gray-900">
                {tasks.map((task) => {
                    const place = task.Project?.name || task.Area?.name;
                    return (
                        <li key={task.uid} className="px-3 py-2">
                            <button
                                type="button"
                                className="w-full text-left text-sm text-gray-900 hover:underline dark:text-gray-100"
                                onClick={() =>
                                    task.uid && openTaskPanel(task.uid)
                                }
                            >
                                {task.name}
                            </button>
                            {place && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {place}
                                </p>
                            )}
                            {task.needs_when && (
                                <div
                                    role="group"
                                    aria-label={t(
                                        'inbox.unsorted.when',
                                        'Quand ?'
                                    )}
                                    className="mt-2 flex flex-wrap items-center gap-2"
                                >
                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                        {t('inbox.unsorted.when', 'Quand ?')}
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
                                            className="min-h-[32px] rounded-lg border border-gray-200 px-2 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
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
                                        {t('inbox.unsorted.later', 'Plus tard')}
                                    </button>
                                    <button
                                        type="button"
                                        className={chip}
                                        disabled={busy === task.uid}
                                        onClick={() =>
                                            decide(task, { needs_when: false })
                                        }
                                    >
                                        {t(
                                            'inbox.unsorted.noDate',
                                            'Sans date'
                                        )}
                                    </button>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

export default UnsortedTasks;
