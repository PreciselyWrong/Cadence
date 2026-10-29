import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { DailyPlanItem } from '../../utils/dailyPlanService';
import { CalendarEvent as FeedEvent } from '../../utils/calendarFeedsService';
import CalendarDayView from '../Calendar/CalendarDayView';
import {
    CalendarEvent,
    CalendarTask,
    taskColor,
    taskName,
    taskToEvents,
} from '../Calendar/taskEvents';
import { DEFAULT_DURATION } from './planUtils';

interface TodayCalendarPanelProps {
    date: string | null;
    feedEvents: FeedEvent[];
    dueTodayTasks: Task[];
    planItems: DailyPlanItem[];
    now: number;
    onMove: (event: CalendarEvent, newStart: Date) => void;
}

// Block ids: `plan-<uid>` for a planned item, `due-<uid>` for a task due
// today with a time. Only those two can be dragged; feed events cannot.
export const PLAN_EVENT_PREFIX = 'plan-';
export const DUE_EVENT_PREFIX = 'due-';

const localDay = (day: string, minute = 0): Date => {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date, 0, minute);
};

const feedToEvent = (event: FeedEvent, day: string): CalendarEvent => ({
    id: `feed-${event.feed_uid}-${event.uid}`,
    title: event.title || event.feed_name,
    start: localDay(day, event.start_minute ?? 0),
    end: event.all_day
        ? localDay(day, 24 * 60)
        : localDay(day, event.end_minute ?? event.start_minute ?? 0),
    type: 'event',
    color: event.color || '#6b7280',
    feedUid: event.feed_uid,
    allDay: event.all_day,
    readOnly: true,
});

const plannedToEvent = (item: DailyPlanItem, day: string): CalendarEvent => {
    const task = item.task as unknown as CalendarTask;
    const start = localDay(day, item.start_minute ?? 0);
    return {
        id: `${PLAN_EVENT_PREFIX}${item.task_uid}`,
        title: taskName(task),
        start,
        end: new Date(
            start.getTime() +
                (item.duration_minutes || DEFAULT_DURATION) * 60000
        ),
        type: 'task',
        color: taskColor(task),
    };
};

// The due block of a task with a time. defer_until is not part of this view.
const dueToEvents = (task: Task): CalendarEvent[] =>
    taskToEvents({
        ...(task as unknown as CalendarTask),
        defer_until: null,
    })
        .filter((event) => event.type === 'task')
        .map((event) => ({ ...event, id: `${DUE_EVENT_PREFIX}${task.uid}` }));

const TodayCalendarPanel: React.FC<TodayCalendarPanelProps> = ({
    date,
    feedEvents,
    dueTodayTasks,
    planItems,
    now,
    onMove,
}) => {
    const { t } = useTranslation();
    // Read once: the view opens at the current hour and then stays put.
    const [scrollToHour] = useState(() => Math.floor(now / 60));

    const events: CalendarEvent[] = [];
    if (date) {
        const plannedUids = new Set(planItems.map((item) => item.task_uid));
        events.push(
            ...feedEvents.map((event) => feedToEvent(event, date)),
            ...planItems
                .filter((item) => item.start_minute !== null)
                .map((item) => plannedToEvent(item, date)),
            ...dueTodayTasks
                .filter(
                    (task) => task.due_has_time && !plannedUids.has(task.uid)
                )
                .flatMap(dueToEvents)
        );
    }

    const handleDrop = (eventId: string, newDate: Date, newHour?: number) => {
        const event = events.find((e) => e.id === eventId);
        if (!event || event.readOnly || newHour === undefined) return;
        const newStart = new Date(newDate);
        newStart.setHours(newHour, 0, 0, 0);
        onMove(event, newStart);
    };

    return (
        <section
            data-testid="today-calendar-panel"
            aria-label={t('dailyPlan.calendar', 'Calendar')}
            className="order-first flex h-[60vh] min-h-[320px] flex-col lg:order-last lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:self-start"
        >
            {date ? (
                <div className="min-h-0 flex-1">
                    <CalendarDayView
                        currentDate={localDay(date)}
                        events={events}
                        onEventDrop={handleDrop}
                        scrollToHour={scrollToHour}
                    />
                </div>
            ) : (
                <p className="text-gray-500 dark:text-gray-400">
                    {t('common.loading', 'Loading...')}
                </p>
            )}
        </section>
    );
};

export default TodayCalendarPanel;
