import { getCurrentLocale } from '../../utils/dateUtils';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { eachDayOfInterval, format, isToday } from 'date-fns';
import { CalendarEvent, coversDay } from './taskEvents';

interface CalendarAgendaViewProps {
    start: Date;
    end: Date;
    events: CalendarEvent[];
    onEventClick?: (event: CalendarEvent) => void;
    showWeekends?: boolean;
}

// Chronological list of the loaded window, one heading per day that has
// something on it. Opens scrolled to today (or the next day with items).
const CalendarAgendaView: React.FC<CalendarAgendaViewProps> = ({
    start,
    end,
    events,
    onEventClick,
    showWeekends = true,
}) => {
    const { t } = useTranslation();
    const listRef = useRef<HTMLDivElement>(null);
    const todayKey = format(new Date(), 'yyyy-MM-dd');

    const days = eachDayOfInterval({ start, end })
        .filter(
            (day) => showWeekends || (day.getDay() !== 0 && day.getDay() !== 6)
        )
        .map((day) => ({
            day,
            key: format(day, 'yyyy-MM-dd'),
            items: events
                .filter((event) => coversDay(event, day))
                .sort(
                    (a, b) =>
                        Number(!!b.allDay) - Number(!!a.allDay) ||
                        a.start.getTime() - b.start.getTime()
                ),
        }))
        .filter((entry) => entry.items.length > 0);

    const anchorKey = days.find((entry) => entry.key >= todayKey)?.key;

    useEffect(() => {
        if (!anchorKey || !listRef.current) return;
        const target = listRef.current.querySelector<HTMLElement>(
            `[data-day="${anchorKey}"]`
        );
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ block: 'start' });
        }
    }, [anchorKey, start.getTime()]);

    return (
        <div
            ref={listRef}
            className="h-full overflow-y-auto bg-white dark:bg-gray-700 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600"
            data-testid="calendar-agenda"
        >
            {days.length === 0 && (
                <p className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
                    {t('calendar.agendaEmpty', 'Nothing scheduled')}
                </p>
            )}
            {days.map(({ day, key, items }) => (
                <section key={key} data-day={key}>
                    <h3
                        className={`sticky top-0 z-10 px-4 py-2 text-xs font-semibold tracking-widest uppercase border-b border-gray-100 dark:border-gray-600 ${
                            isToday(day)
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
                                : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                        }`}
                    >
                        {format(day, 'EEEE d MMMM', {
                            locale: getCurrentLocale(),
                        })}
                    </h3>
                    <ul>
                        {items.map((event) => (
                            <li key={`${key}-${event.id}`}>
                                <button
                                    type="button"
                                    onClick={() => onEventClick?.(event)}
                                    className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-600 ${
                                        event.readOnly ? 'opacity-60' : ''
                                    }`}
                                >
                                    <span className="w-24 shrink-0 text-xs text-gray-400 dark:text-gray-500">
                                        {event.allDay
                                            ? t('calendar.allDay', 'All day')
                                            : `${format(event.start, 'HH:mm')} – ${format(event.end, 'HH:mm')}`}
                                    </span>
                                    <span
                                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                                        style={{
                                            backgroundColor:
                                                event.color || '#3b82f6',
                                        }}
                                    />
                                    <span className="truncate text-gray-700 dark:text-gray-200">
                                        {event.title}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
};

export default CalendarAgendaView;
