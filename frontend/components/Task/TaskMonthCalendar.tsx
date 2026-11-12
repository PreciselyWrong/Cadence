import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addMonths, format, startOfMonth } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import CalendarMonthView from '../Calendar/CalendarMonthView';
import Button, { IconButton } from '../Shared/ui/Button';
import { toIntlLocale } from '../../utils/intlLocale';
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
    const { t, i18n } = useTranslation();
    const monthTitle = new Intl.DateTimeFormat(toIntlLocale(i18n.language), {
        month: 'long',
        year: 'numeric',
    });
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
            {/* The Calendar page's header nav: month, then today and the
                arrows, in the reader's language. */}
            <div className="flex items-center justify-between gap-2">
                <span className="text-body-m font-medium text-surface-on">
                    {monthTitle.format(currentDate)}
                </span>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentDate(startOfMonth(new Date()))}
                    >
                        {t('calendar.today', 'Today')}
                    </Button>
                    <IconButton
                        onClick={() => setCurrentDate((d) => addMonths(d, -1))}
                        label={t('calendar.previousMonth', 'Previous month')}
                    >
                        <ChevronLeftIcon />
                    </IconButton>
                    <IconButton
                        onClick={() => setCurrentDate((d) => addMonths(d, 1))}
                        label={t('calendar.nextMonth', 'Next month')}
                    >
                        <ChevronRightIcon />
                    </IconButton>
                </div>
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
