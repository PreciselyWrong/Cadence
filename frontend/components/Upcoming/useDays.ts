import { useCallback, useEffect, useRef, useState } from 'react';
import { useTaskUpdatedEvent } from '../../hooks/useTaskUpdatedEvent';
import { fetchDay, DayResponse } from '../../utils/dayService';
import { fetchTasks } from '../../utils/tasksService';
import { getFirstDayOfWeek } from '../../utils/profileService';
import type { Task } from '../../entities/Task';
import {
    CalendarEvent,
    fetchCalendarEvents,
} from '../../utils/calendarFeedsService';

/**
 * The days of the board, one `fetchDay` each, in parallel. `reload(dates)`
 * refetches some days after a write; `reload()` refetches all of them. A
 * response for a day that left the board, or that a newer request superseded,
 * is dropped.
 */
export const useDays = (dates: string[]) => {
    const key = dates.join(',');
    const keyRef = useRef(key);
    keyRef.current = key;
    const [days, setDays] = useState<Record<string, DayResponse>>({});
    const [error, setError] = useState<string | null>(null);
    const seqs = useRef<Record<string, number>>({});

    const loadOne = useCallback(async (date: string) => {
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
                err instanceof Error ? err.message : 'Failed to load the day.'
            );
        }
    }, []);

    const reload = useCallback(
        async (only?: string[]) => {
            const wanted =
                only ?? (keyRef.current ? keyRef.current.split(',') : []);
            await Promise.all(wanted.map((date) => loadOne(date)));
        },
        [loadOne]
    );

    // A new set of days: drop the ones that left, load the new ones.
    useEffect(() => {
        const wanted = key ? key.split(',') : [];
        setDays((current) =>
            Object.fromEntries(
                Object.entries(current).filter(([date]) =>
                    wanted.includes(date)
                )
            )
        );
        void reload(wanted);
    }, [key, reload]);

    // A task saved in the side pane can move it in or out of any day.
    useTaskUpdatedEvent(() => {
        void reload();
    });

    return {
        days,
        error,
        loading: dates.some((date) => !days[date]),
        reload,
    };
};

/** Calendar events of each day, empty when calendar feeds are off. */
export const useCalendarEvents = (dates: string[], enabled: boolean) => {
    const key = dates.join(',');
    const [events, setEvents] = useState<Record<string, CalendarEvent[]>>({});
    useEffect(() => {
        if (!enabled || !key) {
            setEvents({});
            return;
        }
        let cancelled = false;
        Promise.all(
            key.split(',').map((date) =>
                fetchCalendarEvents(date)
                    .then((feed) => [date, feed.events ?? []] as const)
                    .catch(() => [date, [] as CalendarEvent[]] as const)
            )
        ).then((entries) => {
            if (!cancelled) setEvents(Object.fromEntries(entries));
        });
        return () => {
            cancelled = true;
        };
    }, [key, enabled]);
    return events;
};

/**
 * Open tasks for the Horizons layout, one list fetch, and the user's first
 * day of the week (the week a "This week" task belongs to). Loaded only
 * while `enabled`; refetched after a write or a save in the side pane.
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
        if (!enabled) return;
        void reload();
        getFirstDayOfWeek()
            .then(setFirstDayOfWeek)
            .catch(() => undefined);
    }, [enabled, reload]);

    useTaskUpdatedEvent(() => {
        if (enabled) void reload();
    });

    return { tasks, firstDayOfWeek, error, reload };
};
