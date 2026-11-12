import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, addMonths, format, parseISO } from 'date-fns';
import {
    CalendarIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { IconButton } from '../Shared/ui/Button';
import { intlLocale } from '../DailyPlan/planUtils';

const GRID_SIZE = 42;
const KEY_OFFSETS: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
};

const key = (date: Date): string => format(date, 'yyyy-MM-dd');
const monthStart = (date: string): string => `${date.slice(0, 7)}-01`;

interface JumpToDateProps {
    // The day shown as picked (the board's selected day).
    value: string;
    today: string;
    // 0 (Sunday) to 6.
    weekStartsOn: number;
    onPick(date: string): void;
}

/**
 * "Go to date": a button that opens a small month (the sidebar's mini month,
 * as a popover). Arrows move between days, Page Up / Down between months,
 * Enter picks, Escape closes.
 */
const JumpToDate: React.FC<JumpToDateProps> = ({
    value,
    today,
    weekStartsOn,
    onPick,
}) => {
    const { t, i18n } = useTranslation();
    const locale = intlLocale(i18n.language);
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(() => monthStart(value));
    const [focus, setFocus] = useState(value);
    const rootRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const formats = useMemo(
        () => ({
            month: new Intl.DateTimeFormat(locale, {
                month: 'long',
                year: 'numeric',
            }),
            weekday: new Intl.DateTimeFormat(locale, { weekday: 'narrow' }),
            full: new Intl.DateTimeFormat(locale, { dateStyle: 'full' }),
        }),
        [locale]
    );

    useEffect(() => {
        if (!open) return;
        setMonth(monthStart(value));
        setFocus(value);
    }, [open, value]);

    useEffect(() => {
        if (!open) return;
        const close = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        gridRef.current
            ?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)
            ?.focus();
    }, [open, focus, month]);

    const first = parseISO(month);
    const lead = (first.getDay() - weekStartsOn + 7) % 7;
    const start = addDays(first, -lead);
    const cells = Array.from({ length: GRID_SIZE }, (_, i) =>
        key(addDays(start, i))
    );

    const close = () => {
        setOpen(false);
        buttonRef.current?.focus();
    };
    const pick = (date: string) => {
        onPick(date);
        close();
    };
    const moveFocus = (date: string) => {
        setFocus(date);
        if (monthStart(date) !== month) setMonth(monthStart(date));
    };
    const onKeyDown = (event: React.KeyboardEvent, date: string) => {
        if (event.key in KEY_OFFSETS) {
            event.preventDefault();
            moveFocus(key(addDays(parseISO(date), KEY_OFFSETS[event.key])));
        } else if (event.key === 'PageUp' || event.key === 'PageDown') {
            event.preventDefault();
            const step = event.key === 'PageUp' ? -1 : 1;
            moveFocus(key(addMonths(parseISO(date), step)));
        }
    };

    const label = t('upcoming.goToDate', 'Go to date');

    return (
        <div
            ref={rootRef}
            className="relative"
            onKeyDown={(event) => {
                if (event.key === 'Escape' && open) {
                    event.stopPropagation();
                    close();
                }
            }}
        >
            <IconButton
                ref={buttonRef}
                label={label}
                active={open}
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
            >
                <CalendarIcon />
            </IconButton>
            {open && (
                <div
                    role="dialog"
                    aria-label={label}
                    data-testid="upcoming-jump"
                    className="absolute left-0 top-full z-40 mt-1 w-64 rounded-xl bg-surface p-3 shadow-lg ring-1 ring-outline-variant"
                >
                    <div className="flex h-7 items-center justify-between">
                        <span className="text-body-m font-semibold capitalize text-surface-on">
                            {formats.month.format(first)}
                        </span>
                        <div className="flex items-center gap-0.5">
                            <IconButton
                                label={t(
                                    'sidebar.miniMonth.previous',
                                    'Previous month'
                                )}
                                onClick={() =>
                                    setMonth(key(addMonths(first, -1)))
                                }
                            >
                                <ChevronLeftIcon />
                            </IconButton>
                            <IconButton
                                label={t(
                                    'sidebar.miniMonth.next',
                                    'Next month'
                                )}
                                onClick={() =>
                                    setMonth(key(addMonths(first, 1)))
                                }
                            >
                                <ChevronRightIcon />
                            </IconButton>
                        </div>
                    </div>
                    <div className="mt-1 grid h-5 grid-cols-7 place-items-center text-xs font-medium text-surface-on-variant">
                        {cells.slice(0, 7).map((date) => (
                            <span key={date} aria-hidden="true">
                                {formats.weekday.format(parseISO(date))}
                            </span>
                        ))}
                    </div>
                    <div
                        ref={gridRef}
                        className="grid grid-cols-7 place-items-center"
                    >
                        {cells.map((date) => {
                            const picked = date === value;
                            const isToday = date === today;
                            const outside = monthStart(date) !== month;
                            return (
                                <button
                                    key={date}
                                    type="button"
                                    data-date={date}
                                    aria-label={formats.full.format(
                                        parseISO(date)
                                    )}
                                    aria-current={isToday ? 'date' : undefined}
                                    aria-pressed={picked}
                                    tabIndex={date === focus ? 0 : -1}
                                    onClick={() => pick(date)}
                                    onKeyDown={(event) =>
                                        onKeyDown(event, date)
                                    }
                                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                        picked
                                            ? 'bg-primary text-primary-on'
                                            : 'text-surface-on hover:bg-surface-high'
                                    } ${isToday ? 'font-semibold' : ''} ${
                                        isToday && !picked ? 'text-primary' : ''
                                    } ${outside ? 'opacity-40' : ''}`}
                                >
                                    {Number(date.slice(8))}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default JumpToDate;
