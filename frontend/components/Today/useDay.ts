import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { useToast } from '../Shared/ToastContext';
import {
    applyPlanOps,
    DayResponse,
    fetchDay,
    PlanChangedError,
    PlanOp,
    restorePlan,
} from '../../utils/dayService';
import {
    CalendarEvent,
    fetchCalendarEvents,
} from '../../utils/calendarFeedsService';
import { createTask, toggleTaskCompletion } from '../../utils/tasksService';
import { TASK_STATUS, isTaskDone } from '../../constants/taskStatus';
import { getUserTimezone } from '../../utils/dateUtils';
import { minuteOfDay } from '../DailyPlan/planUtils';
import { useTaskUpdatedEvent } from '../../hooks/useTaskUpdatedEvent';
import { onCaptureSaved } from '../../utils/captureUi';
import { useStore } from '../../store/useStore';
import { applyOpsLocally, tasksOf, toPlanInput } from './dayModel';

const isRecurring = (task: Task) =>
    !!task.recurrence_type && task.recurrence_type !== 'none';

const withTask = (day: DayResponse, saved: Task): DayResponse => {
    const swap = (task: Task) => (task.uid === saved.uid ? saved : task);
    return {
        ...day,
        plan: day.plan && {
            ...day.plan,
            items: day.plan.items.map((item) =>
                item.task_uid === saved.uid ? { ...item, task: saved } : item
            ),
        },
        due: day.due.map(swap),
        overdue: day.overdue.map(swap),
        overdue_planned: day.overdue_planned?.map((task) =>
            task.uid === saved.uid
                ? { ...saved, planned_date: task.planned_date }
                : task
        ),
    };
};

/**
 * Everything the Today page shows for `date`, and every write it makes. Plan
 * writes are optimistic, sent as ops in one transaction with the plan's etag;
 * a plan changed elsewhere reloads instead of overwriting it.
 */
