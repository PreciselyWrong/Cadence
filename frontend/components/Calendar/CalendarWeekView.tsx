import React, { useState, useEffect } from 'react';
import {
    format,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isToday,
    addHours,
} from 'date-fns';
import { useTranslation } from 'react-i18next';
import {
    getFirstDayOfWeek,
    getLocaleFirstDayOfWeek,
} from '../../utils/profileService';

import { CalendarEvent, coversDay, layoutAllDayWeek } from './taskEvents';
import { ResizeHandle, useEventResize } from './useEventResize';

interface CalendarWeekViewProps {
    currentDate: Date;
    events: CalendarEvent[];
    onDateClick?: (date: Date) => void;
    onEventClick?: (event: CalendarEvent) => void;
    onTimeSlotClick?: (date: Date, hour: number) => void;
    onEventDrop?: (eventId: string, newDate: Date, newHour?: number) => void;
    onEventResize?: (eventId: string, newEnd: Date) => void;
    showWeekends?: boolean;
}

const WEEK_HOUR_HEIGHT = 72;

const CalendarWeekView: React.FC<CalendarWeekViewProps> = ({
    currentDate,
    events,
    onEventClick,
    onTimeSlotClick,
    onEventDrop,
    onEventResize,
    showWeekends = true,
}) => {
    const { t } = useTranslation();
    const resize = useEventResize(WEEK_HOUR_HEIGHT, onEventResize);
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

    const weekStart = startOfWeek(currentDate, {
        weekStartsOn: firstDayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });
    const weekEnd = endOfWeek(currentDate, {
        weekStartsOn: firstDayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });
    const weekDays = eachDayOfInterval({
        start: weekStart,
        end: weekEnd,
    }).filter(
        (day) => showWeekends || (day.getDay() !== 0 && day.getDay() !== 6)
    );
    // Time column plus one column per shown day.
    const gridColumns = {
        gridTemplateColumns: `repeat(${weekDays.length + 1}, minmax(0, 1fr))`,
    };
    const hours = Array.from({ length: 24 }, (_, i) => i);

    const getEventsForTimeSlot = (day: Date, hour: number) =>
        events.filter(
            (event) =>
                !event.allDay &&
                format(event.start, 'yyyy-MM-dd') ===
                    format(day, 'yyyy-MM-dd') &&
                event.start.getHours() === hour
        );

    const handleDragStart = (event: CalendarEvent, e: React.DragEvent) => {
        e.stopPropagation();
        setDraggedEventId(event.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', event.id);
    };

    const handleDragEnd = () => setDraggedEventId(null);

    // Whole-day bars, clipped to this week, as grid columns 2..8.
    // Whole-day bars across the shown days, as grid columns 2 and on.
    const allDayBars = events
        .filter((event) => event.allDay)
        .map((event) => {
            const covered = weekDays
                .map((day, index) => (coversDay(event, day) ? index : -1))
                .filter((index) => index >= 0);
            return covered.length
                ? {
                      event,
                      from: covered[0],
                      to: covered[covered.length - 1] + 1,
                  }
                : null;
        })
        .filter(
            (bar): bar is { event: CalendarEvent; from: number; to: number } =>
                bar !== null
        );

    const allDayRows = layoutAllDayWeek(events, weekStart);

    const handleDrop = (
        day: Date,
        hour: number | undefined,
        e: React.DragEvent
    ) => {
        e.preventDefault();
        e.stopPropagation();
        const eventId = e.dataTransfer.getData('text/plain');
        if (eventId && onEventDrop) onEventDrop(eventId, day, hour);
        setDraggedEventId(null);
    };

    return (
        <div className="h-full bg-white dark:bg-gray-700 rounded-xl shadow-sm overflow-hidden flex flex-col border border-gray-200 dark:border-gray-600">
            {/* Day headers */}
            <div
                className="grid border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 sticky top-0 z-10"
                style={gridColumns}
            >
                <div className="p-3 text-center text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-600">
                    {/* time col */}
                </div>
                {weekDays.map((day) => (
                    <div
                        key={day.toString()}
                        className={`p-3 text-center border-l border-gray-200 dark:border-gray-600 ${
                            isToday(day) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                    >
                        <div
                            className={`text-xs font-semibold tracking-widest uppercase mb-1 ${
                                isToday(day)
                                    ? 'text-blue-500 dark:text-blue-400'
                                    : 'text-gray-400 dark:text-gray-500'
                            }`}
                        >
                            {format(day, 'EEE')}
                        </div>
                        <div>
                            {isToday(day) ? (
                                <span className="inline-flex items-center justify-center w-7 h-7 bg-blue-500 text-white text-sm font-semibold rounded-full">
                                    {format(day, 'd')}
                                </span>
                            ) : (
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                    {format(day, 'd')}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {allDayBars.length > 0 && (
                <div
                    className="grid gap-y-0.5 py-1 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
                    style={gridColumns}
                    data-testid="calendar-all-day-row"
                >
                    {weekDays.map((day, index) => (
                        <div
                            key={`all-day-drop-${day.toString()}`}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={(e) => handleDrop(day, undefined, e)}
                            style={{
                                gridColumn: index + 2,
                                gridRow: `1 / span ${allDayBars.length}`,
                            }}
                        />
                    ))}
                    {allDayBars.map(({ event, from, to }) => (
                        <div
                            key={event.id}
                            draggable={event.type === 'task' && !event.readOnly}
                            onDragStart={(e) => handleDragStart(event, e)}
                            onDragEnd={handleDragEnd}
                            onClick={(e) => {
                                e.stopPropagation();
                                onEventClick?.(event);
                            }}
                            className={`mx-1 text-xs px-2 py-1 rounded text-white truncate font-medium cursor-pointer hover:opacity-90 ${
                                draggedEventId === event.id ? 'opacity-40' : ''
                            }`}
                            style={{
                                backgroundColor: event.color || '#3b82f6',
                                gridColumn: `${from + 2} / ${to + 2}`,
                                gridRow: (allDayRows.get(event.id) ?? 0) + 1,
                                // Let a drop reach the day cell beneath.
                                pointerEvents: draggedEventId
                                    ? 'none'
                                    : undefined,
                            }}
                            title={event.title}
                        >
                            {event.title}
                        </div>
                    ))}
                </div>
            )}

            {/* Time slots */}
            <div className="flex-1 overflow-y-auto">
                {hours.map((hour) => (
                    <div
                        key={hour}
                        className="grid h-[72px] border-b border-gray-100 dark:border-gray-600"
                        style={gridColumns}
                    >
                        <div className="py-3 px-2 text-xs font-medium text-gray-400 dark:text-gray-500 text-center border-r border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
                            {format(
                                addHours(new Date().setHours(hour, 0, 0, 0), 0),
                                'HH:mm'
                            )}
                        </div>
                        {weekDays.map((day) => {
                            const timeSlotEvents = getEventsForTimeSlot(
                                day,
                                hour
                            );
                            const eventCount = timeSlotEvents.length;

                            return (
                                <div
                                    key={`${day.toString()}-${hour}`}
                                    onClick={() => onTimeSlotClick?.(day, hour)}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(e) => handleDrop(day, hour, e)}
                                    className={`p-1.5 border-l border-gray-100 dark:border-gray-600 cursor-pointer transition-colors hover:bg-blue-50/30 dark:hover:bg-blue-900/10 relative ${
                                        isToday(day)
                                            ? 'bg-blue-50/10 dark:bg-blue-900/5'
                                            : ''
                                    }`}
                                >
                                    {timeSlotEvents.map((event, index) => (
                                        <div
                                            key={event.id}
                                            draggable={
                                                event.type === 'task' &&
                                                !event.readOnly &&
                                                resize.resizingId !== event.id
                                            }
                                            onDragStart={(e) =>
                                                handleDragStart(event, e)
                                            }
                                            onDragEnd={handleDragEnd}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (resize.consumeClick())
                                                    return;
                                                onEventClick?.(event);
                                            }}
                                            className={`text-xs px-2 py-1.5 rounded-lg text-white absolute z-10 font-medium overflow-hidden cursor-pointer hover:opacity-90 transition-opacity ${
                                                event.type === 'task'
                                                    ? 'cursor-move'
                                                    : ''
                                            } ${draggedEventId === event.id ? 'opacity-40' : ''}`}
                                            style={{
                                                backgroundColor:
                                                    event.color || '#3b82f6',
                                                left: `${(100 / eventCount) * index}%`,
                                                width: `${eventCount > 1 ? 100 / eventCount - 1 : 100}%`,
                                                top: `calc(0.25rem + ${(event.start.getMinutes() / 60) * WEEK_HOUR_HEIGHT}px)`,
                                                height: Math.max(
                                                    ((resize
                                                        .endOf(event)
                                                        .getTime() -
                                                        event.start.getTime()) /
                                                        (1000 * 60 * 60)) *
                                                        WEEK_HOUR_HEIGHT -
                                                        8,
                                                    24
                                                ),
                                            }}
                                            title={event.title}
                                        >
                                            <div className="line-clamp-2 leading-tight">
                                                {event.title}
                                            </div>
                                            <div className="text-[10px] opacity-75 mt-0.5">
                                                {format(event.start, 'HH:mm')} –{' '}
                                                {format(
                                                    resize.endOf(event),
                                                    'HH:mm'
                                                )}
                                            </div>
                                            {event.type === 'task' &&
                                                event.resize && (
                                                    <ResizeHandle
                                                        label={t(
                                                            'calendar.resizeTask',
                                                            'Change when this task ends'
                                                        )}
                                                        onPointerDown={(e) =>
                                                            resize.begin(
                                                                event,
                                                                e
                                                            )
                                                        }
                                                    />
                                                )}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CalendarWeekView;
