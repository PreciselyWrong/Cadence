import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseISO } from 'date-fns';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import {
    skipTaskOccurrence,
    toggleTaskCompletion,
    updateTask,
} from '../../utils/tasksService';
import { useToast } from '../Shared/ToastContext';
import Button, { IconButton } from '../Shared/ui/Button';
import Menu, { MenuEntry } from '../Shared/ui/Menu';
import { intlLocale } from '../DailyPlan/planUtils';
import { shiftDay } from '../Upcoming/planOps';
import type { LateTask } from './dayModel';
import {
    allTomorrowChoices,
    ReplanChoice,
    replanKinds,
    replanPatch,
    restoreTaskPatch,
    spreadOverdueChoices,
    weekDayCounts,
} from './overdueReplan';

export interface OverdueReplanSheetProps {
    open: boolean;
    onClose(): void;
    tasks: LateTask[];
    today: string;
    firstDayOfWeek?: number;
    dayCounts: Record<string, number>;
    plannedByDay: Record<string, Array<{ estimated_minutes?: number | null }>>;
    onApplied(): void;
}

interface AppliedEntry {
    label: string;
    undo: () => Promise<void>;
}

const OverdueReplanSheet: React.FC<OverdueReplanSheetProps> = ({
    open,
    onClose,
    tasks,
    today,
    firstDayOfWeek = 1,
    dayCounts,
    plannedByDay,
    onApplied,
}) => {
    const { t, i18n } = useTranslation();
    const { showUndoToast, showErrorToast } = useToast();
    const locale = intlLocale(i18n.language);

    // Snapshot rows when opening so acted-on rows stay visible until closed.
    const [rows, setRows] = useState<LateTask[]>([]);
    const [applied, setApplied] = useState<Record<string, AppliedEntry>>({});
    const [pickingDateUid, setPickingDateUid] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (open) {
            setRows(tasks);
            setApplied({});
            setPickingDateUid(null);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const tomorrow = shiftDay(today, 1);
    const formatShortDay = (date: string) =>
        new Intl.DateTimeFormat(locale, {
            weekday: 'short',
            day: 'numeric',
        }).format(parseISO(date));

    const formatDue = (date?: string | null) =>
        date
            ? new Intl.DateTimeFormat(locale, {
                  day: 'numeric',
                  month: 'short',
              }).format(parseISO(date.slice(0, 10)))
            : '';

    const labelFor = (choice: ReplanChoice): string => {
        switch (choice.kind) {
            case 'day':
                if (choice.date === today) return t('today.title', 'Today');
                if (choice.date === tomorrow) {
                    return t('today.tomorrow', 'Tomorrow');
                }
                return formatShortDay(choice.date);
            case 'horizon':
                switch (choice.horizon) {
                    case 'week':
                        return t('upcoming.thisWeek', 'This week');
                    case 'next_week':
                        return t('upcoming.nextWeek', 'Next week');
                    case 'this_month':
                        return t('upcoming.thisMonth', 'This month');
                    default:
                        return t('today.later', 'Later');
                }
            case 'done':
                return t('today.replanDone', 'Done');
            case 'drop':
                return t('today.replanDrop', 'Drop');
            case 'skip':
                return t('today.replanSkip', 'Skip this time');
        }
    };

    const writeOne = async (
        entry: LateTask,
        choice: ReplanChoice
    ): Promise<AppliedEntry | null> => {
        const uid = entry.task.uid;
        if (!uid) return null;
        if (choice.kind === 'done') {
            await toggleTaskCompletion(uid, entry.task);
            return {
                label: labelFor(choice),
                undo: async () => {
                    await updateTask(uid, restoreTaskPatch(entry.task));
                    onApplied();
                },
            };
        }
        if (choice.kind === 'skip') {
            await skipTaskOccurrence(uid);
            return {
                label: labelFor(choice),
                undo: async () => {
                    await updateTask(uid, restoreTaskPatch(entry.task));
                    onApplied();
                },
            };
        }
        const patch = replanPatch(
            entry.task,
            choice,
            today,
            firstDayOfWeek,
            entry.plannedDate
        );
        if (!patch) return null;
        await updateTask(uid, patch as Partial<Task>);
        return {
            label: labelFor(choice),
            undo: async () => {
                await updateTask(uid, restoreTaskPatch(entry.task));
                onApplied();
            },
        };
    };

    const applySingle = async (entry: LateTask, choice: ReplanChoice) => {
        const uid = entry.task.uid;
        if (!uid || busy) return;
        setBusy(true);
        try {
            const result = await writeOne(entry, choice);
            if (!result) return;
            setApplied((prev) => ({ ...prev, [uid]: result }));
            setPickingDateUid(null);
            onApplied();
            showUndoToast(
                t('today.replannedOne', '“{{name}}” → {{target}}', {
                    name: entry.task.name,
                    target: result.label,
                }),
                () => void undoRow(uid)
            );
        } catch {
            showErrorToast(
                t('today.saveFailed', 'Could not save. Nothing changed.')
            );
        } finally {
            setBusy(false);
        }
    };

    const undoRow = async (uid: string) => {
        const entry = applied[uid];
        if (!entry) return;
        try {
            await entry.undo();
            setApplied((prev) => {
                const next = { ...prev };
                delete next[uid];
                return next;
            });
        } catch {
            showErrorToast(
                t('today.saveFailed', 'Could not save. Nothing changed.')
            );
        }
    };

    const openRows = rows.filter((r) => r.task.uid && !applied[r.task.uid]);
    const openTasks = openRows.map((r) => r.task);
    const byUid = new Map(openRows.map((r) => [r.task.uid as string, r]));

    const applyBulk = async (
        choices: Array<{ task: Task; choice: ReplanChoice }>,
        toastMessage: string
    ) => {
        if (busy || choices.length === 0) return;
        setBusy(true);
        try {
            const doneList: Array<{ uid: string; undo: () => Promise<void> }> =
                [];
            const nextApplied: Record<string, AppliedEntry> = {};
            for (const { task, choice } of choices) {
                const entry = task.uid ? byUid.get(task.uid) : undefined;
                if (!entry || !task.uid) continue;
                const result = await writeOne(entry, choice);
                if (result) {
                    nextApplied[task.uid] = result;
                    doneList.push({ uid: task.uid, undo: result.undo });
                }
            }
            if (doneList.length === 0) return;
            setApplied((prev) => ({ ...prev, ...nextApplied }));
            onApplied();
            showUndoToast(toastMessage, () => {
                void Promise.all(doneList.map((item) => item.undo())).then(
                    () => {
                        setApplied((prev) => {
                            const next = { ...prev };
                            doneList.forEach((item) => delete next[item.uid]);
                            return next;
                        });
                    }
                );
            });
        } catch {
            showErrorToast(
                t('today.saveFailed', 'Could not save. Nothing changed.')
            );
        } finally {
            setBusy(false);
        }
    };

    // Next 5 days after tomorrow (days 2..6 from today) with their task count.
    const nextFiveDays = weekDayCounts(today, dayCounts).slice(2);

    const moreMenu = (entry: LateTask): MenuEntry[] => {
        const kinds = replanKinds(entry.task);
        const uid = entry.task.uid as string;
        const entries: MenuEntry[] = [];
        if (kinds.has('day')) {
            nextFiveDays.forEach(({ date, count }) => {
                entries.push({
                    key: `day-${date}`,
                    label:
                        count === null
                            ? formatShortDay(date)
                            : `${formatShortDay(date)} (${count})`,
                    onSelect: () =>
                        void applySingle(entry, { kind: 'day', date }),
                });
            });
            entries.push('separator');
        }
        if (kinds.has('horizon')) {
            entries.push(
                {
                    key: 'week',
                    label: t('upcoming.thisWeek', 'This week'),
                    onSelect: () =>
                        void applySingle(entry, {
                            kind: 'horizon',
                            horizon: 'week',
                        }),
                },
                {
                    key: 'next_week',
                    label: t('upcoming.nextWeek', 'Next week'),
                    onSelect: () =>
                        void applySingle(entry, {
                            kind: 'horizon',
                            horizon: 'next_week',
                        }),
                },
                {
                    key: 'this_month',
                    label: t('upcoming.thisMonth', 'This month'),
                    onSelect: () =>
                        void applySingle(entry, {
                            kind: 'horizon',
                            horizon: 'this_month',
                        }),
                },
                {
                    key: 'someday',
                    label: t('today.later', 'Later'),
                    onSelect: () =>
                        void applySingle(entry, {
                            kind: 'horizon',
                            horizon: 'someday',
                        }),
                }
            );
        }
        if (kinds.has('day')) {
            entries.push('separator', {
                key: 'pick',
                label: t('today.pickDate', 'Pick a date…'),
                onSelect: () => setPickingDateUid(uid),
            });
        }
        if (kinds.has('drop')) {
            entries.push('separator', {
                key: 'drop',
                label: t('today.replanDrop', 'Drop'),
                danger: true,
                onSelect: () => void applySingle(entry, { kind: 'drop' }),
            });
        }
        return entries;
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={t(
                    'today.replanTitle',
                    'Replan overdue ({{count}})',
                    {
                        count: rows.length,
                    }
                )}
                className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface shadow-xl"
            >
                <div className="flex items-center justify-between gap-2 border-b border-outline-variant/60 px-5 py-3.5">
                    <h2 className="text-title font-semibold text-surface-on">
                        {t('today.replanTitle', 'Replan overdue ({{count}})', {
                            count: rows.length,
                        })}
                    </h2>
                    <IconButton
                        label={t('common.close', 'Close')}
                        onClick={onClose}
                    >
                        <XMarkIcon />
                    </IconButton>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/40 bg-surface-low px-5 py-2.5">
                    <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || openTasks.length === 0}
                        onClick={() =>
                            void applyBulk(
                                allTomorrowChoices(openTasks, today),
                                t(
                                    'today.allMovedTomorrow',
                                    'Overdue tasks moved to tomorrow'
                                )
                            )
                        }
                    >
                        {t('today.allTomorrow', 'All to tomorrow')}
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || openTasks.length === 0}
                        onClick={() =>
                            void applyBulk(
                                spreadOverdueChoices(
                                    openTasks,
                                    today,
                                    plannedByDay
                                ),
                                t(
                                    'today.spreadDone',
                                    'Overdue tasks spread over 7 days'
                                )
                            )
                        }
                    >
                        {t('today.spreadSevenDays', 'Spread over 7 days')}
                    </Button>
                </div>

                <div className="flex-1 divide-y divide-outline-variant/40 overflow-y-auto px-5 py-2">
                    {rows.map((entry) => {
                        const uid = entry.task.uid as string;
                        const rowApplied = applied[uid];
                        const kinds = replanKinds(entry.task);
                        return (
                            <div
                                key={uid}
                                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-body-m font-medium text-surface-on">
                                        {entry.task.name}
                                    </div>
                                    {entry.task.due_date && (
                                        <div className="text-xs tabular-nums text-surface-on-variant">
                                            {formatDue(entry.task.due_date)}
                                        </div>
                                    )}
                                </div>

                                {rowApplied ? (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-surface-on-variant">
                                            {rowApplied.label}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => void undoRow(uid)}
                                        >
                                            {t('common.undo', 'Undo')}
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap items-center gap-1">
                                        {kinds.has('day') && (
                                            <>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        void applySingle(
                                                            entry,
                                                            {
                                                                kind: 'day',
                                                                date: today,
                                                            }
                                                        )
                                                    }
                                                >
                                                    {t('today.title', 'Today')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        void applySingle(
                                                            entry,
                                                            {
                                                                kind: 'day',
                                                                date: tomorrow,
                                                            }
                                                        )
                                                    }
                                                >
                                                    {t(
                                                        'today.tomorrow',
                                                        'Tomorrow'
                                                    )}
                                                </Button>
                                            </>
                                        )}
                                        {kinds.has('done') && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={busy}
                                                onClick={() =>
                                                    void applySingle(entry, {
                                                        kind: 'done',
                                                    })
                                                }
                                            >
                                                {t('today.replanDone', 'Done')}
                                            </Button>
                                        )}
                                        {kinds.has('skip') && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={busy}
                                                onClick={() =>
                                                    void applySingle(entry, {
                                                        kind: 'skip',
                                                    })
                                                }
                                            >
                                                {t(
                                                    'today.replanSkip',
                                                    'Skip this time'
                                                )}
                                            </Button>
                                        )}
                                        {(kinds.has('day') ||
                                            kinds.has('horizon') ||
                                            kinds.has('drop')) && (
                                            <Menu
                                                entries={moreMenu(entry)}
                                                trigger={(triggerProps) => (
                                                    <Button
                                                        {...triggerProps}
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={busy}
                                                    >
                                                        {t(
                                                            'today.replanMore',
                                                            'More…'
                                                        )}
                                                    </Button>
                                                )}
                                            />
                                        )}
                                        {pickingDateUid === uid && (
                                            <input
                                                type="date"
                                                aria-label={t(
                                                    'today.pickDate',
                                                    'Pick a date…'
                                                )}
                                                className="h-8 rounded-lg border border-outline-variant bg-surface px-2 text-xs text-surface-on"
                                                min={today}
                                                onChange={(event) => {
                                                    const value =
                                                        event.target.value;
                                                    if (value) {
                                                        void applySingle(
                                                            entry,
                                                            {
                                                                kind: 'day',
                                                                date: value,
                                                            }
                                                        );
                                                    }
                                                }}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default OverdueReplanSheet;
