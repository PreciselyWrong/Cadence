import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Location } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckIcon, FireIcon, PauseIcon } from '@heroicons/react/24/outline';
import FacetGauge from '../Shared/ui/FacetGauge';
import { useOptionalToast } from '../Shared/ToastContext';
import {
    CadenceEntry,
    CadenceGroup,
    CadenceHabit,
    CadenceHabitError,
    createRow,
    deleteRow,
    fetchCadenceGroups,
    fetchCadenceHabits,
    onHabitsChanged,
} from '../../utils/cadenceHabitsService';
import {
    accentHex,
    argbToHex,
    formatMinor,
    formatWithUnit,
    groupHabits,
    kindOf,
} from '../../utils/cadenceHabitUtils';
import { statusLine, withEntry } from '../Habits/habitStatus';
import {
    PANEL_FOCUS,
    PanelEmpty,
    PanelGroup,
    PanelHeader,
    panelRowClass,
} from './sidebarPanelParts';

interface SidebarHabitsPanelProps {
    handleNavClick: (path: string, title: string, icon: JSX.Element) => void;
    location: Location;
    openNewHabit: () => void;
}

const clock = (minute: number) =>
    `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const habitPath = (habit: CadenceHabit) => `/habit/${habit.uid}`;

// What one row shows on the right, in the shortest form of the habit page's
// status: a check for a yes/no habit, "1 / 3" for an amount, the streak.
function rowState(habit: CadenceHabit) {
    const goal = habit.goal;
    const evaluation = habit.status.evaluation;
    const kind = goal ? kindOf(goal) : 'goal';
    const paused = !!evaluation?.is_paused;
    const progress = evaluation?.progress_minor ?? 0;
    const target = evaluation?.target_minor ?? 0;
    const done = kind === 'goal' && !!evaluation?.is_completed;
    const planned = !!evaluation?.is_planned || progress > 0;
    let amount: string | null = null;
    if (goal && evaluation && !paused) {
        if (kind === 'tracker' && progress > 0) {
            amount = formatWithUnit(progress, goal);
        } else if (
            (kind === 'goal' && goal.goal_type !== 'BINARY') ||
            kind === 'limit'
        ) {
            amount = `${formatMinor(progress, goal)} / ${formatWithUnit(target, goal)}`;
        }
    }
    return {
        kind,
        paused,
        done,
        planned,
        amount: done ? null : amount,
        ratio:
            kind === 'goal' || kind === 'limit'
                ? Math.min(1, progress / (target || 1))
                : 0,
        canCheck:
            !!goal &&
            !!evaluation &&
            !paused &&
            !done &&
            kind === 'goal' &&
            goal.goal_type === 'BINARY',
        streak: habit.status.streak?.current ?? 0,
    };
}

// The habits panel of the minimal sidebar (route /habits and a habit's page):
// today's habits in the groups of the habits page, each with its state and,
// for a yes/no habit, a check that logs today.
const SidebarHabitsPanel: React.FC<SidebarHabitsPanelProps> = ({
    handleNavClick,
    location,
    openNewHabit,
}) => {
    const { t } = useTranslation();
    const toast = useOptionalToast();
    const [habits, setHabits] = useState<CadenceHabit[] | null>(null);
    const [groups, setGroups] = useState<CadenceGroup[]>([]);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState<Set<string>>(new Set());

    const load = useCallback(async () => {
        try {
            const [list, groupList] = await Promise.all([
                fetchCadenceHabits(),
                fetchCadenceGroups(),
            ]);
            setHabits(list.habits);
            setGroups(groupList);
            setFailed(false);
        } catch (error) {
            console.error('Failed to load the habits:', error);
            setFailed(true);
        }
    }, []);

    useEffect(() => {
        load();
        return onHabitsChanged(load);
    }, [load]);

    const sections = useMemo(
        () => (habits ? groupHabits(habits, groups) : []),
        [habits, groups]
    );

    const planned = (habits ?? []).filter(
        (habit) =>
            habit.goal &&
            kindOf(habit.goal) === 'goal' &&
            habit.status.evaluation?.is_planned &&
            !habit.status.evaluation.is_paused
    );
    const doneCount = planned.filter(
        (habit) => habit.status.evaluation?.validates_period
    ).length;

    const open = (path: string, title: string) =>
        handleNavClick(path, title, <FireIcon className="h-4 w-4 mr-2" />);

    // Shown at once; the write's change event reloads the true state, and a
    // failed save puts the row back.
    const check = async (habit: CadenceHabit) => {
        setBusy((current) => new Set(current).add(habit.uid));
        setHabits((current) =>
            (current ?? []).map((item) =>
                item.uid === habit.uid ? withEntry(item, 1) : item
            )
        );
        try {
            const entry = await createRow<CadenceEntry>(habit.uid, 'entries', {
                value_minor: 1,
                note: null,
            });
            toast?.showUndoToast(
                t('cadenceHabits.entry.logged', '{{name}} logged', {
                    name: habit.name,
                }),
                () => {
                    deleteRow(habit.uid, 'entries', entry.uid).catch(() =>
                        toast?.showErrorToast(
                            t(
                                'cadenceHabits.entry.undoFailed',
                                'Could not undo the entry.'
                            )
                        )
                    );
                }
            );
        } catch (error) {
            console.error('Failed to log an entry:', error);
            setHabits((current) =>
                (current ?? []).map((item) =>
                    item.uid === habit.uid ? habit : item
                )
            );
            toast?.showErrorToast(
                t(
                    'cadenceHabits.errors.saveEntry',
                    'Could not save the entry ({{code}}).',
                    {
                        code:
                            error instanceof CadenceHabitError
                                ? error.code
                                : 'network',
                    }
                )
            );
        } finally {
            setBusy((current) => {
                const next = new Set(current);
                next.delete(habit.uid);
                return next;
            });
        }
    };

    const title = t('sidebar.habits', 'Habits');
    const newLabel = t('cadenceHabits.new', 'New habit');

    return (
        <div className="flex flex-col" data-testid="sidebar-habits-panel">
            <PanelHeader
                icon={<FireIcon />}
                title={title}
                onOpen={() => open('/habits', title)}
                active={location.pathname === '/habits'}
                addLabel={newLabel}
                onAdd={openNewHabit}
                summary={
                    planned.length > 0
                        ? t(
                              'cadenceHabits.doneLine',
                              '{{done}} of {{total}} done for now',
                              { done: doneCount, total: planned.length }
                          )
                        : undefined
                }
            />

            {failed && (
                <div
                    role="alert"
                    className="mx-[2px] mb-2 flex items-center justify-between gap-2 rounded-[8px] bg-danger-container px-[10px] py-2 text-[13px] text-danger-on-container"
                >
                    <span className="min-w-0">
                        {t(
                            'cadenceHabits.errors.load',
                            'Could not load your habits.'
                        )}
                    </span>
                    <button
                        type="button"
                        onClick={load}
                        className={`flex-shrink-0 rounded-[6px] px-2 py-1 font-medium underline-offset-2 hover:underline ${PANEL_FOCUS}`}
                    >
                        {t('cadenceHabits.retry', 'Try again')}
                    </button>
                </div>
            )}

            {habits === null && !failed && (
                <div aria-hidden="true" className="flex flex-col gap-px">
                    {[0, 1, 2].map((key) => (
                        <div
                            key={key}
                            className="flex h-[34px] items-center gap-[8px] px-[10px]"
                        >
                            <span className="h-[18px] w-[18px] rounded-full bg-gray-800" />
                            <span className="h-3 w-28 rounded bg-gray-800" />
                        </div>
                    ))}
                </div>
            )}

            {habits !== null && habits.length === 0 && !failed && (
                <PanelEmpty
                    title={t('cadenceHabits.empty.title', 'No habits yet.')}
                    actionLabel={newLabel}
                    onAction={openNewHabit}
                />
            )}

            {sections.map(({ group, habits: items }) => (
                <PanelGroup
                    key={group.uid}
                    id={`habits-${group.uid}`}
                    title={group.name}
                    detail={
                        group.start_minute !== null && group.end_minute !== null
                            ? `${clock(group.start_minute)}–${clock(group.end_minute)}`
                            : undefined
                    }
                    count={items.length}
                >
                    {items.map((habit) => {
                        const state = rowState(habit);
                        const tint = argbToHex(habit.color_argb) ?? accentHex();
                        const path = habitPath(habit);
                        const muted = state.paused || !state.planned;
                        return (
                            <li
                                key={habit.uid}
                                className={`${panelRowClass(
                                    location.pathname === path
                                )} relative pr-[4px]`}
                            >
                                <FacetGauge
                                    progress={state.done ? 1 : state.ratio}
                                    tint={tint}
                                    size={18}
                                    strokeWidth={2}
                                    className={muted ? 'opacity-50' : ''}
                                />
                                <button
                                    type="button"
                                    onClick={() => open(path, habit.name)}
                                    title={statusLine(t, habit)}
                                    // The whole row opens the habit; the
                                    // check sits above this overlay.
                                    className={`min-w-0 flex-1 truncate text-left after:absolute after:inset-0 after:rounded-[8px] focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-blue-500 ${
                                        muted || state.done
                                            ? 'text-gray-500 dark:text-gray-400'
                                            : ''
                                    }`}
                                >
                                    {habit.name}
                                    <span className="sr-only">
                                        {`, ${statusLine(t, habit)}`}
                                    </span>
                                </button>
                                <span className="relative z-10 flex flex-shrink-0 items-center gap-[6px] text-[12px] tabular-nums text-gray-500 dark:text-gray-300">
                                    {state.amount && (
                                        <span aria-hidden="true">
                                            {state.amount}
                                        </span>
                                    )}
                                    {state.streak > 0 && !state.paused && (
                                        <span
                                            className="flex items-center gap-[2px]"
                                            title={t(
                                                'cadenceHabits.streak.current',
                                                '{{count}} periods in a row',
                                                { count: state.streak }
                                            )}
                                        >
                                            <FireIcon
                                                className="h-3.5 w-3.5"
                                                aria-hidden="true"
                                            />
                                            <span aria-hidden="true">
                                                {state.streak}
                                            </span>
                                        </span>
                                    )}
                                    {state.paused && (
                                        <PauseIcon
                                            className="h-3.5 w-3.5"
                                            aria-label={t(
                                                'cadenceHabits.status.paused',
                                                'Paused'
                                            )}
                                        />
                                    )}
                                    {state.done && (
                                        <span
                                            role="img"
                                            aria-label={t(
                                                'cadenceHabits.status.done',
                                                'Done'
                                            )}
                                            className="flex h-[26px] w-[26px] items-center justify-center"
                                        >
                                            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-success-container text-success">
                                                <CheckIcon
                                                    className="h-3 w-3"
                                                    strokeWidth={3}
                                                    aria-hidden="true"
                                                />
                                            </span>
                                        </span>
                                    )}
                                    {state.canCheck && (
                                        <button
                                            type="button"
                                            disabled={busy.has(habit.uid)}
                                            onClick={() => check(habit)}
                                            aria-label={t(
                                                'cadenceHabits.quick.doneFor',
                                                'Mark {{name}} as done',
                                                { name: habit.name }
                                            )}
                                            title={t(
                                                'cadenceHabits.quick.doneFor',
                                                'Mark {{name}} as done',
                                                { name: habit.name }
                                            )}
                                            className={`group/check flex h-[26px] w-[26px] items-center justify-center rounded-full disabled:opacity-50 ${PANEL_FOCUS}`}
                                        >
                                            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-gray-400 text-transparent transition-colors duration-150 group-hover/check:border-primary group-hover/check:text-primary">
                                                <CheckIcon
                                                    className="h-3 w-3"
                                                    strokeWidth={3}
                                                    aria-hidden="true"
                                                />
                                            </span>
                                        </button>
                                    )}
                                </span>
                            </li>
                        );
                    })}
                </PanelGroup>
            ))}
        </div>
    );
};

export default SidebarHabitsPanel;
