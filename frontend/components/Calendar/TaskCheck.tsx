import React, { createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon } from '@heroicons/react/24/outline';
import { CalendarEvent } from './taskEvents';

// Ticks a task off from its block. Views without a provider (the Today
// page) draw no box.
export const TaskToggleContext = createContext<
    ((event: CalendarEvent) => void) | null
>(null);

export const TaskCheck: React.FC<{ event: CalendarEvent }> = ({ event }) => {
    const { t } = useTranslation();
    const toggle = useContext(TaskToggleContext);
    if (!toggle || !event.completable) return null;
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={!!event.completed}
            aria-label={
                event.completed
                    ? t('calendar.markNotDone', 'Mark as not done')
                    : t('calendar.markDone', 'Mark as done')
            }
            data-testid={`calendar-task-check-${event.id}`}
            draggable={false}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
                e.stopPropagation();
                toggle(event);
            }}
            className="shrink-0 inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border border-white/90 bg-white/10 hover:bg-white/30"
        >
            {event.completed && <CheckIcon className="w-3 h-3" />}
        </button>
    );
};

// A task block's title, with its box before it.
export const EventTitle: React.FC<{
    event: CalendarEvent;
    className?: string;
}> = ({ event, className = 'truncate' }) => (
    <span className="flex items-center gap-1 min-w-0">
        <TaskCheck event={event} />
        <span
            className={`${className} ${event.completed ? 'line-through' : ''}`}
        >
            {event.title}
        </span>
    </span>
);
