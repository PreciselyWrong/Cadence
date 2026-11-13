import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '../Shared/ui/PageHeader';
import Button from '../Shared/ui/Button';
import {
    ArrowUturnLeftIcon,
    PauseCircleIcon,
    PlusIcon,
} from '@heroicons/react/24/outline';
import HabitCard from './HabitCard';
import HabitEditor from './HabitEditor';
import PauseEditor from './PauseEditor';
import { withEntry } from './habitStatus';
import Segmented from '../Shared/ui/Segmented';
import { useToast } from '../Shared/ToastContext';
import EmptyState from '../Shared/ui/EmptyState';
import PageShell from '../Shared/ui/PageShell';
import {
    CadenceEntry,
    CadenceGroup,
    CadenceHabit,
    CadenceQuickValue,
    createRow,
    deleteRow,
    fetchCadenceGroups,
    fetchCadenceHabits,
    fetchRows,
    onHabitsChanged,
    updateCadenceHabit,
} from '../../utils/cadenceHabitsService';
import { groupHabits, kindOf } from '../../utils/cadenceHabitUtils';
import { duplicateHabit } from '../../utils/cadenceHabitSave';
import { moveHabitPatches } from '../../utils/habitOrder';

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
    const { showUndoToast, showErrorToast } = useToast();
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

    // A habit logged elsewhere (the sidebar's check) shows here too.
    useEffect(() => onHabitsChanged(load), [load]);

    const log = async (
        habit: CadenceHabit,
        amountMinor: number,
        note?: string
    ) => {
        // The card shows the entry at once; a failed save puts it back.
        setHabits((current) =>
            current.map((item) =>
                item.uid === habit.uid ? withEntry(item, amountMinor) : item
            )
        );
        let entry: CadenceEntry;
        try {
            entry = await createRow<CadenceEntry>(habit.uid, 'entries', {
                value_minor: amountMinor,
                note: note ?? null,
            });
        } catch (error) {
            console.error('Failed to log an entry:', error);
            setHabits((current) =>
                current.map((item) => (item.uid === habit.uid ? habit : item))
            );
            setFailed(true);
            return;
        }
        await load();
        showUndoToast(
            t('cadenceHabits.entry.logged', '{{name}} logged', {
                name: habit.name,
            }),
            () => undoEntry(habit, entry.uid)
        );
    };

    const undoEntry = async (habit: CadenceHabit, entryUid: string) => {
        try {
            await deleteRow(habit.uid, 'entries', entryUid);
        } catch (error) {
            console.error('Failed to undo an entry:', error);
            showErrorToast(
                t('cadenceHabits.entry.undoFailed', 'Could not undo the entry.')
            );
            return;
        }
        await load();
    };

    // The group's habits are renumbered 0..n, so a swap cannot tie.
    const moveHabit = async (
        group: CadenceHabit[],
        habit: CadenceHabit,
        delta: -1 | 1
    ) => {
        const patches = moveHabitPatches(group, habit.uid, delta);
        if (patches.length === 0) return;
        try {
            await Promise.all(
                patches.map((patch) =>
                    updateCadenceHabit(patch.uid, {
                        sort_order: patch.sort_order,
                    })
                )
            );
        } catch (error) {
            console.error('Failed to move the habit:', error);
            showErrorToast(
                t('cadenceHabits.errors.move', 'Could not move the habit.')
            );
        }
        await load();
    };

    const copyHabit = async (group: CadenceHabit[], habit: CadenceHabit) => {
        const sortOrder = Math.max(...group.map((item) => item.sort_order)) + 1;
        try {
            await duplicateHabit(
                habit.uid,
                t('cadenceHabits.copyName', '{{name}} (copy)', {
                    name: habit.name,
                }),
                sortOrder
            );
        } catch (error) {
            console.error('Failed to copy the habit:', error);
            showErrorToast(
                t('cadenceHabits.errors.copy', 'Could not copy the habit.')
            );
            return;
        }
        await load();
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
        <PageShell template="board" className="pb-24">
            <PageHeader
                title={t('cadenceHabits.title', 'Habits')}
                meta={
                    planned.length > 0 ? (
                        <span data-testid="habits-today-line">
                            {t(
                                'cadenceHabits.doneLine',
                                '{{done}} of {{total}} done for now',
                                { done: doneCount, total: planned.length }
                            )}
                        </span>
                    ) : undefined
                }
                actions={
                    <>
                        {pausable.length > 0 && (
                            <Button
                                onClick={() => setPauseOpen(true)}
                                icon={
                                    <PauseCircleIcon
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                    />
                                }
                            >
                                {t(
                                    'cadenceHabits.pause.title',
                                    'Pause or trip'
                                )}
                            </Button>
                        )}
                        <Button
                            variant="primary"
                            onClick={() => setEditorOpen(true)}
                            icon={
                                <PlusIcon
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                />
                            }
                        >
                            {t('cadenceHabits.new', 'New habit')}
                        </Button>
                    </>
                }
            />
            <div className="px-6 max-sm:px-4">
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

                <Segmented
                    aria-label={t('cadenceHabits.tabs', 'Habit lists')}
                    className="mb-4"
                    selected={tab}
                    onSelect={(id) => setTab(id as Tab)}
                    options={[
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
                        <EmptyState
                            title={t(
                                'cadenceHabits.noArchived',
                                'No archived habits.'
                            )}
                        />
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
                    <EmptyState
                        title={t('cadenceHabits.empty.title', 'No habits yet.')}
                        hint={t(
                            'cadenceHabits.empty.hint',
                            'A habit is something you do regularly, like reading or a walk, something you keep under a limit, or something you go without. Note it each time and watch your streak grow.'
                        )}
                        action={
                            <Button
                                size="md"
                                variant="primary"
                                icon={<PlusIcon className="h-4 w-4" />}
                                onClick={() => setEditorOpen(true)}
                            >
                                {t(
                                    'cadenceHabits.empty.create',
                                    'Create your first habit'
                                )}
                            </Button>
                        }
                    />
                ) : (
                    <>
                        {sections.map(({ group, habits: items }) => (
                            <section
                                key={group.uid}
                                aria-labelledby={`group-${group.uid}`}
                                className="mb-8"
                            >
                                <h2
                                    id={`group-${group.uid}`}
                                    className="mb-2 flex h-8 items-center px-1 text-xs font-medium text-surface-on-variant"
                                >
                                    {group.name}
                                    {group.start_minute !== null &&
                                        group.end_minute !== null && (
                                            <span className="ml-2 tabular-nums">
                                                {clock(group.start_minute)}
                                                {'–'}
                                                {clock(group.end_minute)}
                                            </span>
                                        )}
                                </h2>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                                    {items.map((habit, index) => (
                                        <HabitCard
                                            key={habit.uid}
                                            habit={habit}
                                            quickValues={
                                                quickValues[habit.uid] ?? []
                                            }
                                            onLog={log}
                                            manage={{
                                                canMoveUp: index > 0,
                                                canMoveDown:
                                                    index < items.length - 1,
                                                onMove: (delta) =>
                                                    moveHabit(
                                                        items,
                                                        habit,
                                                        delta
                                                    ),
                                                onDuplicate: () =>
                                                    copyHabit(items, habit),
                                            }}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </>
                )}
            </div>

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
        </PageShell>
    );
};

export default Habits;
