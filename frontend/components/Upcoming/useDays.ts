import { useCallback, useEffect, useRef, useState } from 'react';
import { useTaskUpdatedEvent } from '../../hooks/useTaskUpdatedEvent';
import { fetchDay, DayResponse } from '../../utils/dayService';
import { fetchTasks } from '../../utils/tasksService';
import { getFirstDayOfWeek } from '../../utils/profileService';
import type { Task } from '../../entities/Task';
import { datesHolding } from './planOps';
import {
    CalendarEvent,
    fetchCalendarEvents,
} from '../../utils/calendarFeedsService';

/**
 * The days of the board, one `fetchDay` each, in parallel. A new set of days
 * loads only the days not loaded yet; `reload(dates)` refetches some days
 * after a write, `reload()` all of them. `mutate` applies a local change at
 * once (optimistic write) and drops the answers of loads already in flight
 * for those days, so a stale answer cannot undo it. A response for a day that
 * left the board, or that a newer request superseded, is dropped.
 */
export const useDays = (dates: string[]) => {
    const key = dates.join(',');
    const keyRef = useRef(key);
    keyRef.current = key;
    const [days, setDaysState] = useState<Record<string, DayResponse>>({});
    const daysRef = useRef(days);
    const [error, setError] = useState<string | null>(null);
    const seqs = useRef<Record<string, number>>({});

    const setDays = useCallback(
        (
            update: (
                current: Record<string, DayResponse>
            ) => Record<string, DayResponse>
        ) => {
            // The ref first: a write queued right after reads its etags
            // before React renders (an updater would run only then).
            const next = update(daysRef.current);
            daysRef.current = next;
            setDaysState(next);
        },
        []
    );

    const loadOne = useCallback(
        async (date: string) => {
            const seq = (seqs.current[date] ?? 0) + 1;
            seqs.current[date] = seq;
            try {
                const day = await fetchDay(date);
                if (seqs.current[date] !== seq) return;
                if (!keyRef.current.split(',').includes(date)) return;
                setDays((current) => ({ ...current, [date]: day }));
                setError(null);
            } catch (err) {
                if (seqs.current[date] !== seq) return;
                setError(
                    err instanceof Error
                        ? err.message
                        : 'Failed to load the day.'
                );
            }
        },
        [setDays]
    );

    const reload = useCallback(
        async (only?: string[]) => {
            const shown = keyRef.current ? keyRef.current.split(',') : [];
            const wanted = only
                ? [...new Set(only)].filter((date) => shown.includes(date))
                : shown;
            await Promise.all(wanted.map((date) => loadOne(date)));
        },
        [loadOne]
    );

    const mutate = useCallback(
        (
            dates: string[],
            update: (
                current: Record<string, DayResponse>
            ) => Record<string, DayResponse>
        ) => {
            dates.forEach((date) => {
                seqs.current[date] = (seqs.current[date] ?? 0) + 1;
            });
            setDays(update);
        },
        [setDays]
    );

    // A new set of days: drop the ones that left, load the new ones only.
    useEffect(() => {
        const wanted = key ? key.split(',') : [];
        setDays((current) =>
            Object.fromEntries(
                Object.entries(current).filter(([date]) =>
                    wanted.includes(date)
                )
            )
        );
        void reload(wanted.filter((date) => !daysRef.current[date]));
    }, [key, reload, setDays]);

    // A task saved in the side pane: refresh the days that show it, the day
    // it is now due, and today when it may have become overdue.
    useTaskUpdatedEvent((saved) => {
        const current = daysRef.current;
        const due = saved.due_date ? saved.due_date.slice(0, 10) : null;
        const today = Object.values(current).find((day) => day.is_today)?.date;
        const wanted = [
            ...datesHolding(current, saved.uid as string),
            ...(due ? [due] : []),
            ...(today && due && due < today ? [today] : []),
        ];
        void reload(wanted);
    });

    return {
        days,
        daysRef,
        error,
        loading: dates.some((date) => !days[date]),
        reload,
        mutate,
    };
};

