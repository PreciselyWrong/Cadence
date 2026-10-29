import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addMonths, format, startOfMonth } from 'date-fns';
import { Task } from '../../entities/Task';
import CalendarMonthView from '../Calendar/CalendarMonthView';
import {
    CalendarEvent,
    CalendarTask,
    taskIdOf,
    taskToEvents,
} from '../Calendar/taskEvents';

interface TaskMonthCalendarProps {
    tasks: Task[];
    onOpenTask: (task: Task) => void;
    // Saves the task with its new due date (yyyy-MM-dd) when a chip is dropped.
    onMoveDue: (task: Task, dueDate: string) => void;
}

// A month of the given tasks by due date, drawn with the Calendar's month grid.
const TaskMonthCalendar: React.FC<TaskMonthCalendarProps> = ({
    tasks,
    onOpenTask,
    onMoveDue,
}) => {
    const { t } = useTranslation();
    const [currentDate, setCurrentDate] = useState(() =>
        startOfMonth(new Date())
    );

    const events = useMemo(
        () =>
            tasks.flatMap((task) =>
                taskToEvents(task as unknown as CalendarTask, 'default')
            ),
        [tasks]
    );

    const taskOfEvent = (eventId: string) => {
        const id = taskIdOf(eventId);
        return tasks.find((task) => String(task.id) === id);
    };

    return (
        <div data-testid="task-month-calendar" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={() => setCurrentDate((d) => addMonths(d, -1))}
                    aria-label={t('calendar.previousMonth', 'Previous month')}
                    className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                    {t('common.previous', 'Previous')}
                </button>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {format(currentDate, 'MMMM yyyy')}
                    </span>
                    <button
                        type="button"
                        onClick={() => setCurrentDate(startOfMonth(new Date()))}
                        className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                        {t('calendar.today', 'Today')}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => setCurrentDate((d) => addMonths(d, 1))}
                    aria-label={t('calendar.nextMonth', 'Next month')}
                    className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                    {t('common.next', 'Next')}
                </button>
            </div>
            <CalendarMonthView
                currentDate={currentDate}
                events={events}
                onEventClick={(event: CalendarEvent) => {
                    const task = taskOfEvent(event.id);
                    if (task) onOpenTask(task);
                }}
                onEventDrop={(eventId, newDate) => {
                    // Only the due-date chip moves; a defer chip is a view of
                    // another date.
                    if (eventId.startsWith('task-defer-')) return;
                    const event = events.find((item) => item.id === eventId);
                    const task = taskOfEvent(eventId);
                    if (!task || !event || event.readOnly) return;
                    onMoveDue(task, format(newDate, 'yyyy-MM-dd'));
                }}
            />
        </div>
    );
};

export default TaskMonthCalendar;
