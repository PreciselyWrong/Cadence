import { addDays, addMinutes } from 'date-fns';
import type { CadenceCalendar } from '../../utils/cadenceHabitsService';
import { argbToHex } from '../../utils/cadenceHabitUtils';
import { CalendarEvent, HABIT_COLOR, localDateTime } from './taskEvents';

// A habit with a reminder is drawn as a short block at that time.
export const HABIT_BLOCK_MINUTES = 30;

// One calendar item per habit and due day: a whole-day chip, or a timed block
// when the habit has a reminder that day. A done day gets a check mark.
export const habitsToEvents = (calendar: CadenceCalendar): CalendarEvent[] =>
    calendar.habits.flatMap((habit) =>
        habit.days.flatMap((day) => {
            const start = localDateTime(day.date, day.time);
            if (!start) return [];
            const timed = Boolean(day.time);
            return [
                {
                    id: `habit-${habit.uid}-${day.date}`,
                    title: day.done ? `✓ ${habit.name}` : habit.name,
                    start,
                    end: timed
                        ? addMinutes(start, HABIT_BLOCK_MINUTES)
                        : addDays(start, 1),
                    type: 'event' as const,
                    color: argbToHex(habit.color_argb) ?? HABIT_COLOR,
                    allDay: !timed,
                    readOnly: true,
                    habitUid: habit.uid,
                },
            ];
        })
    );
