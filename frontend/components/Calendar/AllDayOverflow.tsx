import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent } from './taskEvents';

interface AllDayOverflowProps {
    events: CalendarEvent[];
    onEventClick?: (event: CalendarEvent) => void;
    // Accessible name of the chip; defaults to the all-day wording.
    label?: string;
    className?: string;
    style?: React.CSSProperties;
}

// The "+N" chip that stands in for all-day events beyond the first three. It
// opens a small list of the hidden ones.
const AllDayOverflow: React.FC<AllDayOverflowProps> = ({
    events,
    onEventClick,
    label,
    className = '',
    style,
}) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

    // The chip sits in cells that clip (the month grid, the all-day strip), so
    // the list is placed against the window: under the chip, or above it when
    // there is more room there, and it scrolls instead of leaving the screen.
    const toggle = () => {
        if (open) {
            setOpen(false);
            return;
        }
        const rect = buttonRef.current?.getBoundingClientRect();
        if (rect) {
            const gap = 4;
            const edge = 8;
            const below = window.innerHeight - rect.bottom - gap - edge;
            const above = rect.top - gap - edge;
            const left = Math.max(
                edge,
                Math.min(rect.left, window.innerWidth - 224 - edge)
            );
            setMenuStyle(
                below >= 160 || below >= above
                    ? { left, top: rect.bottom + gap, maxHeight: below }
                    : {
                          left,
                          bottom: window.innerHeight - rect.top + gap,
                          maxHeight: above,
                      }
            );
        }
        setOpen(true);
    };

    useEffect(() => {
        if (!open) return;
        const close = () => setOpen(false);
        const onPointerDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        // The list is fixed to the window: it would drift off its chip.
        window.addEventListener('resize', close);
        window.addEventListener('wheel', close, { passive: true });
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', close);
            window.removeEventListener('wheel', close);
        };
    }, [open]);

    if (events.length === 0) return null;

    return (
        <div ref={rootRef} className={`relative ${className}`} style={style}>
            <button
                ref={buttonRef}
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    toggle();
                }}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={
                    label ??
                    t('calendar.moreAllDay', {
                        count: events.length,
                        defaultValue: '{{count}} more all-day events',
                    })
                }
                data-testid="calendar-all-day-more"
                className="mx-1 rounded-full bg-primary-container px-2 py-0.5 text-label-m text-primary-on-container hover:opacity-90"
            >
                +{events.length}
            </button>
            {open && (
                <div
                    role="menu"
                    style={menuStyle}
                    onWheel={(e) => e.stopPropagation()}
                    className="fixed z-50 w-56 overflow-y-auto rounded-card bg-white p-1 shadow-lg ring-1 ring-gray-900/5 dark:bg-gray-800 dark:ring-white/10"
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
                            data-calendar-block=""
                            className="flex w-full items-center gap-2 rounded-chip px-2 py-1.5 text-left text-sm text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
                        >
                            <span
                                className={`h-2.5 w-2.5 shrink-0 rounded-full ${event.color ? '' : 'bg-primary-container'}`}
                                style={{ backgroundColor: event.color }}
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
