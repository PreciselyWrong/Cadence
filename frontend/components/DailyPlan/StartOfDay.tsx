import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SunIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import {
    DailyPlanItem,
    PlanCandidates,
    fetchDailyPlan,
} from '../../utils/dailyPlanService';
import { decideTask } from '../../utils/reviewService';
import { useToast } from '../Shared/ToastContext';
import CapacityMeter from './CapacityMeter';
import { leftoversOf, orderedCandidates } from './autoPlace';
import { formatDuration } from './planUtils';

const STEPS = 3;
const PICK_LIMIT = 8;

interface StartOfDayProps {
    yesterday: string;
    todayItems: DailyPlanItem[];
    candidates: PlanCandidates;
    planned: number;
    free: number;
    // "Place all" is only offered while the day is shown as a timeline.
    canPlaceAll: boolean;
    onAdd: (task: Task) => void;
    onPlaceAll: () => void;
    // `finished` is false when the guide is dismissed before the last step.
    onClose: (finished: boolean) => void;
}

const buttonClass =
    'min-h-[34px] rounded-lg px-3 text-sm font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';

// Optional start-of-day guide: yesterday's leftovers, what to pick, then a
// capacity check. Every step can be skipped and the whole guide dismissed.
const StartOfDay: React.FC<StartOfDayProps> = ({
    yesterday,
    todayItems,
    candidates,
    planned,
    free,
    canPlaceAll,
    onAdd,
    onPlaceAll,
    onClose,
}) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const [step, setStep] = useState(1);
    const [yesterdayItems, setYesterdayItems] = useState<
        DailyPlanItem[] | null
    >(null);
    const [handled, setHandled] = useState<Set<string>>(new Set());

    useEffect(() => {
        let cancelled = false;
        fetchDailyPlan(yesterday)
            .then((response) => {
                if (!cancelled) setYesterdayItems(response.plan?.items ?? []);
            })
            .catch(() => {
                if (!cancelled) setYesterdayItems([]);
            });
        return () => {
            cancelled = true;
        };
    }, [yesterday]);

    const leftovers = useMemo(
        () =>
            leftoversOf(yesterdayItems ?? [], todayItems).filter(
                (item) => !handled.has(item.task_uid)
            ),
        [yesterdayItems, todayItems, handled]
    );

    const plannedUids = new Set(todayItems.map((item) => item.task_uid));
    const picks = orderedCandidates(candidates)
        .filter((entry) => !plannedUids.has(entry.task.uid as string))
        .slice(0, PICK_LIMIT);

    const markHandled = (uid: string) =>
        setHandled((current) => new Set(current).add(uid));

    const decide = async (
        uid: string,
        decision: { later?: boolean; status?: string }
    ) => {
        try {
            await decideTask(uid, { ...decision, reviewed: true });
            markHandled(uid);
        } catch {
            showErrorToast(
                t('review.saveError', 'Could not save the decision.')
            );
        }
    };

    const last = step === STEPS;

    return (
        <section
            className="flex flex-col gap-3 rounded-2xl border border-amber-300/60 bg-amber-50/60 px-5 py-4 dark:border-amber-500/30 dark:bg-amber-900/10"
            data-testid="start-of-day"
            aria-label={t('dailyPlan.guidedTitle', 'Start your day')}
        >
            <div className="flex items-center gap-2">
                <SunIcon className="h-5 w-5 text-amber-700 dark:text-amber-300" />
                <p className="flex-1 text-xs font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                    {t('dailyPlan.guidedTitle', 'Start your day')} ·{' '}
                    {t('dailyPlan.guidedStep', 'Step {{step}} of {{total}}', {
                        step,
                        total: STEPS,
                    })}
                </p>
                <button
                    type="button"
                    onClick={() => onClose(false)}
                    aria-label={t('dailyPlan.guidedSkip', 'Not now')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-800"
                    data-testid="start-of-day-dismiss"
                >
                    <XMarkIcon className="h-4 w-4" />
                </button>
            </div>

            {step === 1 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-base text-gray-900 dark:text-gray-100">
                        {t(
                            'dailyPlan.guidedLeftovers',
                            "Yesterday's leftovers"
                        )}
                    </h3>
                    {yesterdayItems === null ? (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {t('common.loading', 'Loading...')}
                        </p>
                    ) : leftovers.length === 0 ? (
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            {t(
                                'dailyPlan.guidedNoLeftovers',
                                'Nothing left over from yesterday.'
                            )}
                        </p>
                    ) : (
                        <ul className="flex flex-col divide-y divide-amber-200/60 dark:divide-amber-500/20">
                            {leftovers.map((item) => (
                                <li
                                    key={item.task_uid}
                                    className="flex flex-wrap items-center gap-2 py-2"
                                    data-testid="leftover-row"
                                >
                                    <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-gray-100">
                                        {item.task.name}
                                    </span>
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        onClick={() => {
                                            onAdd(item.task);
                                            markHandled(item.task_uid);
                                        }}
                                        data-testid="leftover-carry"
                                    >
                                        {t(
                                            'dailyPlan.guidedCarry',
                                            'Carry to today'
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        onClick={() =>
                                            void decide(item.task_uid, {
                                                later: true,
                                            })
                                        }
                                        data-testid="leftover-later"
                                    >
                                        {t('review.actions.later', 'Later')}
                                    </button>
                                    <button
                                        type="button"
                                        className={`${buttonClass} text-red-700 dark:text-red-400`}
                                        onClick={() =>
                                            void decide(item.task_uid, {
                                                status: 'cancelled',
                                            })
                                        }
                                        data-testid="leftover-drop"
                                    >
                                        {t('dailyPlan.guidedDrop', 'Drop')}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {step === 2 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-base text-gray-900 dark:text-gray-100">
                        {t('dailyPlan.guidedPick', 'Pick what to do today')}
                    </h3>
                    {picks.length === 0 ? (
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            {t(
                                'dailyPlan.guidedNoPicks',
                                'Nothing left to pick.'
                            )}
                        </p>
                    ) : (
                        <ul className="flex flex-col divide-y divide-amber-200/60 dark:divide-amber-500/20">
                            {picks.map(({ task }) => (
                                <li
                                    key={task.uid}
                                    className="flex items-center gap-2 py-2"
                                >
                                    <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-gray-100">
                                        {task.name}
                                    </span>
                                    {task.estimated_minutes ? (
                                        <span className="text-xs text-gray-600 dark:text-gray-400">
                                            {formatDuration(
                                                task.estimated_minutes
                                            )}
                                        </span>
                                    ) : null}
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        onClick={() => onAdd(task)}
                                        data-testid="pick-add"
                                    >
                                        {t('dailyPlan.guidedAdd', 'Add')}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {step === 3 && (
                <div className="flex flex-col gap-3">
                    <h3 className="text-base text-gray-900 dark:text-gray-100">
                        {t('dailyPlan.guidedCapacity', 'Does it fit?')}
                    </h3>
                    <CapacityMeter planned={planned} free={free} />
                    {canPlaceAll && (
                        <div>
                            <button
                                type="button"
                                onClick={onPlaceAll}
                                className="min-h-[36px] rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
                                data-testid="guided-place-all"
                            >
                                {t('dailyPlan.placeAll', 'Place all')}
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
                <button
                    type="button"
                    className={buttonClass}
                    onClick={() => setStep((s) => Math.max(1, s - 1))}
                    disabled={step === 1}
                >
                    {t('dailyPlan.guidedBack', 'Back')}
                </button>
                <button
                    type="button"
                    className="min-h-[34px] rounded-lg bg-amber-700 px-4 text-sm font-medium text-white hover:bg-amber-800"
                    onClick={() =>
                        last ? onClose(true) : setStep((s) => s + 1)
                    }
                    data-testid="start-of-day-next"
                >
                    {last
                        ? t('dailyPlan.guidedDone', 'Done')
                        : t('dailyPlan.guidedNext', 'Next')}
                </button>
            </div>
        </section>
    );
};

export default StartOfDay;
