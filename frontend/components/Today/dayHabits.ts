import type {
    CadenceCalendar,
    CadenceHabit,
    CadenceQuickValue,
} from '../../utils/cadenceHabitsService';
import { argbToHex, kindOf, unitOfGoal } from '../../utils/cadenceHabitUtils';

/**
 * The habits of a day on Today, as on Android's « Ma journée » and the
 * Habits page summary: goal habits (not limits, trackers or abstinences)
 * planned that day and not paused, in their own order. Done means the
 * period is validated.
 */
export const dayHabits = (
    habits: CadenceHabit[]
): { open: CadenceHabit[]; done: CadenceHabit[] } => {
    const due = habits
        .filter(
            (habit) =>
                habit.active &&
                !habit.archived &&
                !!habit.goal &&
                kindOf(habit.goal) === 'goal' &&
                !!habit.status.evaluation?.is_planned &&
                !habit.status.evaluation.is_paused
        )
        .sort((a, b) => a.sort_order - b.sort_order);
    const done = (habit: CadenceHabit) =>
        !!habit.status.evaluation?.validates_period;
    return {
        open: due.filter((habit) => !done(habit)),
        done: due.filter(done),
    };
};

/**
 * What one tap logs, as the Habits page card does: 1 for a yes/no habit,
 * else the first quick value, else one unit.
 */
export const oneTapAmount = (
    habit: CadenceHabit,
    quickValues: CadenceQuickValue[] = []
): number => {
    const goal = habit.goal;
    if (!goal || goal.goal_type === 'BINARY') return 1;
    return quickValues[0]?.amount_minor ?? unitOfGoal(goal)?.scale ?? 1;
};

/** A habit at a time of day, drawn on the day calendar. */
export interface HabitMark {
    uid: string;
    name: string;
    // Minutes after midnight.
    minute: number;
    color: string | null;
    done: boolean;
}

const minuteOf = (time: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!match) return null;
    const minute = Number(match[1]) * 60 + Number(match[2]);
    return minute >= 0 && minute < 24 * 60 ? minute : null;
};

/**
 * The day's habits that have a time (their reminder that day, from the
 * calendar endpoint), limited to `due` (the habits listed on Today), by time.
 */
export const habitMarks = (
    calendar: CadenceCalendar | null,
    date: string,
    due: CadenceHabit[]
): HabitMark[] => {
    if (!calendar) return [];
    const byUid = new Map(due.map((habit) => [habit.uid, habit]));
    return calendar.habits
        .flatMap((entry) => {
            const habit = byUid.get(entry.uid);
            const day = entry.days.find((d) => d.date === date);
            const minute = day?.time ? minuteOf(day.time) : null;
            if (!habit || !day || minute === null) return [];
            return [
                {
                    uid: entry.uid,
                    name: entry.name,
                    minute,
                    color: argbToHex(entry.color_argb),
                    done:
                        day.done || !!habit.status.evaluation?.validates_period,
                },
            ];
        })
        .sort((a, b) => a.minute - b.minute);
};
