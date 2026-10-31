import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArchiveBoxIcon,
    ArrowLeftIcon,
    ArrowUturnLeftIcon,
    PauseCircleIcon,
    PencilSquareIcon,
    PlusIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import FacetGauge from '../Shared/ui/FacetGauge';
import CadenceBadge from '../Shared/ui/CadenceBadge';
import ConfirmDialog from '../Shared/ConfirmDialog';
import HabitCalendar, { CalendarStatus } from './HabitCalendar';
import HabitEditor from './HabitEditor';
import EntryEditor from './EntryEditor';
import PauseEditor from './PauseEditor';
import AbstinencePanel from './AbstinencePanel';
import AlcoholPanel from './AlcoholPanel';
import { habitTint } from './HabitCard';
import {
    describeGoal,
    describeSchedule,
    pauseReason,
    statusLine,
    streakLabel,
} from './habitStatus';
import {
    CadenceEntry,
    CadenceGroup,
    CadenceHabitDetail,
    CadencePause,
    deleteCadenceHabit,
    fetchCadenceGroups,
    fetchCadenceHabit,
    fetchEntries,
    updateCadenceHabit,
    updateRow,
    deleteRow,
} from '../../utils/cadenceHabitsService';
import {
    abstinenceDays,
    addDays,
    browserZone,
    formatDate,
    formatWithUnit,
    kindOf,
    monthEnd,
    monthStart,
    pauseEnding,
    pauseIncludes,
    isAlcoholHabit,
} from '../../utils/cadenceHabitUtils';

const card = 'rounded-card bg-surface-card p-4';
const smallButton =
    'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-control px-3 text-label text-surface-on hover:bg-surface-variant/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.97] transition-transform duration-[220ms]';

