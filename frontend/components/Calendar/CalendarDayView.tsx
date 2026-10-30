import React from 'react';
import { addHours, differenceInCalendarDays, format, isToday } from 'date-fns';
import { useTranslation } from 'react-i18next';
import {
    CalendarEvent,
    CAL_ALL_DAY_ID,
    coversDay,
    isMovable,
    slotId,
} from './taskEvents';
import { ResizeHandle, useEventResize } from './useEventResize';
import { DragBlock, DropTarget } from './DndCalendarParts';
import { VisibleHours, WHOLE_DAY, countOutside } from './visibleHours';
import HiddenHoursBar, {
    HIDDEN_HOURS_STRIPES,
    HideHoursButton,
} from './HiddenHoursBar';

interface CalendarDayViewProps {
    currentDate: Date;
    events: CalendarEvent[];
    onEventClick?: (event: CalendarEvent) => void;
    onTimeSlotClick?: (date: Date, hour: number) => void;
    onEventDrop?: (eventId: string, newDate: Date, newHour?: number) => void;
    onEventResize?: (eventId: string, newEnd: Date) => void;
    // Hour the time slots start scrolled to, read once on mount.
    scrollToHour?: number;
    // Hours shown; the grid starts at `start` and ends before `end`.
    visibleHours?: VisibleHours;
    // Drag blocks and drop on 15-minute slots with dnd-kit (Today page)
    // instead of native HTML5 drag. The owning DndContext handles the drop.
    dndKit?: boolean;
}

export const HOUR_HEIGHT = 48;

