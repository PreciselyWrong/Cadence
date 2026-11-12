import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    CadenceCalendar,
    CadenceEntry,
    CadenceHabit,
    CadenceQuickValue,
    createRow,
    deleteRow,
    fetchCadenceCalendar,
    fetchCadenceHabits,
    fetchRows,
} from '../../utils/cadenceHabitsService';
import { useToast } from '../Shared/ToastContext';
import { dayHabits, habitMarks, oneTapAmount } from './dayHabits';

/**
 * The day's habits for Today: the habits evaluated on `date`, their times
 * (calendar endpoint) and quick values; `log` adds an entry with an undo
 * toast, as the Habits page does. Off when `enabled` is false.
 */
export const useDayHabits = (date: string, enabled: boolean) => {
    const { t } = useTranslation();
    const { showUndoToast, showErrorToast } = useToast();
    const [habits, setHabits] = useState<CadenceHabit[]>([]);
    const [calendar, setCalendar] = useState<CadenceCalendar | null>(null);
    const [quick, setQuick] = useState<Record<string, CadenceQuickValue[]>>({});
    const seq = useRef(0);

    const load = useCallback(async () => {
        if (!enabled) return;
        const mine = ++seq.current;
        try {
            const [list, days] = await Promise.all([
                fetchCadenceHabits({ date }),
                fetchCadenceCalendar(date, date).catch(() => null),
            ]);
            if (seq.current !== mine) return;
            setHabits(list.habits);
            setCalendar(days);
        } catch (error) {
            // Habits are extra on Today: the day still shows without them.
            console.error('Failed to load the day habits:', error);
        }
    }, [date, enabled]);

    useEffect(() => {
        void load();
    }, [load]);

    const { open, done } = useMemo(() => dayHabits(habits), [habits]);

    // Quick values only for the quantity habits listed (one request each).
    const fetched = useRef(new Set<string>());
    useEffect(() => {
        open.forEach((habit) => {
            if (!habit.goal || habit.goal.goal_type === 'BINARY') return;
            if (fetched.current.has(habit.uid)) return;
            fetched.current.add(habit.uid);
            fetchRows<CadenceQuickValue>(habit.uid, 'quick-values')
                .then((rows) =>
                    setQuick((current) => ({
                        ...current,
                        [habit.uid]: [...rows].sort(
                            (a, b) => a.sort_order - b.sort_order
                        ),
                    }))
                )
                .catch(() => undefined);
        });
    }, [open]);

    const log = useCallback(
        async (habit: CadenceHabit, amountMinor: number) => {
            let entry: CadenceEntry;
            try {
                entry = await createRow<CadenceEntry>(habit.uid, 'entries', {
                    value_minor: amountMinor,
                    note: null,
                });
            } catch (error) {
                console.error('Failed to log an entry:', error);
                showErrorToast(
                    t('today.habitLogFailed', 'Could not log the habit.')
                );
                return;
            }
            await load();
            showUndoToast(
                t('cadenceHabits.entry.logged', '{{name}} logged', {
                    name: habit.name,
                }),
                () => {
                    deleteRow(habit.uid, 'entries', entry.uid)
                        .then(() => load())
                        .catch(() =>
                            showErrorToast(
                                t(
                                    'cadenceHabits.entry.undoFailed',
                                    'Could not undo the entry.'
                                )
                            )
                        );
                }
            );
        },
        [load, showErrorToast, showUndoToast, t]
    );

    const marks = useMemo(
        () => habitMarks(calendar, date, [...open, ...done]),
        [calendar, date, open, done]
    );
    const amountOf = (habit: CadenceHabit) =>
        oneTapAmount(habit, quick[habit.uid]);

    return { open, done, marks, log, amountOf, reload: load };
};
