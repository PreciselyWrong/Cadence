import type { DayResponse } from '../../utils/dayService';
import { dayLines } from '../Today/dayModel';
import { dayLoad } from './groupCards';
import { weekDates } from './horizons';

export interface WeekLoad {
    // Minutes planned on open lines, from today to the end of the week.
    planned: number;
    // Minutes of the day hours over the same days.
    available: number;
    // False while one of those days is not loaded: the planned time is a floor.
    complete: boolean;
}

/**
 * The rest of this week at a glance, for the Days layout's horizon strip:
 * open plan lines from today to the last day of the week, against each day's
 * hours (`defaultMinutes` for a day not loaded or without hours).
 */
export const weekLoad = (
    days: Record<string, DayResponse | undefined>,
    today: string,
    firstDayOfWeek: number,
    defaultMinutes: number
): WeekLoad =>
    weekDates(today, firstDayOfWeek)
        .filter((date) => date >= today)
        .reduce<WeekLoad>(
            (sum, date) => {
                const day = days[date];
                if (!day) {
                    return {
                        ...sum,
                        available: sum.available + defaultMinutes,
                        complete: false,
                    };
                }
                const lines = dayLines(day.plan?.items ?? [], day.due, date);
                const hours = day.day_hours;
                return {
                    planned:
                        sum.planned +
                        dayLoad([...lines.timed, ...lines.anytime]),
                    available:
                        sum.available +
                        (hours ? hours.end - hours.start : defaultMinutes),
                    complete: sum.complete,
                };
            },
            { planned: 0, available: 0, complete: true }
        );