const CalendarDayView: React.FC<CalendarDayViewProps> = ({
    currentDate,
    events,
    onEventClick,
    onTimeSlotClick,
    onEventDrop,
    onEventResize,
    scrollToHour,
    visibleHours = WHOLE_DAY,
    dndKit = false,
}) => {
    const { t } = useTranslation();
    const resize = useEventResize(HOUR_HEIGHT, onEventResize);
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const [showAll, setShowAll] = React.useState(false);
    const restricted = visibleHours.start > 0 || visibleHours.end < 24;
    const shownHours = showAll ? WHOLE_DAY : visibleHours;
    const firstHour = shownHours.start;
    const windowStart = firstHour * 60;
    const windowEnd = shownHours.end * 60;
    const hours = Array.from(
        { length: shownHours.end - firstHour },
        (_, i) => firstHour + i
    );
    const outside = countOutside(events, currentDate, visibleHours);
    const isHidden = (hour: number) =>
        hour < visibleHours.start || hour >= visibleHours.end;
    const [draggedEventId, setDraggedEventId] = React.useState<string | null>(
        null
    );

    const dayEvents = events.filter(
        (event) => !event.allDay && coversDay(event, currentDate)
    );
    const allDayEvents = events.filter(
        (event) => event.allDay && coversDay(event, currentDate)
    );

    const overlaps = (a: CalendarEvent, b: CalendarEvent) =>
        a.start < b.end && b.start < a.end;

    const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();

    // The part of an event inside the visible hours, as top and height.
    const segmentOf = (event: CalendarEvent) => {
        const startMinutes = minutesOf(event.start);
        const endMinutes = Math.min(
            startMinutes +
                (resize.endOf(event).getTime() - event.start.getTime()) / 60000,
            24 * 60
        );
        const segStart = Math.max(startMinutes, windowStart);
        const segEnd = Math.min(endMinutes, windowEnd);
        return {
            top: ((segStart - windowStart) / 60) * HOUR_HEIGHT,
            height: Math.max(((segEnd - segStart) / 60) * HOUR_HEIGHT, 24),
        };
    };

    // An event that runs past midnight ends at the end of the day.
    const endOfDayMinutes = (event: CalendarEvent) =>
        differenceInCalendarDays(event.end, event.start) > 0
            ? 24 * 60
            : minutesOf(event.end);

    const shownEvents = dayEvents.filter(
        (event) =>
            minutesOf(event.start) < windowEnd &&
            endOfDayMinutes(event) > windowStart
    );

    const layoutEvent = (event: CalendarEvent) => {
        const group = shownEvents
            .filter((other) => overlaps(event, other))
            .sort((a, b) => a.start.getTime() - b.start.getTime());
        const index = group.findIndex((e) => e.id === event.id);
        const count = group.length;
        return {
            ...segmentOf(event),
            left: `calc(0.5rem + ${(100 / count) * index}%)`,
            width: `${count > 1 ? 100 / count - 2 : 100}%`,
        };
    };

    const handleDragStart = (event: CalendarEvent, e: React.DragEvent) => {
        e.stopPropagation();
        setDraggedEventId(event.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', event.id);
    };

    const handleDragEnd = () => setDraggedEventId(null);

    const handleDrop = (hour: number, e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const eventId = e.dataTransfer.getData('text/plain');
        if (eventId && onEventDrop) onEventDrop(eventId, currentDate, hour);
        setDraggedEventId(null);
    };

    React.useEffect(() => {
        if (scrollToHour === undefined || !scrollRef.current) return;
        scrollRef.current.scrollTop =
            Math.max(0, scrollToHour - firstHour) * HOUR_HEIGHT;
    }, [scrollToHour]);

    const todayClass = isToday(currentDate);

    const blockBody = (event: CalendarEvent) => (
        <>
            <div className="font-semibold truncate">{event.title}</div>
            <div className="text-[12px] opacity-75 mt-0.5">
                {format(event.start, 'HH:mm')} –{' '}
                {format(resize.endOf(event), 'HH:mm')}
            </div>
            {isMovable(event) && event.resize && (
                <ResizeHandle
                    label={t(
                        'calendar.resizeTask',
                        'Change when this task ends'
                    )}
                    onPointerDown={(e) => resize.begin(event, e)}
                />
            )}
        </>
    );

    const blockStyle = (event: CalendarEvent): React.CSSProperties => ({
        backgroundColor: event.color || '#3b82f6',
        opacity: event.readOnly ? 0.6 : undefined,
    });

    const draggable = (event: CalendarEvent) =>
        isMovable(event) && !event.readOnly;

    return (
        <div className="h-full bg-white dark:bg-gray-700 rounded-xl shadow-sm overflow-hidden flex flex-col border border-gray-200 dark:border-gray-600">
            {/* Day header */}
            <div
                className={`p-5 border-b border-gray-200 dark:border-gray-600 text-center ${todayClass ? 'bg-blue-50 dark:bg-blue-900/15' : 'bg-gray-50 dark:bg-gray-800'}`}
            >
                <div
                    className={`text-xs font-semibold tracking-widest uppercase mb-2 ${
                        todayClass
                            ? 'text-blue-500 dark:text-blue-400'
                            : 'text-gray-500 dark:text-gray-400'
                    }`}
                >
                    {format(currentDate, 'EEEE')}
                </div>
                <div>
                    {todayClass ? (
                        <span className="inline-flex items-center justify-center w-12 h-12 bg-primary text-primary-on text-xl font-semibold rounded-full">
                            {format(currentDate, 'd')}
                        </span>
                    ) : (
                        <span className="text-4xl font-light text-gray-700 dark:text-gray-300">
                            {format(currentDate, 'd')}
                        </span>
                    )}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {format(currentDate, 'MMMM yyyy')}
                </div>
            </div>

            {/* All-day events; in dnd-kit mode the row is always a drop target */}
            {(dndKit || allDayEvents.length > 0) && (
                <DropTarget
                    dndKit={dndKit}
                    id={CAL_ALL_DAY_ID}
                    testId={dndKit ? 'cal-allday' : undefined}
                    className={`px-4 py-2 border-b border-gray-100 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 ${dndKit ? 'min-h-[3.25rem]' : ''}`}
                >
                    {allDayEvents.length > 0 && (
                        <div className="text-xs font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-400 mb-2">
                            {t('calendar.allDay', 'All day')}
                        </div>
                    )}
                    {/* Capped so the hours stay in view. */}
                    <div className="space-y-1 max-h-[6.5rem] overflow-y-auto">
                        {allDayEvents.map((event) => {
                            const body = event.title;
                            const className =
                                'text-xs px-2.5 py-1.5 rounded-lg text-white cursor-pointer hover:opacity-90 transition-opacity font-medium';
                            const click = (e: React.MouseEvent) => {
                                e.stopPropagation();
                                onEventClick?.(event);
                            };
                            return dndKit ? (
                                <DragBlock
                                    key={event.id}
                                    id={event.id}
                                    data={{ type: 'calendar-block', event }}
                                    disabled={!draggable(event)}
                                    className={className}
                                    style={blockStyle(event)}
                                    title={event.title}
                                    onClick={click}
                                >
                                    {body}
                                </DragBlock>
                            ) : (
                                <div
                                    key={event.id}
                                    draggable={draggable(event)}
                                    onDragStart={(e) =>
                                        handleDragStart(event, e)
                                    }
                                    onDragEnd={handleDragEnd}
                                    onClick={click}
                                    className={className}
                                    style={blockStyle(event)}
                                    title={event.title}
                                >
                                    {body}
                                </div>
                            );
                        })}
                    </div>
                </DropTarget>
            )}

            {restricted && showAll && (
                <HideHoursButton onClick={() => setShowAll(false)} />
            )}
            {restricted && !showAll && outside.before.length > 0 && (
                <HiddenHoursBar
                    direction="earlier"
                    events={outside.before}
                    onClick={() => setShowAll(true)}
                />
            )}

            {/* Time slots */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
                <div className="relative">
                    {hours.map((hour) => (
                        <div
                            key={hour}
                            className="flex h-[48px] border-b border-gray-100 dark:border-gray-600"
                            style={
                                showAll && isHidden(hour)
                                    ? HIDDEN_HOURS_STRIPES
                                    : undefined
                            }
                        >
                            <div className="w-20 py-3 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 text-center border-r border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 shrink-0">
                                {format(
                                    addHours(
                                        new Date().setHours(hour, 0, 0, 0),
                                        0
                                    ),
                                    'HH:mm'
                                )}
                            </div>
                            {dndKit ? (
                                <div
                                    onClick={() =>
                                        onTimeSlotClick?.(currentDate, hour)
                                    }
                                    className="flex flex-1 flex-col cursor-pointer hover:bg-blue-50/30 dark:hover:bg-blue-900/10 relative transition-colors"
                                >
                                    {[0, 15, 30, 45].map((quarter) => (
                                        <DropTarget
                                            key={quarter}
                                            dndKit
                                            id={slotId(hour * 60 + quarter)}
                                            testId={`cal-slot-${hour * 60 + quarter}`}
                                            className="flex-1"
                                        >
                                            {null}
                                        </DropTarget>
                                    ))}
                                </div>
                            ) : (
                                <div
                                    onClick={() =>
                                        onTimeSlotClick?.(currentDate, hour)
                                    }
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(e) => handleDrop(hour, e)}
                                    className="flex-1 cursor-pointer hover:bg-blue-50/30 dark:hover:bg-blue-900/10 relative transition-colors"
                                />
                            )}
                        </div>
                    ))}
                    <div className="absolute inset-y-0 left-20 right-0 pointer-events-none">
                        {shownEvents.map((event) => {
                            const layout = layoutEvent(event);
                            const className = `absolute text-xs px-2.5 py-1.5 rounded-lg text-white z-10 font-medium overflow-hidden cursor-pointer hover:opacity-90 transition-opacity pointer-events-auto ${
                                event.type === 'task' ? 'cursor-move' : ''
                            } ${draggedEventId === event.id ? 'opacity-40' : ''}`;
                            const style: React.CSSProperties = {
                                ...blockStyle(event),
                                top: layout.top,
                                height: layout.height,
                                left: layout.left,
                                width: layout.width,
                            };
                            const click = (e: React.MouseEvent) => {
                                e.stopPropagation();
                                if (resize.consumeClick()) return;
                                onEventClick?.(event);
                            };
                            const title = `${event.title} - ${format(event.start, 'HH:mm')} – ${format(event.end, 'HH:mm')}`;
                            return dndKit ? (
                                <DragBlock
                                    key={event.id}
                                    id={event.id}
                                    data={{ type: 'calendar-block', event }}
                                    disabled={
                                        !draggable(event) ||
                                        resize.resizingId === event.id
                                    }
                                    className={className}
                                    style={style}
                                    title={title}
                                    onClick={click}
                                >
                                    {blockBody(event)}
                                </DragBlock>
                            ) : (
                                <div
                                    key={event.id}
                                    draggable={
                                        draggable(event) &&
                                        resize.resizingId !== event.id
                                    }
                                    onDragStart={(e) =>
                                        handleDragStart(event, e)
                                    }
                                    onDragEnd={handleDragEnd}
                                    onClick={click}
                                    className={className}
                                    style={style}
                                    title={title}
                                >
                                    {blockBody(event)}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            {restricted && !showAll && outside.after.length > 0 && (
                <HiddenHoursBar
                    direction="later"
                    events={outside.after}
                    onClick={() => setShowAll(true)}
                />
            )}
        </div>
    );
};

export default CalendarDayView;
