import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { decideTask, isParked, TaskDecision } from '../../utils/reviewService';
import { useToast } from '../Shared/ToastContext';

interface TaskDecisionRowProps {
    task: Task;
    onSaved: (task: Task) => Promise<void>;
}

// Three quiet toggles in the task pane: In view (a possibility), This week
// (a commitment) and Later (parked). A review date shows only for a parked
// task or one that already has a date.
const TaskDecisionRow: React.FC<TaskDecisionRowProps> = ({ task, onSaved }) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const [saving, setSaving] = useState(false);
    const parked = isParked(task);
    const thisWeek = Boolean(task.week_of) && isCurrentWeek(task.week_of);

    const save = async (decision: TaskDecision) => {
        if (!task.uid) return;
        setSaving(true);
        try {
            const updated = await decideTask(task.uid, decision);
            await onSaved({
                ...task,
                ...updated,
                subtasks: updated.subtasks || task.subtasks || [],
            });
        } catch {
            showErrorToast(
                t('review.saveError', 'Could not save the decision.')
            );
        } finally {
            setSaving(false);
        }
    };

    const chip = (active: boolean) =>
        `rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
            active
                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
        }`;

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                aria-pressed={Boolean(task.in_view)}
                disabled={saving || parked}
                onClick={() => void save({ in_view: !task.in_view })}
                className={chip(Boolean(task.in_view))}
            >
                {t('review.actions.inView', 'In view')}
            </button>
            <button
                type="button"
                aria-pressed={thisWeek}
                disabled={saving || parked}
                onClick={() =>
                    void save({ week_of: thisWeek ? null : 'this_week' })
                }
                className={chip(thisWeek)}
            >
                {t('review.actions.thisWeek', 'This week')}
            </button>
            <button
                type="button"
                aria-pressed={parked}
                disabled={saving}
                onClick={() =>
                    void save(
                        parked
                            ? { later: false, review_on: null }
                            : { later: true }
                    )
                }
                className={chip(parked)}
            >
                {t('review.actions.later', 'Later')}
            </button>
            {(parked || task.review_on) && (
                <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('review.reviewOnLabel', 'Review on')}
                    <input
                        type="date"
                        value={task.review_on || ''}
                        disabled={saving}
                        onChange={(e) =>
                            void save({ review_on: e.target.value || null })
                        }
                        className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    />
                </label>
            )}
        </div>
    );
};

// Whether a stored week start is in the current week (7 days from it).
export const isCurrentWeek = (weekOf: string | null | undefined): boolean => {
    if (!weekOf) return false;
    const start = new Date(`${weekOf}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const now = new Date();
    return now >= start && now < end;
};

export default TaskDecisionRow;
