import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    addDays,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameMonth,
    isToday,
    startOfMonth,
    startOfWeek,
    startOfYear,
} from 'date-fns';
import { CalendarEvent } from './taskEvents';

type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Items per local day (YYYY-MM-DD); a whole-day bar counts on each day.
export const countByDay = (events: CalendarEvent[]): Map<string, number> => {
    const counts = new Map<string, number>();
    const add = (day: Date) => {
        const key = format(day, 'yyyy-MM-dd');
        counts.set(key, (counts.get(key) || 0) + 1);
    };
    events.forEach((event) => {
        if (!event.allDay) {
            add(event.start);
            return;
        }
        for (let day = event.start; day < event.end; day = addDays(day, 1)) {
            add(day);
        }
    });
    return counts;
};

// Five steps of blue, from none to 4 or more items.
const HEAT = [
    '',
    'bg-blue-100 dark:bg-blue-900/40',
    'bg-blue-200 dark:bg-blue-800/60',
    'bg-blue-400 text-white dark:bg-blue-700',
    'bg-blue-600 text-white dark:bg-blue-500',
];
export const heatLevel = (count: number) => Math.min(count, HEAT.length - 1);

interface MonthGridProps {
    month: Date;
    weekStartsOn: WeekStart;
    counts?: Map<string, number>;
    selected?: Date;
    onDayClick: (day: Date) => void;
    compact?: boolean;
}

// One month as a small grid of day numbers; shared by the Year view and
// the mini calendar.
export const MonthGrid: React.FC<MonthGridProps> = ({
    month,
    weekStartsOn,
    counts,
    selected,
    onDayClick,
    compact,
}) => {
    const { t } = useTranslation();
    const days = eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn }),
    });
    const selectedKey = selected ? format(selected, 'yyyy-MM-dd') : null;
    const initials = days.slice(0, 7).map((day) => format(day, 'EEEEE'));

    return (
        <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
            {initials.map((initial, index) => (
                <div
                    key={`h-${index}`}
                    className="text-gray-400 dark:text-gray-500 font-medium"
                >
                    {initial}
                </div>
            ))}
            {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const inMonth = isSameMonth(day, month);
                const count = (inMonth && counts?.get(key)) || 0;
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onDayClick(day)}
                        title={
                            count
                                ? t('calendar.yearItems', {
                                      count,
                                      date: format(day, 'PP'),
                                      defaultValue: '{{date}}: {{count}} items',
                                  })
                                : undefined
                        }
                        aria-label={format(day, 'PP')}
                        data-count={count || undefined}
                        className={`${compact ? 'h-6' : 'h-7'} rounded ${
                            inMonth
                                ? 'text-gray-700 dark:text-gray-200'
                                : 'text-gray-300 dark:text-gray-600'
                        } ${HEAT[heatLevel(count)]} ${
                            isToday(day) ? 'ring-1 ring-blue-500' : ''
                        } ${
                            key === selectedKey
                                ? 'outline outline-2 outline-blue-500'
                                : ''
                        } hover:bg-gray-100 dark:hover:bg-gray-600`}
                    >
                        {format(day, 'd')}
                    </button>
                );
            })}
        </div>
    );
};

interface CalendarYearViewProps {
    currentDate: Date;
    events: CalendarEvent[];
    weekStartsOn: WeekStart;
    onDayClick: (day: Date) => void;
}

// Twelve month grids; each day is shaded by how many items it has.
const CalendarYearView: React.FC<CalendarYearViewProps> = ({
    currentDate,
    events,
    weekStartsOn,
    onDayClick,
}) => {
    const counts = countByDay(events);
    const yearStart = startOfYear(currentDate);
    const months = Array.from(
        { length: 12 },
        (_, index) => new Date(yearStart.getFullYear(), index, 1)
    );

    return (
        <div
            className="h-full overflow-y-auto bg-white dark:bg-gray-700 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 p-4"
            data-testid="calendar-year"
        >
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {months.map((month) => (
                    <section key={month.getMonth()}>
                        <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
                            {format(month, 'MMMM')}
                        </h3>
                        <MonthGrid
                            month={month}
                            weekStartsOn={weekStartsOn}
                            counts={counts}
                            onDayClick={onDayClick}
                        />
                    </section>
                ))}
            </div>
        </div>
    );
};

export default CalendarYearView;
