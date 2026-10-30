import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import {
    decideTask,
    fetchReviewWeek,
    ReviewWeek,
    saveWeekCapacity,
    TaskDecision,
} from '../../utils/reviewService';
import { useToast } from '../Shared/ToastContext';
import { formatDuration } from '../DailyPlan/planUtils';
import DecisionMenu from './DecisionMenu';
import ThisOrThat from './ThisOrThat';

interface WeekStepProps {
    onOpenTask: (uid: string) => void;
}

// The week: what was decided for it, what is in view, and planned time
// against the time the user says they have (estimates are never required).
const WeekStep: React.FC<WeekStepProps> = ({ onOpenTask }) => {
    const { t } = useTranslation();
    const { showErrorToast, showSuccessToast } = useToast();
    const [week, setWeek] = useState<ReviewWeek | null>(null);
    const [editingCapacity, setEditingCapacity] = useState(false);
    const [hours, setHours] = useState('');
    const [choosing, setChoosing] = useState(false);

    const load = useCallback(() => {
        fetchReviewWeek()
            .then(setWeek)
            .catch(() =>
                showErrorToast(
                    t('review.loadError', 'Could not load the review.')
                )
            );
    }, [showErrorToast, t]);

    useEffect(load, [load]);

    const decide = async (task: Task, decision: TaskDecision) => {
        try {
            await decideTask(task.uid as string, decision);
            load();
        } catch {
            showErrorToast(
                t('review.saveError', 'Could not save the decision.')
            );
        }
    };

    const saveCapacity = async () => {
        const value = hours.trim() === '' ? null : Number(hours);
        if (value !== null && (Number.isNaN(value) || value < 0)) return;
        try {
            await saveWeekCapacity(
                value === null ? null : Math.round(value * 60)
            );
            setEditingCapacity(false);
            load();
        } catch {
            showErrorToast(
                t('review.saveError', 'Could not save the decision.')
            );
        }
    };

    if (!week) return null;

    const planned = formatDuration(week.planned_minutes);
    const capacityText =
        week.capacity_minutes !== null
            ? t(
                  'review.week.capacity',
                  '{{planned}} planned / {{capacity}} available',
                  {
                      planned,
                      capacity: formatDuration(week.capacity_minutes),
                  }
              )
            : t('review.week.planned', '{{planned}} planned', { planned });
    const over =
        week.capacity_minutes !== null &&
        week.planned_minutes > week.capacity_minutes;
    const choices = [...week.committed, ...week.in_view];

    const list = (
        tasks: Task[],
        empty: string,
        options: (
            task: Task
        ) => { key: string; label: string; run: () => void }[]
    ) =>
        tasks.length === 0 ? (
            <p className="py-3 text-sm text-gray-600 dark:text-gray-300">
                {empty}
            </p>
        ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {tasks.map((task) => (
                    <li
                        key={task.uid}
                        className="flex items-start gap-3 py-2.5"
                    >
                        <button
                            type="button"
                            onClick={() => onOpenTask(task.uid as string)}
                            className="min-w-0 flex-1 text-left"
                        >
                            <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                                {task.original_name || task.name}
                            </span>
                            <span className="block truncate text-xs text-gray-600 dark:text-gray-300">
                                {[
                                    task.Project?.name,
                                    task.estimated_minutes
                                        ? formatDuration(task.estimated_minutes)
                                        : null,
                                ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </span>
                        </button>
                        <DecisionMenu options={options(task)} />
                    </li>
                ))}
            </ul>
        );

    const sectionTitle =
        'mt-6 mb-1 text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300';

    return (
        <section>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span
                    className={
                        over
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-gray-700 dark:text-gray-300'
                    }
                >
                    {capacityText}
                </span>
                {week.unestimated > 0 && (
                    <span className="text-xs text-gray-500">
                        {t(
                            'review.week.unestimated',
                            '{{count}} without estimate',
                            {
                                count: week.unestimated,
                            }
                        )}
                    </span>
                )}
                {editingCapacity ? (
                    <span className="flex items-center gap-1">
                        <input
                            type="number"
                            min={0}
                            step={0.5}
                            autoFocus
                            aria-label={t(
                                'review.week.capacityPrompt',
                                'Hours available this week'
                            )}
                            value={hours}
                            onChange={(e) => setHours(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void saveCapacity();
                                if (e.key === 'Escape')
                                    setEditingCapacity(false);
                            }}
                            onBlur={() => void saveCapacity()}
                            className="w-20 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                        />
                        <span className="text-xs text-gray-500">h</span>
                    </span>
                ) : (
                    <button
                        type="button"
                        onClick={() => {
                            setHours(
                                week.capacity_minutes !== null
                                    ? String(week.capacity_minutes / 60)
                                    : ''
                            );
                            setEditingCapacity(true);
                        }}
                        className="text-xs text-gray-600 underline-offset-2 hover:underline dark:text-gray-300"
                    >
                        {t('review.week.setCapacity', 'Set available time')}
                    </button>
                )}
                {choices.length >= 2 && (
                    <button
                        type="button"
                        onClick={() => setChoosing(true)}
                        className="ml-auto text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                        {t('review.week.choose', 'Help me choose')}
                    </button>
                )}
            </div>

            <h3 className={sectionTitle}>
                {t('review.week.committed', 'Decided this week')}
            </h3>
            {list(
                week.committed,
                t(
                    'review.week.emptyCommitted',
                    'Nothing decided for this week yet.'
                ),
                (task) => [
                    {
                        key: 'today',
                        label: t('review.actions.today', 'Do today'),
                        run: () => void decide(task, { today: true }),
                    },
                    {
                        key: 'notWeek',
                        label: t('review.actions.removeWeek', 'Not this week'),
                        run: () => void decide(task, { week_of: null }),
                    },
                    {
                        key: 'later',
                        label: t('review.actions.later', 'Later'),
                        run: () => void decide(task, { later: true }),
                    },
                ]
            )}

            <h3 className={sectionTitle}>
                {t('review.week.inView', 'In view')}
            </h3>
            {list(
                week.in_view,
                t(
                    'review.week.emptyInView',
                    'Nothing in view. Put a task in view from its menu.'
                ),
                (task) => [
                    {
                        key: 'week',
                        label: t('review.actions.thisWeek', 'This week'),
                        run: () => void decide(task, { week_of: 'this_week' }),
                    },
                    {
                        key: 'out',
                        label: t('review.actions.outOfView', 'Out of view'),
                        run: () => void decide(task, { in_view: false }),
                    },
                    {
                        key: 'later',
                        label: t('review.actions.later', 'Later'),
                        run: () => void decide(task, { later: true }),
                    },
                ]
            )}

            {choosing && (
                <ThisOrThat
                    tasks={choices}
                    onClose={() => setChoosing(false)}
                    onChoose={(task) => {
                        setChoosing(false);
                        void decide(task, { today: true }).then(() =>
                            showSuccessToast(
                                t('review.addedToday', 'Added to today')
                            )
                        );
                    }}
                />
            )}
        </section>
    );
};

export default WeekStep;
