import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoonIcon, SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';
import {
    AiWrapUp,
    DailyPlanItem,
    carryOverTasks,
    wrapUpDayWithAi,
} from '../../utils/dailyPlanService';
import { useToast } from '../Shared/ToastContext';
import { formatDuration, isItemDone } from './planUtils';

interface WrapUpCardProps {
    date: string;
    items: DailyPlanItem[];
    wrapUp: AiWrapUp | null;
    // The AI recap is optional: without it the card still closes the day
    // from the plan alone.
    aiEnabled: boolean;
    onGenerated: (wrapUp: AiWrapUp) => void;
    onClose?: () => void;
}

const nextDate = (date: string) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface CarryEntry {
    task_uid: string;
    name: string;
    reason?: string;
}

const WrapUpCard: React.FC<WrapUpCardProps> = ({
    date,
    items,
    wrapUp,
    aiEnabled,
    onGenerated,
    onClose,
}) => {
    const { t } = useTranslation();
    const { showErrorToast, showSuccessToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [carrying, setCarrying] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // The AI picks what is worth carrying over; without it every unfinished
    // task is offered.
    const carryList = useMemo<CarryEntry[]>(
        () =>
            wrapUp
                ? wrapUp.carry_over.map((c) => ({
                      task_uid: c.task_uid,
                      name: c.name ?? c.task_uid,
                      reason: c.reason,
                  }))
                : items
                      .filter((item) => !isItemDone(item))
                      .map((item) => ({
                          task_uid: item.task_uid,
                          name: item.task.name,
                      })),
        [wrapUp, items]
    );

    useEffect(() => {
        setSelected(new Set(carryList.map((c) => c.task_uid)));
    }, [carryList]);

    const done = items.filter(isItemDone);
    const doneMinutes = done.reduce((sum, i) => sum + i.duration_minutes, 0);

    const generate = async () => {
        setLoading(true);
        try {
            const result = await wrapUpDayWithAi(date);
            onGenerated(result.wrap_up);
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t(
                          'dailyPlan.ai.wrapUpError',
                          'Could not wrap up the day.'
                      )
            );
        } finally {
            setLoading(false);
        }
    };

    const carryOver = async () => {
        if (selected.size === 0) return;
        setCarrying(true);
        try {
            await carryOverTasks(nextDate(date), [...selected]);
            showSuccessToast(
                t('dailyPlan.ai.carried', '{{count}} tasks added to tomorrow', {
                    count: selected.size,
                })
            );
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t('dailyPlan.saveError', 'Could not save the plan.')
            );
        } finally {
            setCarrying(false);
        }
    };

    return (
        <section
            className="flex flex-col gap-3 rounded-2xl bg-violet-50 px-5 py-4 dark:bg-violet-900/20"
            data-testid="wrap-up-card"
        >
            <div className="flex items-center gap-2">
                <MoonIcon className="h-5 w-5 text-violet-700 dark:text-violet-300" />
                <p className="flex-1 text-xs font-semibold uppercase tracking-wider text-violet-800 dark:text-violet-300">
                    {t('dailyPlan.endDay', 'Wrap up the day')}
                </p>
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('common.close', 'Close')}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-800"
                        data-testid="wrap-up-close"
                    >
                        <XMarkIcon className="h-4 w-4" />
                    </button>
                )}
            </div>

            <p className="text-[15px] text-gray-900 dark:text-gray-100">
                {t('dailyPlan.progress', '{{done}} of {{total}} done', {
                    done: done.length,
                    total: items.length,
                })}
                {doneMinutes > 0 && ` · ${formatDuration(doneMinutes)}`}
            </p>

            {wrapUp && (
                <>
                    <p className="text-[15px] text-gray-900 dark:text-gray-100">
                        {wrapUp.summary}
                    </p>
                    {wrapUp.wins.length > 0 && (
                        <ul className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
                            {wrapUp.wins.map((win) => (
                                <li key={win}>✓ {win}</li>
                            ))}
                        </ul>
                    )}
                    {wrapUp.pattern && (
                        <p className="text-sm italic text-gray-600 dark:text-gray-400">
                            {wrapUp.pattern}
                        </p>
                    )}
                </>
            )}

            {carryList.length > 0 && (
                <div className="flex flex-col gap-2 pt-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {t('dailyPlan.ai.carryTitle', 'Carry over to tomorrow')}
                    </p>
                    {carryList.map((entry) => (
                        <label
                            key={entry.task_uid}
                            className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200"
                        >
                            <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={selected.has(entry.task_uid)}
                                onChange={(e) =>
                                    setSelected((current) => {
                                        const next = new Set(current);
                                        if (e.target.checked) {
                                            next.add(entry.task_uid);
                                        } else {
                                            next.delete(entry.task_uid);
                                        }
                                        return next;
                                    })
                                }
                            />
                            <span>
                                {entry.name}
                                {entry.reason && (
                                    <span className="text-gray-600 dark:text-gray-400">
                                        {' '}
                                        · {entry.reason}
                                    </span>
                                )}
                            </span>
                        </label>
                    ))}
                    <div>
                        <button
                            type="button"
                            onClick={carryOver}
                            disabled={carrying || selected.size === 0}
                            className="inline-flex min-h-[36px] items-center rounded-lg bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
                            data-testid="wrap-up-carry"
                        >
                            {t('dailyPlan.ai.addToTomorrow', 'Add to tomorrow')}
                        </button>
                    </div>
                </div>
            )}

            {carryList.length === 0 && done.length > 0 && (
                <p className="text-sm text-gray-700 dark:text-gray-300">
                    {t(
                        'dailyPlan.endDayClean',
                        'Nothing left over. Well done.'
                    )}
                </p>
            )}

            {aiEnabled && (
                <div>
                    <button
                        type="button"
                        onClick={generate}
                        disabled={loading}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-violet-800 hover:bg-white disabled:opacity-60 dark:text-violet-200 dark:hover:bg-gray-800"
                        data-testid="wrap-up-generate"
                    >
                        <SparklesIcon
                            className={`h-4 w-4 ${loading ? 'animate-pulse' : ''}`}
                        />
                        {loading
                            ? t('dailyPlan.ai.wrappingUp', 'Thinking…')
                            : wrapUp
                              ? t('dailyPlan.ai.regenerate', 'Regenerate')
                              : t('dailyPlan.ai.wrapUp', 'Wrap up my day')}
                    </button>
                </div>
            )}
        </section>
    );
};

export default WrapUpCard;