/**
 * Calendar events of each day, empty when calendar feeds are off. Like
 * useDays, a new set of days fetches only the days not fetched yet (moving
 * the calendar by a day costs one request) and drops the ones that left.
 */
export const useCalendarEvents = (dates: string[], enabled: boolean) => {
    const key = dates.join(',');
    const [events, setEvents] = useState<Record<string, CalendarEvent[]>>({});
    // Days asked for, in this generation (a new one when feeds go off).
    const asked = useRef<Set<string>>(new Set());
    const generation = useRef(0);
    useEffect(() => {
        const wanted = enabled && key ? key.split(',') : [];
        if (!enabled) generation.current += 1;
        asked.current = new Set(
            [...asked.current].filter((date) => wanted.includes(date))
        );
        setEvents((current) => {
            const kept = Object.entries(current).filter(([date]) =>
                wanted.includes(date)
            );
            return kept.length === Object.keys(current).length
                ? current
                : Object.fromEntries(kept);
        });
        const mine = generation.current;
        wanted
            .filter((date) => !asked.current.has(date))
            .forEach((date) => {
                asked.current.add(date);
                fetchCalendarEvents(date)
                    .then((feed) => feed.events ?? [])
                    .catch(() => [] as CalendarEvent[])
                    .then((list) => {
                        if (
                            generation.current !== mine ||
                            !asked.current.has(date)
                        ) {
                            return;
                        }
                        setEvents((current) => ({ ...current, [date]: list }));
                    });
            });
    }, [key, enabled]);
    return events;
};

/**
 * Open tasks for the Horizons layout, one list fetch (only while `enabled`,
 * again after a write or a save in the side pane), and the user's first day
 * of the week (the week a "This week" task belongs to), fetched once.
 */
export const useHorizonTasks = (enabled: boolean) => {
    const [tasks, setTasks] = useState<Task[] | null>(null);
    const [firstDayOfWeek, setFirstDayOfWeek] = useState(1);
    const [error, setError] = useState<string | null>(null);
    const seq = useRef(0);

    const reload = useCallback(async () => {
        const mine = ++seq.current;
        try {
            const result = await fetchTasks('?status=active');
            if (seq.current !== mine) return;
            setTasks(result.tasks);
            setError(null);
        } catch (err) {
            if (seq.current !== mine) return;
            setError(
                err instanceof Error ? err.message : 'Failed to load tasks.'
            );
        }
    }, []);

    useEffect(() => {
        if (enabled) void reload();
    }, [enabled, reload]);

    // The board needs it in both layouts: week labels, This week's days.
    useEffect(() => {
        getFirstDayOfWeek()
            .then(setFirstDayOfWeek)
            .catch(() => undefined);
    }, []);

    useTaskUpdatedEvent(() => {
        if (enabled) void reload();
    });

    return { tasks, firstDayOfWeek, error, reload };
};

/**
 * The tasks of Inbox › « Tâches à classer » (`GET /tasks?type=unsorted`,
 * docs/41-auto-classify.md), for the board's inbox column: fetched while
 * `enabled`, again after a write or a save in the side pane. Null until the
 * first answer; a failed first load shows none.
 */
export const useUnsortedTasks = (enabled: boolean) => {
    const [tasks, setTasks] = useState<Task[] | null>(null);
    const seq = useRef(0);

    const reload = useCallback(async () => {
        const mine = ++seq.current;
        try {
            const result = await fetchTasks('?type=unsorted');
            if (seq.current !== mine) return;
            setTasks(result.tasks);
        } catch {
            if (seq.current !== mine) return;
            setTasks((current) => current ?? []);
        }
    }, []);

    useEffect(() => {
        if (enabled) void reload();
    }, [enabled, reload]);

    useTaskUpdatedEvent(() => {
        if (enabled) void reload();
    });

    return { tasks, reload };
};
