import React, { useEffect, useMemo, useState } from 'react';
import { Task } from '../../entities/Task';
import { FireIcon, BellIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import {
    fetchHabitCompletions,
    HabitCompletion,
} from '../../utils/habitsService';
import {
    dayFraction,
    formatHabitTarget,
    habitGoal,
    habitAccentStyle,
    isHabitCompletedInPeriod,
    isQuitHabit,
    isScheduledOn,
    periodNoun,
    toDayKey,
    totalsByDay,
} from '../../utils/habitUtils';
import HabitCheckIn from './HabitCheckIn';
import { ACCENT } from '../../constants/colorPalette';
import HabitFacet from './HabitFacet';
import HabitProgressBar from './HabitProgressBar';

interface HabitCardProps {
    habit: Task;
    onCheckIn: (habit: Task, options?: { value?: number }) => Promise<void>;
    onOpen: (habit: Task) => void;
}

const DAYS = 7;

const lastDays = (): Date[] => {
    const today = new Date();
    return Array.from({ length: DAYS }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (DAYS - 1 - i));
        return d;
    });
};

const HabitCard: React.FC<HabitCardProps> = ({ habit, onCheckIn, onOpen }) => {
    const { t } = useTranslation();
    const [completions, setCompletions] = useState<HabitCompletion[]>([]);
    const [loadingDots, setLoadingDots] = useState(true);
    const quit = isQuitHabit(habit);

    // Reload the strip whenever the server-side counters move.
    const version = `${habit.habit_total_completions}-${habit.habit_last_completion_at}-${habit.habit_progress?.skipped}`;
    useEffect(() => {
        if (!habit.uid) return;
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - (DAYS - 1));
        start.setHours(0, 0, 0, 0);
        fetchHabitCompletions(habit.uid, start, end)
            .then(setCompletions)
            .catch(() => {})
            .finally(() => setLoadingDots(false));
    }, [habit.uid, version]);

    const totals = useMemo(
        () => totalsByDay(habit, completions),
        [habit, completions]
    );
    const days = lastDays();
    const todayKey = toDayKey(new Date());
    const createdKey = habit.created_at
        ? toDayKey(new Date(habit.created_at))
        : '';
    const done = isHabitCompletedInPeriod(habit);
    const streak = habit.habit_current_streak ?? 0;

    const scheduledCount = days.filter((d) => isScheduledOn(habit, d)).length;
    const doneCount = days.filter(
        (d) => dayFraction(habit, totals.get(toDayKey(d))) >= 1
    ).length;

    const dotClass = (date: Date) => {
        const key = toDayKey(date);
        const dayTotals = totals.get(key);
        if (loadingDots) return 'bg-gray-100 dark:bg-gray-700 animate-pulse';
        if (quit) {
            if (dayTotals && dayTotals.checkIns > 0) {
                return 'bg-red-400 dark:bg-red-500';
            }
            return key >= createdKey
                ? ACCENT.bg
                : 'bg-gray-100 dark:bg-gray-600/50';
        }
        if (dayTotals?.skipped && dayTotals.checkIns === 0) {
            return 'bg-sky-200 dark:bg-sky-800';
        }
        if (!isScheduledOn(habit, date)) {
            return 'bg-gray-50 dark:bg-gray-800';
        }
        return dayFraction(habit, dayTotals) > 0
            ? ACCENT.bg
            : 'bg-gray-100 dark:bg-gray-600/50';
    };

    const dotOpacity = (date: Date) => {
        if (loadingDots) return 1;
        if (quit) {
            const slipped = (totals.get(toDayKey(date))?.checkIns ?? 0) > 0;
            return slipped || toDayKey(date) < createdKey ? 1 : 0.55;
        }
        const fraction = dayFraction(habit, totals.get(toDayKey(date)));
        return fraction > 0 ? 0.35 + fraction * 0.65 : 1;
    };

    const goal = habitGoal(habit);
    const fraction = quit
        ? streak > 0
            ? 1
            : 0
        : Math.min(1, (habit.habit_progress?.progress ?? 0) / goal);

    return (
        <div
            className={`rounded-[20px] ring-1 ring-gray-900/[0.06] dark:ring-white/10 flex flex-col overflow-hidden cursor-pointer active:scale-[0.99] transition-transform ${
                done
                    ? 'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent-light)_26%,white),color-mix(in_srgb,var(--accent-light)_12%,white))] dark:bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent-dark)_34%,#1f1e2a),color-mix(in_srgb,var(--accent-dark)_14%,#1f1e2a))]'
                    : 'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent-light)_14%,white),color-mix(in_srgb,var(--accent-light)_5%,white)_65%,white)] dark:bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent-dark)_22%,#1f1e2a),color-mix(in_srgb,var(--accent-dark)_8%,#1f1e2a)_65%,#1f1e2a)]'
            }`}
            onClick={() => onOpen(habit)}
            style={habitAccentStyle(habit)}
            data-testid="habit-card"
        >
            <div className="px-4 pt-4 pb-2 flex items-center gap-3">
                <HabitFacet fraction={fraction} done={done} />
                <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold leading-snug break-words text-gray-900 dark:text-gray-50">
                        {habit.name}
                    </h3>
                    <p className="flex items-center gap-1.5 text-[13px] mt-0.5 text-gray-600 dark:text-gray-300">
                        {quit && (
                            <span className="px-1.5 py-px rounded-md bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-300 text-xs font-medium">
                                {t('habits.quit', 'Quit')}
                            </span>
                        )}
                        <span className="truncate">
                            {formatHabitTarget(t, habit)}
                        </span>
                        {habit.habit_reminder_time && (
                            <span className="flex items-center gap-0.5 shrink-0">
                                <BellIcon className="h-3.5 w-3.5" />
                                {habit.habit_reminder_time}
                            </span>
                        )}
                    </p>
                </div>
                <HabitCheckIn
                    habit={habit}
                    onCheckIn={(options) => onCheckIn(habit, options)}
                />
            </div>

            {!quit && habit.habit_progress && (
                <div className="px-4 pb-2">
                    <HabitProgressBar habit={habit} />
                </div>
            )}

            <div className="px-4 pb-3 flex items-center gap-3">
                <div className="flex gap-1" aria-hidden="true">
                    {days.map((date) => {
                        const key = toDayKey(date);
                        return (
                            <div
                                key={key}
                                title={date.toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                })}
                                className={`h-3 w-3 rounded-[4px] transition-colors ${dotClass(date)} ${
                                    key === todayKey
                                        ? 'outline outline-1 outline-offset-1 outline-gray-400 dark:outline-gray-500'
                                        : ''
                                }`}
                                style={{ opacity: dotOpacity(date) }}
                            />
                        );
                    })}
                </div>
                <p className="flex-1 min-w-0 flex items-center justify-end gap-2 text-xs text-gray-600 dark:text-gray-300 tabular-nums">
                    {!quit && scheduledCount > 0 && (
                        <span>
                            {doneCount}/{scheduledCount}
                        </span>
                    )}
                    <span className="flex items-center gap-0.5">
                        <FireIcon className={`h-3.5 w-3.5 ${ACCENT.text}`} />
                        {quit
                            ? t(
                                  'habits.stats.cleanFor',
                                  '{{count}} {{unit}} clean',
                                  {
                                      count: streak,
                                      unit: periodNoun(t, habit, streak),
                                  }
                              )
                            : `${streak} ${periodNoun(t, habit, streak)}`}
                    </span>
                    <span>{Math.round(habit.habit_strength ?? 0)}%</span>
                </p>
            </div>
        </div>
    );
};

export default HabitCard;
