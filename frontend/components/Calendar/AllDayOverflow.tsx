import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent } from './taskEvents';

interface AllDayOverflowProps {
    events: CalendarEvent[];
    onEventClick?: (event: CalendarEvent) => void;
    className?: string;
    style?: React.CSSProperties;
}

// The "+N" chip that stands in for all-day events beyond the first three. It
// opens a small list of the hidden ones.
const AllDayOverflow: React.FC<AllDayOverflowProps> = ({
    events,
    onEventClick,
    className = '',
    style,
}) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    if (events.length === 0) return null;

    return (
        <div ref={rootRef} className={`relative ${className}`} style={style}>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((v) => !v);
                }}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={t('calendar.moreAllDay', {
                    count: events.length,
                    defaultValue: '{{count}} more all-day events',
                })}
                data-testid="calendar-all-day-more"
                className="mx-1 rounded-full bg-primary-container px-2 py-0.5 text-label-m text-primary-on-container hover:opacity-90"
            >
                +{events.length}
            </button>
            {open && (
                <div
                    role="menu"
                    className="absolute left-0 top-full z-30 mt-1 w-56 rounded-card bg-white p-1 shadow-lg ring-1 ring-gray-900/5 dark:bg-gray-800 dark:ring-white/10"
                >
                    {events.map((event) => (
                        <button
                            key={event.id}
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                                e.stopPropagation();
                                setOpen(false);
                                onEventClick?.(event);
                            }}
                            className="flex w-full items-center gap-2 rounded-chip px-2 py-1.5 text-left text-sm text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
                        >
                            <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{
                                    backgroundColor: event.color || '#3b82f6',
                                }}
                            />
                            <span className="truncate">{event.title}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AllDayOverflow;