const HabitDetails: React.FC = () => {
    const { t, i18n } = useTranslation();
    const language = i18n?.language ?? 'en';
    const { uid = '' } = useParams<{ uid: string }>();
    const navigate = useNavigate();
    const [habit, setHabit] = useState<CadenceHabitDetail | null>(null);
    const [groups, setGroups] = useState<CadenceGroup[]>([]);
    const [entries, setEntries] = useState<CadenceEntry[]>([]);
    const [today, setToday] = useState('');
    const [month, setMonth] = useState('');
    const [selected, setSelected] = useState<string | null>(null);
    const [failed, setFailed] = useState<'load' | 'gone' | null>(null);
    const [editing, setEditing] = useState(false);
    const [pausing, setPausing] = useState(false);
    const [entryOpen, setEntryOpen] = useState<CadenceEntry | 'new' | null>(
        null
    );
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const kind = habit?.goal ? kindOf(habit.goal) : 'goal';
    const timezone = browserZone();

    // Abstinence reads a year of entries (its calendar is built from them);
    // the others read the month on show.
    const entryRange = useCallback(
        (current: CadenceHabitDetail, day: string, shown: string) =>
            current.goal && kindOf(current.goal) === 'abstinence'
                ? { from: addDays(day, -364), to: day }
                : { from: monthStart(shown), to: monthEnd(shown) },
        []
    );

    const load = useCallback(
        async (shown?: string) => {
            try {
                const detail = await fetchCadenceHabit(uid);
                const day = detail.status.date;
                const visible = shown || monthStart(day);
                setHabit(detail);
                setToday(day);
                setMonth(visible);
                setEntries(
                    await fetchEntries(uid, entryRange(detail, day, visible))
                );
                setFailed(null);
            } catch (error) {
                const status = (error as { status?: number }).status;
                setFailed(status === 404 ? 'gone' : 'load');
            }
        },
        [uid, entryRange]
    );

    useEffect(() => {
        setHabit(null);
        setMonth('');
        setSelected(null);
        load();
        fetchCadenceGroups()
            .then(setGroups)
            .catch(() => setGroups([]));
    }, [uid, load]);

    const changeMonth = async (next: string) => {
        setMonth(next);
        setSelected(null);
        if (habit && kind !== 'abstinence') {
            try {
                setEntries(
                    await fetchEntries(uid, entryRange(habit, today, next))
                );
            } catch {
                setFailed('load');
            }
        }
    };

    const act = async (action: () => Promise<unknown>) => {
        setActionError(null);
        try {
            await action();
            await load(month);
        } catch (error) {
            setActionError(
                t(
                    'cadenceHabits.errors.action',
                    'That did not work ({{code}}).',
                    {
                        code:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    }
                )
            );
        }
    };

    const summary = habit?.stats.summary;
    const dayStatuses = useMemo(() => {
        const map = new Map<string, CalendarStatus>();
        if (!habit) return map;
        if (kind === 'abstinence') {
            for (const day of abstinenceDays({
                startsOn: habit.starts_on,
                today,
                span: 365,
                entries,
                pauses: habit.pauses,
            })) {
                if (day.status === 'UNOBSERVED') continue;
                map.set(
                    day.date,
                    day.status.endsWith('OCCURRENCE')
                        ? 'OCCURRENCE'
                        : day.status === 'PAUSED'
                          ? 'PAUSED'
                          : 'CLEAR'
                );
            }
        } else {
            for (const day of summary?.calendarDays ?? []) {
                // today is still open: it is not missed yet
                const pending = day.date === today && day.status === 'MISSED';
                if (
                    day.status !== 'UNPLANNED' &&
                    day.status !== 'NO_ACTIVITY' &&
                    !pending
                ) {
                    map.set(day.date, day.status);
                }
            }
        }
        return map;
    }, [habit, kind, today, entries, summary]);

    const totals = useMemo(() => {
        const sums = new Map<string, number>();
        for (const entry of entries) {
            sums.set(
                entry.local_date,
                (sums.get(entry.local_date) ?? 0) + entry.value_minor
            );
        }
        return sums;
    }, [entries]);

    if (failed === 'gone') {
        return (
            <div className="mx-auto max-w-3xl px-4 py-8">
                <p className="mb-4 text-body text-surface-on">
                    {t('cadenceHabits.notFound', 'This habit does not exist.')}
                </p>
                <Link to="/habits" className="text-primary underline">
                    {t('cadenceHabits.backToList', 'Back to habits')}
                </Link>
            </div>
        );
    }
    if (!habit) {
        return failed ? (
            <div
                role="alert"
                className="mx-auto max-w-3xl px-4 py-8 text-danger"
            >
                {t(
                    'cadenceHabits.errors.loadOne',
                    'Could not load this habit.'
                )}{' '}
                <button
                    type="button"
                    className="underline"
                    onClick={() => load()}
                >
                    {t('cadenceHabits.retry', 'Try again')}
                </button>
            </div>
        ) : (
            <div className="flex h-64 items-center justify-center text-lg dark:text-white">
                {t('common.loading', 'Loading...')}
            </div>
        );
    }

    const goal = habit.goal;
    const tint = habitTint(habit);
    const evaluation = habit.status.evaluation;
    const streak = habit.status.streak ?? { current: 0, best: 0 };
    const activity = habit.stats.activity;
    const firstDay = habit.schedule?.first_day_of_week ?? 'MONDAY';
    const earliest =
        habit.starts_on > addDays(today, -364)
            ? habit.starts_on
            : addDays(today, -364);
    const shownEntries = selected
        ? entries.filter((e) => e.local_date === selected)
        : entries.filter((e) => e.local_date.startsWith(month.slice(0, 7)));
    const sortedEntries = [...shownEntries].sort((a, b) =>
        b.occurred_at.localeCompare(a.occurred_at)
    );
    const pauses = [...habit.pauses].sort((a, b) =>
        b.start.localeCompare(a.start)
    );

    const kindLabel = {
        goal: t('cadenceHabits.kind.goal', 'Goal'),
        limit: t('cadenceHabits.kind.limit', 'Limit'),
        tracker: t('cadenceHabits.kind.tracker', 'Free activity'),
        abstinence: t('cadenceHabits.kind.abstinence', 'Abstinence'),
    }[kind];

    const pauseState = (pause: CadencePause) =>
        pauseIncludes(pause, today)
            ? t('cadenceHabits.pause.active', 'In progress')
            : pause.start > today
              ? t('cadenceHabits.pause.upcoming', 'Upcoming')
              : t('cadenceHabits.pause.ended', 'Ended');

    const pauseRange = (pause: CadencePause) =>
        pause.end_exclusive
            ? t('cadenceHabits.pause.range', '{{from}} to {{to}}', {
                  from: formatDate(pause.start, language),
                  to: formatDate(addDays(pause.end_exclusive, -1), language),
              })
            : t('cadenceHabits.pause.since', 'Since {{from}}', {
                  from: formatDate(pause.start, language),
              });

    const stats: [string, string][] = [
        [
            t('cadenceHabits.stats.streak', 'Streak'),
            streak.current > 0
                ? streakLabel(t, streak.current)
                : t('cadenceHabits.stats.noStreak', 'None yet'),
        ],
        [t('cadenceHabits.stats.best', 'Best streak'), String(streak.best)],
        ...(kind === 'abstinence'
            ? []
            : ([
                  [
                      t('cadenceHabits.stats.success', 'Success (30 days)'),
                      summary?.successRatePercent == null
                          ? '–'
                          : `${summary.successRatePercent} %`,
                  ],
                  [
                      t('cadenceHabits.stats.activeDays', 'Active days (30)'),
                      `${activity.activeDays30} / ${activity.calendarDays30}`,
                  ],
                  ...(goal && goal.goal_type !== 'BINARY'
                      ? [
                            [
                                t(
                                    'cadenceHabits.stats.total30',
                                    'Total (30 days)'
                                ),
                                formatWithUnit(activity.totalMinor30, goal),
                            ] as [string, string],
                        ]
                      : []),
                  [
                      t('cadenceHabits.stats.entries', 'Entries (all time)'),
                      String(activity.entriesAllTime),
                  ],
              ] as [string, string][])),
    ];

    return (
        <div className="mx-auto w-full max-w-4xl space-y-4 px-4 pb-24 pt-4 sm:px-6">
            <Link
                to="/habits"
                className="inline-flex min-h-[44px] items-center gap-1 text-label text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
                <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
                {t('cadenceHabits.backToList', 'Back to habits')}
            </Link>

            <header className={`${card} flex flex-wrap items-center gap-4`}>
                <FacetGauge
                    progress={
                        kind === 'goal' || kind === 'limit'
                            ? Math.min(
                                  1,
                                  (evaluation?.progress_minor ?? 0) /
                                      (evaluation?.target_minor || 1)
                              )
                            : 0
                    }
                    tint={tint}
                    size={56}
                >
                    <span className="text-title-m" aria-hidden="true">
                        {habit.name.trim().charAt(0).toUpperCase()}
                    </span>
                </FacetGauge>
                <div className="min-w-0 flex-1">
                    <h1 className="break-words text-headline text-surface-on">
                        {habit.name}
                    </h1>
                    <p className="flex flex-wrap items-center gap-2 text-body-m text-surface-on-variant">
                        <CadenceBadge tone="primary">{kindLabel}</CadenceBadge>
                        {habit.archived && (
                            <CadenceBadge>
                                {t('cadenceHabits.archivedBadge', 'Archived')}
                            </CadenceBadge>
                        )}
                        <span>{statusLine(t, habit)}</span>
                    </p>
                    {habit.description && (
                        <p className="mt-1 text-body-m text-surface-on">
                            {habit.description}
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap gap-1">
                    <button
                        type="button"
                        className={smallButton}
                        onClick={() => setEditing(true)}
                    >
                        <PencilSquareIcon
                            className="h-5 w-5"
                            aria-hidden="true"
                        />
                        {t('common.edit', 'Edit')}
                    </button>
                    <button
                        type="button"
                        className={smallButton}
                        onClick={() => setPausing(true)}
                    >
                        <PauseCircleIcon
                            className="h-5 w-5"
                            aria-hidden="true"
                        />
                        {t('cadenceHabits.pause.action', 'Pause')}
                    </button>
                    <button
                        type="button"
                        className={smallButton}
                        onClick={() =>
                            act(() =>
                                updateCadenceHabit(uid, {
                                    archived: !habit.archived,
                                })
                            )
                        }
                    >
                        {habit.archived ? (
                            <ArrowUturnLeftIcon
                                className="h-5 w-5"
                                aria-hidden="true"
                            />
                        ) : (
                            <ArchiveBoxIcon
                                className="h-5 w-5"
                                aria-hidden="true"
                            />
                        )}
                        {habit.archived
                            ? t('cadenceHabits.restore', 'Restore')
                            : t('cadenceHabits.archive', 'Archive')}
                    </button>
                    <button
                        type="button"
                        className={`${smallButton} !text-danger`}
                        onClick={() => setConfirmDelete(true)}
                    >
                        <TrashIcon className="h-5 w-5" aria-hidden="true" />
                        {t('common.delete', 'Delete')}
                    </button>
                </div>
            </header>

            {actionError && (
                <p role="alert" className="text-sm text-danger">
                    {actionError}
                </p>
            )}

            <section aria-labelledby="stats-title" className={card}>
                <h2
                    id="stats-title"
                    className="mb-3 text-title-m text-surface-on"
                >
                    {t('cadenceHabits.stats.title', 'Statistics')}
                </h2>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {stats.map(([label, value]) => (
                        <div key={label}>
                            <dt className="text-label-m text-surface-on-variant">
                                {label}
                            </dt>
                            <dd className="text-title text-surface-on">
                                {value}
                            </dd>
                        </div>
                    ))}
                </dl>
            </section>

            {kind === 'abstinence' && (
                <AbstinencePanel
                    habit={habit}
                    today={today}
                    entries={entries}
                    onChanged={() => load(month)}
                />
            )}
            {isAlcoholHabit(habit) && (
                <AlcoholPanel
                    habit={habit}
                    today={today}
                    timezone={timezone}
                    onChanged={() => load(month)}
                />
            )}

            <section aria-labelledby="history-title" className={card}>
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h2
                        id="history-title"
                        className="text-title-m text-surface-on"
                    >
                        {t('cadenceHabits.history.title', 'History')}
                    </h2>
                    <button
                        type="button"
                        className={smallButton}
                        onClick={() => setEntryOpen('new')}
                    >
                        <PlusIcon className="h-5 w-5" aria-hidden="true" />
                        {t('cadenceHabits.entry.add', 'Add an entry')}
                    </button>
                </div>
                <HabitCalendar
                    month={month}
                    today={today}
                    firstDay={firstDay}
                    earliest={earliest}
                    selected={selected}
                    onSelect={(date) =>
                        setSelected(selected === date ? null : date)
                    }
                    onMonthChange={changeMonth}
                    statusOf={(date) => dayStatuses.get(date)}
                    totalOf={(date) => {
                        const sum = totals.get(date);
                        return sum && goal && goal.goal_type !== 'BINARY'
                            ? formatWithUnit(sum, goal)
                            : null;
                    }}
                />
                <h3 className="mb-1 mt-4 text-label text-surface-on">
                    {selected
                        ? t(
                              'cadenceHabits.history.ofDay',
                              'Entries of {{date}}',
                              {
                                  date: formatDate(selected, language),
                              }
                          )
                        : t(
                              'cadenceHabits.history.ofMonth',
                              'Entries of the month'
                          )}
                </h3>
                {sortedEntries.length === 0 ? (
                    <p className="text-body-m text-surface-on-variant">
                        {t('cadenceHabits.history.none', 'No entry.')}
                    </p>
                ) : (
                    <ul className="divide-y divide-outline-variant">
                        {sortedEntries.map((entry) => (
                            <li
                                key={entry.uid}
                                className="flex min-h-[48px] items-center justify-between gap-3 py-1"
                            >
                                <span className="min-w-0 text-body-m text-surface-on">
                                    <span className="text-surface-on-variant">
                                        {formatDate(entry.local_date, language)}
                                    </span>{' '}
                                    {goal && goal.goal_type !== 'BINARY'
                                        ? formatWithUnit(
                                              entry.value_minor,
                                              goal
                                          )
                                        : ''}
                                    {entry.note && (
                                        <span className="block truncate text-label-m text-surface-on-variant">
                                            {entry.note}
                                        </span>
                                    )}
                                </span>
                                <button
                                    type="button"
                                    className={smallButton}
                                    onClick={() => setEntryOpen(entry)}
                                    aria-label={t(
                                        'cadenceHabits.entry.editFor',
                                        'Edit the entry of {{date}}',
                                        {
                                            date: formatDate(
                                                entry.local_date,
                                                language
                                            ),
                                        }
                                    )}
                                >
                                    {t('common.edit', 'Edit')}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section aria-labelledby="goal-title" className={card}>
                <h2
                    id="goal-title"
                    className="mb-3 text-title-m text-surface-on"
                >
                    {t('cadenceHabits.versions.title', 'Goal and schedule')}
                </h2>
                <ul className="space-y-2">
                    {[...habit.goals].reverse().map((version) => (
                        <li
                            key={version.uid}
                            className="text-body-m text-surface-on"
                        >
                            <span className="text-surface-on-variant">
                                {t(
                                    'cadenceHabits.versions.from',
                                    'From {{date}}',
                                    {
                                        date: formatDate(
                                            version.effective_from,
                                            language
                                        ),
                                    }
                                )}
                            </span>
                            {' · '}
                            {describeGoal(t, version)}
                            {version.uid === goal?.uid && (
                                <CadenceBadge tone="success" className="ml-2">
                                    {t(
                                        'cadenceHabits.versions.current',
                                        'Current'
                                    )}
                                </CadenceBadge>
                            )}
                        </li>
                    ))}
                </ul>
                {habit.schedules.length > 0 && (
                    <ul className="mt-3 space-y-2 border-t border-outline-variant pt-3">
                        {[...habit.schedules].reverse().map((version) => (
                            <li
                                key={version.uid}
                                className="text-body-m text-surface-on"
                            >
                                <span className="text-surface-on-variant">
                                    {t(
                                        'cadenceHabits.versions.from',
                                        'From {{date}}',
                                        {
                                            date: formatDate(
                                                version.effective_from,
                                                language
                                            ),
                                        }
                                    )}
                                </span>
                                {' · '}
                                {describeSchedule(t, version, language)}
                            </li>
                        ))}
                    </ul>
                )}
                {(habit.quick_values.length > 0 ||
                    habit.reminders.length > 0) && (
                    <p className="mt-3 border-t border-outline-variant pt-3 text-body-m text-surface-on-variant">
                        {goal && habit.quick_values.length > 0 && (
                            <span>
                                {t(
                                    'cadenceHabits.versions.quick',
                                    'Quick buttons: {{values}}',
                                    {
                                        values: habit.quick_values
                                            .map((q) =>
                                                formatWithUnit(
                                                    q.amount_minor,
                                                    goal
                                                )
                                            )
                                            .join(', '),
                                    }
                                )}
                            </span>
                        )}{' '}
                        {habit.reminders.length > 0 && (
                            <span>
                                {t(
                                    'cadenceHabits.versions.reminders',
                                    'Reminders: {{times}}',
                                    {
                                        times: habit.reminders
                                            .map((r) => r.time)
                                            .join(', '),
                                    }
                                )}
                            </span>
                        )}
                    </p>
                )}
            </section>

            <section aria-labelledby="pauses-title" className={card}>
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h2
                        id="pauses-title"
                        className="text-title-m text-surface-on"
                    >
                        {t(
                            'cadenceHabits.pause.sectionTitle',
                            'Pauses and trips'
                        )}
                    </h2>
                    <button
                        type="button"
                        className={smallButton}
                        onClick={() => setPausing(true)}
                    >
                        <PlusIcon className="h-5 w-5" aria-hidden="true" />
                        {t('cadenceHabits.pause.add', 'Add a pause')}
                    </button>
                </div>
                {pauses.length === 0 ? (
                    <p className="text-body-m text-surface-on-variant">
                        {t('cadenceHabits.pause.none', 'No pause.')}
                    </p>
                ) : (
                    <ul className="divide-y divide-outline-variant">
                        {pauses.map((pause) => {
                            const ending = pauseEnding(pause, today);
                            return (
                                <li
                                    key={pause.uid}
                                    className="flex min-h-[48px] flex-wrap items-center justify-between gap-2 py-1"
                                >
                                    <span className="text-body-m text-surface-on">
                                        {pauseReason(
                                            t,
                                            pause.reason,
                                            pause.reason_label
                                        )}
                                        <span className="block text-label-m text-surface-on-variant">
                                            {pauseRange(pause)} ·{' '}
                                            {pauseState(pause)}
                                        </span>
                                    </span>
                                    {ending && (
                                        <button
                                            type="button"
                                            className={smallButton}
                                            onClick={() =>
                                                act(() =>
                                                    ending.kind === 'delete'
                                                        ? deleteRow(
                                                              uid,
                                                              'pauses',
                                                              pause.uid
                                                          )
                                                        : updateRow(
                                                              uid,
                                                              'pauses',
                                                              pause.uid,
                                                              {
                                                                  end_exclusive:
                                                                      ending.end_exclusive,
                                                              }
                                                          )
                                                )
                                            }
                                        >
                                            {ending.kind === 'delete'
                                                ? t(
                                                      'cadenceHabits.pause.cancel',
                                                      'Cancel'
                                                  )
                                                : t(
                                                      'cadenceHabits.pause.end',
                                                      'End the pause'
                                                  )}
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <HabitEditor
                isOpen={editing}
                onClose={() => setEditing(false)}
                groups={groups}
                habit={habit}
                today={today}
                onSaved={() => {
                    setEditing(false);
                    load(month);
                }}
            />
            <PauseEditor
                isOpen={pausing}
                onClose={() => setPausing(false)}
                habits={[habit]}
                preselected={[habit.uid]}
                today={today}
                onSaved={() => {
                    setPausing(false);
                    load(month);
                }}
            />
            <EntryEditor
                isOpen={entryOpen !== null}
                onClose={() => setEntryOpen(null)}
                habit={habit}
                entry={entryOpen && entryOpen !== 'new' ? entryOpen : null}
                defaultDate={selected ?? today}
                today={today}
                timezone={timezone}
                onSaved={() => {
                    setEntryOpen(null);
                    load(month);
                }}
            />
            {confirmDelete && (
                <ConfirmDialog
                    title={t(
                        'cadenceHabits.delete.title',
                        'Delete this habit?'
                    )}
                    message={t(
                        'cadenceHabits.delete.message',
                        'The habit and all its entries are deleted for good, on every device.'
                    )}
                    confirmButtonText={t('common.delete', 'Delete')}
                    onCancel={() => setConfirmDelete(false)}
                    onConfirm={async () => {
                        setConfirmDelete(false);
                        try {
                            await deleteCadenceHabit(uid);
                            navigate('/habits');
                        } catch (error) {
                            setActionError(
                                t(
                                    'cadenceHabits.errors.action',
                                    'That did not work ({{code}}).',
                                    {
                                        code:
                                            error instanceof Error
                                                ? error.message
                                                : String(error),
                                    }
                                )
                            );
                        }
                    }}
                />
            )}
        </div>
    );
};

export default HabitDetails;
