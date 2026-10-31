import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowUturnLeftIcon,
    PauseCircleIcon,
    PlusIcon,
} from '@heroicons/react/24/outline';
import HabitCard from './HabitCard';
import HabitEditor from './HabitEditor';
import PauseEditor from './PauseEditor';
import TabPills from '../Shared/ui/TabPills';
import BlankSlate from '../Shared/BlankSlate';
import {
    CadenceGroup,
    CadenceHabit,
    CadenceQuickValue,
    createRow,
    fetchCadenceGroups,
    fetchCadenceHabits,
    fetchRows,
    updateCadenceHabit,
} from '../../utils/cadenceHabitsService';
import { groupHabits, kindOf } from '../../utils/cadenceHabitUtils';

type Tab = 'habits' | 'archived';

const clock = (minute: number) =>
    `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

// Habits that offer quick amounts: everything but yes/no and abstinence.
const wantsQuickValues = (habit: CadenceHabit) =>
    !!habit.goal &&
    habit.goal.goal_type !== 'BINARY' &&
    kindOf(habit.goal) !== 'abstinence';

const Habits: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [tab, setTab] = useState<Tab>('habits');
    const [habits, setHabits] = useState<CadenceHabit[]>([]);
    const [archived, setArchived] = useState<CadenceHabit[]>([]);
    const [groups, setGroups] = useState<CadenceGroup[]>([]);
    const [quickValues, setQuickValues] = useState<
        Record<string, CadenceQuickValue[]>
    >({});
    const [today, setToday] = useState('');
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [pauseOpen, setPauseOpen] = useState(false);
    const fetchedQuick = useRef(new Set<string>());

    const loadQuickValues = useCallback((list: CadenceHabit[]) => {
        for (const habit of list.filter(wantsQuickValues)) {
            if (fetchedQuick.current.has(habit.uid)) continue;
            fetchedQuick.current.add(habit.uid);
            fetchRows<CadenceQuickValue>(habit.uid, 'quick-values')
                .then((rows) =>
                    setQuickValues((current) => ({
                        ...current,
                        [habit.uid]: [...rows].sort(
                            (a, b) => a.sort_order - b.sort_order
                        ),
                    }))
                )
                .catch(() => fetchedQuick.current.delete(habit.uid));
        }
    }, []);

    const load = useCallback(async () => {
        try {
            const [list, groupList, archivedList] = await Promise.all([
                fetchCadenceHabits(),
                fetchCadenceGroups(),
                fetchCadenceHabits({ archived: true }),
            ]);
            setHabits(list.habits);
            setArchived(archivedList.habits);
            setGroups(groupList);
            setToday(list.date);
            setFailed(false);
            loadQuickValues(list.habits);
        } catch (error) {
            console.error('Failed to load the habits:', error);
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [loadQuickValues]);

    useEffect(() => {
        load();
    }, [load]);

    const log = async (
        habit: CadenceHabit,
        amountMinor: number,
        note?: string
    ) => {
        try {
            await createRow(habit.uid, 'entries', {
                value_minor: amountMinor,
                note: note ?? null,
            });
            await load();
        } catch (error) {
            console.error('Failed to log an entry:', error);
            setFailed(true);
        }
    };

    const restore = async (habit: CadenceHabit) => {
        try {
            await updateCadenceHabit(habit.uid, { archived: false });
            await load();
        } catch (error) {
            console.error('Failed to restore the habit:', error);
            setFailed(true);
        }
    };

    const sections = useMemo(
        () => groupHabits(habits, groups),
        [habits, groups]
    );
    const pausable = useMemo(
        () => habits.filter((habit) => !!habit.goal),
        [habits]
    );
    const preselected = useMemo(
        () => pausable.map((habit) => habit.uid),
        [pausable]
    );

    const planned = habits.filter(
        (habit) =>
            habit.goal &&
            kindOf(habit.goal) === 'goal' &&
            habit.status.evaluation?.is_planned &&
            !habit.status.evaluation.is_paused
    );
    const doneCount = planned.filter(
        (habit) => habit.status.evaluation?.validates_period
    ).length;

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="text-lg dark:text-white">
                    {t('common.loading', 'Loading...')}
                </div>
            </div>
        );
    }

    const buttonClass =
        'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-control px-4 text-label focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 active:scale-[0.97] transition-transform duration-[220ms]';

    return (
        <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-4 sm:px-6 lg:px-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-headline text-surface-on">
                    {t('cadenceHabits.title', 'Habits')}
                </h1>
                <div className="flex items-center gap-2">
                    {pausable.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setPauseOpen(true)}
                            className={`${buttonClass} border border-outline/35 bg-surface-variant/60 text-surface-on dark:bg-surface-variant/35`}
                        >
                            <PauseCircleIcon
                                className="h-5 w-5"
                                aria-hidden="true"
                            />
                            <span className="hidden sm:inline">
                                {t(
                                    'cadenceHabits.pause.title',
                                    'Pause or trip'
                                )}
                            </span>
                            <span className="sr-only sm:hidden">
                                {t(
                                    'cadenceHabits.pause.title',
                                    'Pause or trip'
                                )}
                            </span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setEditorOpen(true)}
                        aria-label={t('cadenceHabits.new', 'New habit')}
                        className={`${buttonClass} bg-primary text-primary-on shadow-sm hover:bg-primary/90`}
                    >
                        <PlusIcon className="h-5 w-5" aria-hidden="true" />
                        <span className="hidden sm:inline">
                            {t('cadenceHabits.new', 'New habit')}
                        </span>
                    </button>
                </div>
            </div>

            {failed && (
                <div
                    role="alert"
                    className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-control bg-danger-container px-4 py-3 text-danger-on-container"
                >
                    <span>
                        {t(
                            'cadenceHabits.errors.load',
                            'Could not load your habits.'
                        )}
                    </span>
                    <button
                        type="button"
                        onClick={load}
                        className={`${buttonClass} bg-danger text-danger-on`}
                    >
                        {t('cadenceHabits.retry', 'Try again')}
                    </button>
                </div>
            )}

            <TabPills
                aria-label={t('cadenceHabits.tabs', 'Habit lists')}
                className="mb-4"
                selected={tab}
                onSelect={(id) => setTab(id as Tab)}
                tabs={[
                    {
                        id: 'habits',
                        label: t('cadenceHabits.tabHabits', 'Habits'),
                    },
                    {
                        id: 'archived',
                        label: t('cadenceHabits.tabArchived', 'Archived'),
                        count: archived.length,
                    },
                ]}
            />

            {tab === 'archived' ? (
                archived.length === 0 ? (
                    <p className="text-body-m text-surface-on-variant">
                        {t('cadenceHabits.noArchived', 'No archived habits.')}
                    </p>
                ) : (
                    <ul className="divide-y divide-outline-variant overflow-hidden rounded-card bg-surface-card">
                        {archived.map((habit) => (
                            <li
                                key={habit.uid}
                                className="flex min-h-[56px] items-center justify-between gap-3 px-4"
                            >
                                <Link
                                    to={`/habit/${habit.uid}`}
                                    className="min-w-0 truncate py-3 text-body text-surface-on hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                    {habit.name}
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => restore(habit)}
                                    aria-label={t(
                                        'cadenceHabits.restoreFor',
                                        'Restore {{name}}',
                                        { name: habit.name }
                                    )}
                                    className={`${buttonClass} text-primary`}
                                >
                                    <ArrowUturnLeftIcon
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                    />
                                    {t('cadenceHabits.restore', 'Restore')}
                                </button>
                            </li>
                        ))}
                    </ul>
                )
            ) : habits.length === 0 && !failed ? (
                <BlankSlate
                    title={t('cadenceHabits.empty.title', 'No habits yet.')}
                    hint={t(
                        'cadenceHabits.empty.hint',
                        'A habit is something you do regularly, like reading or a walk, something you keep under a limit, or something you go without. Note it each time and watch your streak grow.'
                    )}
                    actions={[
                        {
                            label: t(
                                'cadenceHabits.empty.create',
                                'Create your first habit'
                            ),
                            icon: PlusIcon,
                            onClick: () => setEditorOpen(true),
                        },
                    ]}
                />
            ) : (
                <>
                    {planned.length > 0 && (
                        <p
                            className="mb-4 text-body-m text-surface-on-variant"
                            data-testid="habits-today-line"
                        >
                            {t(
                                'cadenceHabits.doneLine',
                                '{{done}} of {{total}} done for now',
                                { done: doneCount, total: planned.length }
                            )}
                        </p>
                    )}
                    {sections.map(({ group, habits: items }) => (
                        <section
                            key={group.uid}
                            aria-labelledby={`group-${group.uid}`}
                            className="mb-8"
                        >
                            <h2
                                id={`group-${group.uid}`}
                                className="mb-3 px-1 text-title-m text-surface-on"
                            >
                                {group.name}
                                {group.start_minute !== null &&
                                    group.end_minute !== null && (
                                        <span className="ml-2 text-label-m text-surface-on-variant">
                                            {clock(group.start_minute)}
                                            {'–'}
                                            {clock(group.end_minute)}
                                        </span>
                                    )}
                            </h2>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                                {items.map((habit) => (
                                    <HabitCard
                                        key={habit.uid}
                                        habit={habit}
                                        quickValues={
                                            quickValues[habit.uid] ?? []
                                        }
                                        onLog={log}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </>
            )}

            <HabitEditor
                isOpen={editorOpen}
                onClose={() => setEditorOpen(false)}
                groups={groups}
                today={today}
                onSaved={(uid) => {
                    setEditorOpen(false);
                    fetchedQuick.current.clear();
                    navigate(`/habit/${uid}`);
                }}
            />
            <PauseEditor
                isOpen={pauseOpen}
                onClose={() => setPauseOpen(false)}
                habits={pausable}
                preselected={preselected}
                today={today}
                onSaved={() => {
                    setPauseOpen(false);
                    load();
                }}
            />
        </div>
    );
};

export default Habits;
