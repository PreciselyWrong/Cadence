import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    CheckIcon,
    ChevronDownIcon,
    FireIcon,
} from '@heroicons/react/24/outline';
import FacetGauge from '../Shared/ui/FacetGauge';
import HabitQuickEntry from './HabitQuickEntry';
import { statusLine } from './habitStatus';
import type {
    CadenceHabit,
    CadenceQuickValue,
} from '../../utils/cadenceHabitsService';
import {
    accentHex,
    argbToHex,
    formatWithUnit,
    habitCardColors,
    kindOf,
    unitOfGoal,
} from '../../utils/cadenceHabitUtils';

interface HabitCardProps {
    habit: CadenceHabit;
    quickValues: CadenceQuickValue[];
    onLog: (
        habit: CadenceHabit,
        amountMinor: number,
        note?: string
    ) => Promise<void>;
}

export const habitTint = (habit: Pick<CadenceHabit, 'color_argb'>) =>
    argbToHex(habit.color_argb) ?? accentHex();

// One habit: a card of 80 px at least, tinted with the habit's colour, its
// facet filling with the period's progress, and the quick action on the right
// (Android HabitRow). The name is the link to the habit; the action buttons
// sit above it so the card stays one tab stop per control.
const HabitCard: React.FC<HabitCardProps> = ({ habit, quickValues, onLog }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const goal = habit.goal;
    const evaluation = habit.status.evaluation;
    const kind = goal ? kindOf(goal) : 'goal';
    const paused = !!evaluation?.is_paused;
    const done =
        kind === 'goal' && !!evaluation?.is_completed && !habit.archived;
    const calm = done || habit.archived;
    const tint = habitTint(habit);
    const colors = useMemo(() => habitCardColors(tint), [tint]);

    const ratio =
        kind === 'goal' || kind === 'limit'
            ? Math.min(
                  1,
                  (evaluation?.progress_minor ?? 0) /
                      (evaluation?.target_minor || 1)
              )
            : 0;
    const streak = habit.status.streak?.current ?? 0;

    const log = async (amountMinor: number, note?: string) => {
        setBusy(true);
        try {
            await onLog(habit, amountMinor, note);
        } finally {
            setBusy(false);
        }
    };

    const firstQuick = quickValues[0];
    const oneUnit = goal ? (unitOfGoal(goal)?.scale ?? 1) : 1;
    const primaryAmount = firstQuick?.amount_minor ?? oneUnit;
    const showEntryPanel =
        !!goal &&
        !paused &&
        !habit.archived &&
        goal.goal_type !== 'BINARY' &&
        kind !== 'abstinence';

    const pillClass =
        'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full px-4 text-label transition-transform duration-[220ms] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 disabled:opacity-60';
    const pillStyle = calm ? undefined : { background: colors.pillFill };

    let action: React.ReactNode = null;
    if (goal && !paused && !habit.archived) {
        if (done) {
            action = (
                <span
                    role="img"
                    aria-label={t('cadenceHabits.status.done', 'Done')}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-success-container text-success"
                >
                    <CheckIcon className="h-5 w-5" aria-hidden="true" />
                </span>
            );
        } else if (kind === 'abstinence') {
            action = (
                <button
                    type="button"
                    disabled={busy}
                    style={pillStyle}
                    className={pillClass}
                    onClick={() => log(1)}
                    aria-label={t(
                        'cadenceHabits.abstinence.recordFor',
                        'Record a slip for {{name}}',
                        { name: habit.name }
                    )}
                >
                    {t('cadenceHabits.abstinence.record', 'Slip')}
                </button>
            );
        } else if (goal.goal_type === 'BINARY') {
            action = (
                <button
                    type="button"
                    disabled={busy}
                    style={pillStyle}
                    className={`${pillClass} !px-0 w-11`}
                    onClick={() => log(1)}
                    aria-label={t(
                        'cadenceHabits.quick.doneFor',
                        'Mark {{name}} as done',
                        { name: habit.name }
                    )}
                >
                    <CheckIcon className="h-5 w-5" aria-hidden="true" />
                </button>
            );
        } else {
            const label = `+${formatWithUnit(primaryAmount, goal)}`;
            action = (
                <button
                    type="button"
                    disabled={busy}
                    style={pillStyle}
                    className={pillClass}
                    onClick={() => log(primaryAmount)}
                    aria-label={t(
                        'cadenceHabits.quick.addFor',
                        'Add {{amount}} to {{name}}',
                        { amount: label.slice(1), name: habit.name }
                    )}
                >
                    {label}
                </button>
            );
        }
    }

    return (
        <article
            data-testid="habit-card"
            className={`relative overflow-hidden rounded-card border border-outline/35 ${
                calm ? 'bg-surface-card text-surface-on' : ''
            }`}
            style={
                calm
                    ? undefined
                    : {
                          backgroundImage: `linear-gradient(90deg, ${colors.stops.join(', ')})`,
                          color: colors.ink,
                      }
            }
        >
            <div className="flex min-h-[80px] items-center gap-4 px-4">
                <FacetGauge
                    progress={ratio}
                    tint={calm ? 'rgb(var(--color-outline))' : colors.ink}
                    size={44}
                    className="opacity-95"
                >
                    <span className="text-label" aria-hidden="true">
                        {habit.name.trim().charAt(0).toUpperCase()}
                    </span>
                </FacetGauge>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-title-m">
                        <Link
                            to={`/habit/${habit.uid}`}
                            className="after:absolute after:inset-0 focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-current"
                        >
                            {habit.name}
                        </Link>
                    </h3>
                    <p
                        className={`flex flex-wrap items-center gap-x-2 text-body-m ${
                            calm ? 'text-surface-on-variant' : ''
                        }`}
                    >
                        <span className="min-w-0 break-words">
                            {statusLine(t, habit)}
                        </span>
                        {streak > 0 && (
                            <span
                                className="flex shrink-0 items-center gap-0.5"
                                title={t(
                                    'cadenceHabits.streak.current',
                                    '{{count}} periods in a row',
                                    { count: streak }
                                )}
                            >
                                <FireIcon
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                />
                                <span aria-hidden="true">{streak}</span>
                                <span className="sr-only">
                                    {t(
                                        'cadenceHabits.streak.current',
                                        '{{count}} periods in a row',
                                        { count: streak }
                                    )}
                                </span>
                            </span>
                        )}
                    </p>
                </div>
                <div className="relative z-10 flex shrink-0 items-center gap-1">
                    {action}
                    {showEntryPanel && (
                        <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={`quick-${habit.uid}`}
                            aria-label={t(
                                'cadenceHabits.quick.more',
                                'More amounts for {{name}}',
                                { name: habit.name }
                            )}
                            onClick={() => setOpen((v) => !v)}
                            className="flex h-11 w-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2"
                        >
                            <ChevronDownIcon
                                className={`h-5 w-5 transition-transform duration-[220ms] motion-reduce:transition-none ${
                                    open ? 'rotate-180' : ''
                                }`}
                                aria-hidden="true"
                            />
                        </button>
                    )}
                </div>
            </div>
            {open && showEntryPanel && goal && (
                <HabitQuickEntry
                    id={`quick-${habit.uid}`}
                    goal={goal}
                    quickValues={quickValues}
                    onLog={log}
                />
            )}
        </article>
    );
};

export default HabitCard;
