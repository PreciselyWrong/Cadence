import React, { useState, useEffect } from 'react';
import {
    format,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    isSameMonth,
    isToday,
    startOfWeek,
    endOfWeek,
    addDays,
} from 'date-fns';
import { useTranslation } from 'react-i18next';
import {
    getFirstDayOfWeek,
    getLocaleFirstDayOfWeek,
} from '../../utils/profileService';

import { CalendarEvent, coversDay, layoutAllDayWeek } from './taskEvents';

interface CalendarMonthViewProps {
    currentDate: Date;
    events: CalendarEvent[];
    onDateClick?: (date: Date) => void;
    onEventClick?: (event: CalendarEvent) => void;
    onEventDrop?: (eventId: string, newDate: Date) => void;
    showWeekends?: boolean;
}

const CalendarMonthView: React.FC<CalendarMonthViewProps> = ({
    currentDate,
    events,
    onDateClick,
    onEventClick,
    onEventDrop,
    showWeekends = true,
}) => {
    const { t } = useTranslation();
    const [firstDayOfWeek, setFirstDayOfWeek] = useState(1);
    const [draggedEventId, setDraggedEventId] = useState<string | null>(null);

    useEffect(() => {
        const loadFirstDayOfWeek = async () => {
            try {
                setFirstDayOfWeek(await getFirstDayOfWeek());
            } catch {
                setFirstDayOfWeek(getLocaleFirstDayOfWeek(navigator.language));
            }
        };
        loadFirstDayOfWeek();
    }, []);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, {
        weekStartsOn: firstDayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });
    const calendarEnd = endOfWeek(monthEnd, {
        weekStartsOn: firstDayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const getAllWeekDays = () => [
        t('weekdays.sunday', 'Sun'),
        t('weekdays.monday', 'Mon'),
        t('weekdays.tuesday', 'Tue'),
        t('weekdays.wednesday', 'Wed'),
        t('weekdays.thursday', 'Thu'),
        t('weekdays.friday', 'Fri'),
        t('weekdays.saturday', 'Sat'),
    ];

    const isShown = (dayOfWeek: number) =>
        showWeekends || (dayOfWeek !== 0 && dayOfWeek !== 6);
    const getWeekDays = () => {
        const allDays = getAllWeekDays();
        return [0, 1, 2, 3, 4, 5, 6]
            .map((offset) => (firstDayOfWeek + offset) % 7)
            .filter(isShown)
            .map((dayOfWeek) => allDays[dayOfWeek]);
    };
    const gridColumns = {
        gridTemplateColumns: `repeat(${showWeekends ? 7 : 5}, minmax(0, 1fr))`,
    };

    const handleDragStart = (event: CalendarEvent, e: React.DragEvent) => {
        e.stopPropagation();
        setDraggedEventId(event.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', event.id);
    };

    const handleDragEnd = () => setDraggedEventId(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (day: Date, e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const eventId = e.dataTransfer.getData('text/plain');
        if (eventId && onEventDrop) onEventDrop(eventId, day);
        setDraggedEventId(null);
    };

    return (
        <div className="h-full bg-white dark:bg-gray-700 rounded-xl shadow-sm overflow-hidden flex flex-col border border-gray-200 dark:border-gray-600">
            {/* Weekday headers */}
            <div
                style={gridColumns}
                className="grid border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
            >
                {getWeekDays().map((day) => (
                    <div
                        key={day}
                        className="py-3 text-center text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500"
                    >
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar grid */}
            <div
                style={gridColumns}
                className="grid flex-1 min-h-0 auto-rows-fr divide-x divide-gray-100 dark:divide-gray-600"
            >
                {days.map((day, index) => {
                    if (!isShown(day.getDay())) return null;
                    // Whole-day bars keep their week row; empty rows are
                    // kept as gaps so a span lines up across days.
                    const rows = layoutAllDayWeek(
                        events,
                        days[Math.floor(index / 7) * 7]
                    );
                    const bars = events.filter(
                        (event) => event.allDay && coversDay(event, day)
                    );
                    const slots: (CalendarEvent | null)[] = [];
                    bars.forEach((bar) => {
                        slots[rows.get(bar.id) ?? slots.length] = bar;
                    });
                    const dayEvents: (CalendarEvent | null)[] = [
                        ...Array.from(slots, (slot) => slot ?? null),
                        ...events.filter(
                            (event) => !event.allDay && coversDay(event, day)
                        ),
                    ];
                    const hiddenCount = dayEvents
                        .slice(3)
                        .filter(Boolean).length;
                    const isCurrentMonth = isSameMonth(day, currentDate);
                    const isTodayDate = isToday(day);

                    return (
                        <div
                            key={day.toString()}
                            onClick={() => onDateClick?.(day)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(day, e)}
                            className={`p-2 border-b border-gray-100 dark:border-gray-600 cursor-pointer flex flex-col min-h-[90px] transition-colors ${
                                !isCurrentMonth
                                    ? 'bg-gray-50 dark:bg-gray-800'
                                    : isTodayDate
                                      ? 'bg-blue-50 dark:bg-blue-900/15'
                                      : 'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600/40'
                            }`}
                        >
                            <div className="mb-1.5">
                                {isTodayDate ? (
                                    <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-500 text-white text-xs font-semibold rounded-full">
                                        {format(day, 'd')}
                                    </span>
                                ) : (
                                    <span
                                        className={`text-sm font-medium ${
                                            !isCurrentMonth
                                                ? 'text-gray-300 dark:text-gray-600'
                                                : 'text-gray-600 dark:text-gray-300'
                                        }`}
                                    >
                                        {format(day, 'd')}
                                    </span>
                                )}
                            </div>

                            <div className="space-y-0.5 overflow-hidden flex-1">
                                {dayEvents.slice(0, 3).map((event, slot) =>
                                    event === null ? (
                                        <div
                                            key={`gap-${slot}`}
                                            aria-hidden="true"
                                            className="text-xs py-1 invisible"
                                        >
                                            &nbsp;
                                        </div>
                                    ) : (
                                        <div
                                            key={event.id}
                                            draggable={
                                                event.type === 'task' &&
                                                !event.readOnly
                                            }
                                            onDragStart={(e) =>
                                                handleDragStart(event, e)
                                            }
                                            onDragEnd={handleDragEnd}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEventClick?.(event);
                                            }}
                                            className={`text-xs px-1.5 py-1 rounded text-white truncate font-medium cursor-pointer hover:opacity-90 transition-opacity ${
                                                draggedEventId === event.id
                                                    ? 'opacity-40'
                                                    : ''
                                            } ${
                                                event.allDay &&
                                                event.start < day
                                                    ? '-ml-2 pl-3.5 rounded-l-none'
                                                    : ''
                                            } ${
                                                event.allDay &&
                                                addDays(day, 1) < event.end
                                                    ? '-mr-2 rounded-r-none'
                                                    : ''
                                            }`}
                                            style={{
                                                backgroundColor:
                                                    event.color || '#3b82f6',
                                                opacity: event.readOnly
                                                    ? 0.6
                                                    : undefined,
                                            }}
                                            title={event.title}
                                        >
                                            {event.title}
                                        </div>
                                    )
                                )}
                                {hiddenCount > 0 && (
                                    <div className="text-xs text-gray-400 dark:text-gray-500 px-1 font-medium">
                                        +{hiddenCount}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CalendarMonthView;