export const useDay = (date: string | undefined) => {
    const { t } = useTranslation();
    const { showErrorToast, showUndoToast } = useToast();
    const calendarEnabled = useStore(
        (state) => state.userSettingsStore.calendarEnabled
    );
    const [day, setDay] = useState<DayResponse | null>(null);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [error, setError] = useState<string | null>(null);
    // Goes up after every load, so views of other days refresh with it.
    const [revision, setRevision] = useState(0);
    const [now, setNow] = useState(() =>
        minuteOfDay(new Date(), getUserTimezone())
    );
    const dayRef = useRef<DayResponse | null>(null);
    dayRef.current = day;
    const loadSeq = useRef(0);

    const reload = useCallback(async () => {
        const seq = ++loadSeq.current;
        try {
            const [next, feed] = await Promise.all([
                fetchDay(date),
                calendarEnabled
                    ? fetchCalendarEvents(date).catch(() => null)
                    : Promise.resolve(null),
            ]);
            if (seq !== loadSeq.current) return;
            setDay(next);
            setEvents(feed?.events ?? []);
            setError(null);
            setRevision((n) => n + 1);
        } catch (err) {
            if (seq !== loadSeq.current) return;
            setError(
                err instanceof Error
                    ? err.message
                    : t('today.loadFailed', 'Could not load the day.')
            );
        }
    }, [date, calendarEnabled, t]);

    useEffect(() => {
        void reload();
    }, [reload]);

    // The clock only matters on today; a tick a minute is enough.
    useEffect(() => {
        if (!day?.is_today) return;
        const timer = window.setInterval(
            () => setNow(minuteOfDay(new Date(), getUserTimezone())),
            60_000
        );
        return () => window.clearInterval(timer);
    }, [day?.is_today]);

    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible') void reload();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () =>
            document.removeEventListener('visibilitychange', onVisible);
    }, [reload]);

    // A save in the task pane: patch the task in place, then refresh the day
    // quietly (its due date may have moved it in or out).
    useTaskUpdatedEvent((saved) => {
        setDay((current) => (current ? withTask(current, saved) : current));
        void reload();
    });

    const fail = useCallback(
        (err: unknown) => {
            if (err instanceof PlanChangedError) {
                showErrorToast(
                    t(
                        'today.planChanged',
                        'The plan changed on another device. It has been reloaded.'
                    )
                );
            } else {
                showErrorToast(
                    t('today.saveFailed', 'Could not save. Nothing changed.')
                );
            }
            void reload();
        },
        [reload, showErrorToast, t]
    );

    const restore = useCallback(
        async (snapshot: DayResponse) => {
            if (!date || !snapshot.plan) return;
            setDay((current) =>
                current ? { ...current, plan: snapshot.plan } : current
            );
            try {
                const written = await restorePlan(
                    date,
                    toPlanInput(snapshot.plan.items),
                    dayRef.current?.etag
                );
                setDay((current) =>
                    current
                        ? {
                              ...current,
                              plan: written.plan,
                              etag: written.etag,
                          }
                        : current
                );
                void reload();
            } catch (err) {
                fail(err);
            }
        },
        [date, fail, reload]
    );

    /**
     * Applies `ops` to the shown day at once, then on the server. `undo`
     * offers an Undo toast that puts the whole earlier plan back.
     */
    const run = useCallback(
        async (ops: PlanOp[], undo?: string) => {
            const current = dayRef.current;
            if (!date || !current || ops.length === 0) return;
            const items = applyOpsLocally(
                current.plan?.items ?? [],
                ops,
                tasksOf(current)
            );
            const plan = current.plan
                ? { ...current.plan, items }
                : {
                      uid: '',
                      date,
                      started_at: null,
                      items,
                  };
            setDay({ ...current, plan });
            try {
                const written = await applyPlanOps(date, ops, current.etag);
                setDay((latest) =>
                    latest
                        ? { ...latest, plan: written.plan, etag: written.etag }
                        : latest
                );
                // Moves and additions change which tasks are due-only members.
                if (ops.some((op) => op.op === 'move' || op.op === 'add')) {
                    void reload();
                }
                if (undo) {
                    showUndoToast(undo, () => {
                        const moved = ops.filter(
                            (op): op is Extract<PlanOp, { op: 'move' }> =>
                                op.op === 'move'
                        );
                        // A move also wrote the other day: take it back first.
                        Promise.all(
                            moved.map((op) =>
                                applyPlanOps(op.to_date, [
                                    { op: 'remove', task_uid: op.task_uid },
                                ])
                            )
                        )
                            .then(() => restore(current))
                            .catch(fail);
                    });
                }
            } catch (err) {
                setDay(current);
                fail(err);
            }
        },
        [date, fail, restore, showUndoToast]
    );

    // Writes ops on another day (postponing a task that is only due today).
    const runOn = useCallback(
        async (otherDate: string, ops: PlanOp[], undo?: string) => {
            try {
                await applyPlanOps(otherDate, ops);
                await reload();
                if (undo) {
                    showUndoToast(undo, () => {
                        applyPlanOps(
                            otherDate,
                            ops.map((op) => ({
                                op: 'remove' as const,
                                task_uid: op.task_uid,
                            }))
                        )
                            .then(reload)
                            .catch(fail);
                    });
                }
            } catch (err) {
                fail(err);
            }
        },
        [fail, reload, showUndoToast]
    );

    const toggle = useCallback(
        async (task: Task) => {
            const current = dayRef.current;
            if (!current || !task.uid) return;
            const done = isTaskDone(task.status);
            const optimistic = {
                ...task,
                status: done ? TASK_STATUS.NOT_STARTED : TASK_STATUS.DONE,
                completed_at: done ? null : new Date().toISOString(),
            } as Task;
            setDay(withTask(current, optimistic));
            try {
                const saved = await toggleTaskCompletion(task.uid, task);
                // Completing a recurring task moves it to its next date: the
                // plan shows that day's occurrence as done.
                if (isRecurring(task)) {
                    await reload();
                    return;
                }
                setDay((latest) => (latest ? withTask(latest, saved) : latest));
                if (!done) {
                    showUndoToast(
                        t('today.completed', '“{{name}}” done', {
                            name: task.name,
                        }),
                        () => {
                            toggleTaskCompletion(task.uid as string, saved)
                                .then((back) =>
                                    setDay((latest) =>
                                        latest ? withTask(latest, back) : latest
                                    )
                                )
                                .catch(fail);
                        }
                    );
                }
            } catch (err) {
                setDay(current);
                fail(err);
            }
        },
        [fail, reload, showUndoToast, t]
    );

    // Quick add: a task with no date (the day is the plan, not a deadline).
    const create = useCallback(
        async (name: string) => {
            if (!date) return;
            const task = await createTask({
                name,
                status: TASK_STATUS.NOT_STARTED,
                completed_at: null,
            } as unknown as Task);
            if (!task.uid) return;
            try {
                await applyPlanOps(date, [{ op: 'add', task_uid: task.uid }]);
            } finally {
                await reload();
            }
        },
        [date, reload]
    );

    // Tasks saved from the capture box opened on Today go on the day.
    useEffect(
        () =>
            onCaptureSaved(({ scope, items, undone }) => {
                if (scope !== 'today' || !date) return;
                const uids = items
                    .filter((item) => item.target === 'task' && item.uid)
                    .map((item) => item.uid as string);
                if (uids.length === 0) return;
                applyPlanOps(
                    date,
                    uids.map((uid) =>
                        undone
                            ? { op: 'remove' as const, task_uid: uid }
                            : { op: 'add' as const, task_uid: uid }
                    )
                )
                    .then(reload)
                    .catch(fail);
            }),
        [date, fail, reload]
    );

    const tasks = useMemo(() => (day ? tasksOf(day) : new Map()), [day]);

    return {
        day,
        events,
        error,
        now: day?.is_today ? now : null,
        tasks,
        revision,
        reload,
        run,
        runOn,
        toggle,
        create,
    };
};
