import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckIcon } from '@heroicons/react/24/outline';
import type { CadenceHabit } from '../../utils/cadenceHabitsService';
import { argbToHex, formatWithUnit } from '../../utils/cadenceHabitUtils';
import { formatMinute } from '../DailyPlan/planUtils';

interface HabitLineProps {
    habit: CadenceHabit;
    // What one tap logs (dayHabits.oneTapAmount).
    amount: number;
    done: boolean;
    // Its time of day, when it has one.
    minute?: number | null;
    onLog(habit: CadenceHabit, amountMinor: number): Promise<void>;
}

/**
 * One habit of the day on Today: one tap checks a yes/no habit or adds one
 * step (« +1 verre ») to a quantity, like the Habits page card; the name
 * opens the habit.
 */
const HabitLine: React.FC<HabitLineProps> = ({
    habit,
    amount,
    done,
    minute = null,
    onLog,
}) => {
    const { t } = useTranslation();
    const [busy, setBusy] = useState(false);
    const goal = habit.goal;
    const binary = !goal || goal.goal_type === 'BINARY';
    const evaluation = habit.status.evaluation;
    const tint = argbToHex(habit.color_argb);
    const progress =
        !binary && goal && evaluation
            ? `${formatWithUnit(evaluation.progress_minor, goal)} / ${formatWithUnit(evaluation.target_minor, goal)}`
            : null;
    const log = async () => {
        setBusy(true);
        try {
            await onLog(habit, amount);
        } finally {
            setBusy(false);
        }
    };
    const tapLabel = binary
        ? t('cadenceHabits.quick.doneFor', 'Mark {{name}} as done', {
              name: habit.name,
          })
        : t('cadenceHabits.quick.addFor', 'Add {{amount}} to {{name}}', {
              amount: goal ? formatWithUnit(amount, goal) : amount,
              name: habit.name,
          });

    return (
        <div
            role="listitem"
            data-testid="today-habit"
            data-habit={habit.uid}
            className="grid grid-cols-[52px_auto_minmax(0,1fr)] items-center gap-x-3 rounded-xl px-2 py-1.5 hover:bg-surface-high/60"
        >
            <span className="text-right text-xs tabular-nums text-surface-on-variant">
                {minute !== null ? formatMinute(minute) : ''}
            </span>
            {done ? (
                <span
                    role="img"
                    aria-label={t('cadenceHabits.status.done', 'Done')}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-success-container text-success"
                >
                    <CheckIcon className="h-4 w-4" aria-hidden="true" />
                </span>
            ) : binary ? (
                <button
                    type="button"
                    disabled={busy}
                    onClick={log}
                    aria-label={tapLabel}
                    title={tapLabel}
                    className="h-6 w-6 rounded-full border-2 transition-colors hover:bg-surface-high disabled:opacity-50"
                    style={{ borderColor: tint ?? undefined }}
                />
            ) : (
                <button
                    type="button"
                    disabled={busy}
                    onClick={log}
                    aria-label={tapLabel}
                    title={tapLabel}
                    className="inline-flex h-6 items-center rounded-full bg-surface-high px-2 text-xs font-medium text-surface-on hover:bg-surface-highest disabled:opacity-50"
                >
                    +{goal ? formatWithUnit(amount, goal) : amount}
                </button>
            )}
            <Link
                to={`/habit/${habit.uid}`}
                className="min-w-0 truncate text-body leading-6"
            >
                <span
                    className={
                        done
                            ? 'text-surface-on-variant line-through'
                            : 'text-surface-on'
                    }
                >
                    {habit.name}
                </span>
                {progress && (
                    <span className="ml-2 text-xs tabular-nums text-surface-on-variant">
                        {progress}
                    </span>
                )}
            </Link>
        </div>
    );
};

export default HabitLine;

interface DayHabitsSectionProps {
    open: CadenceHabit[];
    done: CadenceHabit[];
    hideCompleted: boolean;
    minuteOf(uid: string): number | null;
    amountOf(habit: CadenceHabit): number;
    onLog(habit: CadenceHabit, amountMinor: number): Promise<void>;
}

/** The habits of the day: the open ones, then the done ones collapsed. */
export const DayHabitsSection: React.FC<DayHabitsSectionProps> = ({
    open,
    done,
    hideCompleted,
    minuteOf,
    amountOf,
    onLog,
}) => {
    const { t } = useTranslation();
    const [showDone, setShowDone] = useState(false);
    const line = (habit: CadenceHabit, isDone: boolean) => (
        <HabitLine
            key={habit.uid}
            habit={habit}
            amount={amountOf(habit)}
            done={isDone}
            minute={minuteOf(habit.uid)}
            onLog={onLog}
        />
    );
    return (
        <div role="list" data-testid="today-habits">
            {open.map((habit) => line(habit, false))}
            {!hideCompleted && done.length > 0 && (
                <>
                    <button
                        type="button"
                        aria-expanded={showDone}
                        onClick={() => setShowDone((value) => !value)}
                        className="ml-[76px] flex h-7 items-center text-xs font-medium text-surface-on-variant hover:text-surface-on"
                    >
                        {t('today.habitsDone', 'Done · {{n}}', {
                            n: done.length,
                        })}
                    </button>
                    {showDone && done.map((habit) => line(habit, true))}
                </>
            )}
        </div>
    );
};
