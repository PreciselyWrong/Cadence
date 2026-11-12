import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { getUserTimezone } from '../../utils/dateUtils';
import { getFirstDayOfWeek } from '../../utils/profileService';

const DAY_MS = 86_400_000;
const GRID_SIZE = 42;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// Calendar arithmetic works on 'YYYY-MM-DD' keys read as UTC dates, so the
// grid does not shift with the browser's own timezone or DST.
const keyToDate = (key: string): Date => new Date(`${key}T00:00:00Z`);

const dateToKey = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (key: string, days: number): string =>
    dateToKey(new Date(keyToDate(key).getTime() + days * DAY_MS));

const addMonths = (key: string, months: number): string => {
    const date = keyToDate(key);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + months;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(date.getUTCDate(), lastDay);
    return dateToKey(new Date(Date.UTC(year, month, day)));
};

const monthStartOf = (key: string): string => `${key.slice(0, 7)}-01`;

const isDateKey = (value: string | null): value is string =>
    value !== null &&
    DATE_KEY.test(value) &&
    dateToKey(keyToDate(value)) === value;

const todayKeyIn = (timeZone: string): string =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());

const KEY_OFFSETS: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
};

const SidebarMiniMonth: React.FC = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { pathname, search } = useLocation();

    const todayKey = todayKeyIn(getUserTimezone());
    const requestedDate =
        pathname === '/today' ? new URLSearchParams(search).get('date') : null;
    const selectedKey = isDateKey(requestedDate) ? requestedDate : todayKey;

    const [weekStart, setWeekStart] = useState(1);
    const [viewKey, setViewKey] = useState(() => monthStartOf(selectedKey));
    const [focusKey, setFocusKey] = useState(selectedKey);
    const gridRef = useRef<HTMLDivElement>(null);
    const shouldFocusRef = useRef(false);

    const formatters = useMemo(
        () => ({
            month: new Intl.DateTimeFormat(i18n.language, {
                month: 'long',
                timeZone: 'UTC',
            }),
            weekday: new Intl.DateTimeFormat(i18n.language, {
                weekday: 'narrow',
                timeZone: 'UTC',
            }),
            full: new Intl.DateTimeFormat(i18n.language, {
                dateStyle: 'full',
                timeZone: 'UTC',
            }),
        }),
        [i18n.language]
    );

    useEffect(() => {
        let active = true;
        getFirstDayOfWeek().then((day) => {
            if (active) setWeekStart(day);
        });
        return () => {
            active = false;
        };
    }, []);

    // Route changes (a click, Back/Forward, a link) move the shown month and
    // the keyboard focus to the newly selected day.
    useEffect(() => {
        setViewKey(monthStartOf(selectedKey));
        setFocusKey(selectedKey);
    }, [selectedKey]);

    const viewDate = keyToDate(viewKey);
    const leadingDays = (viewDate.getUTCDay() - weekStart + 7) % 7;
    const gridStart = addDays(viewKey, -leadingDays);
    const cells = Array.from({ length: GRID_SIZE }, (_, index) =>
        addDays(gridStart, index)
    );
    const tabStopKey =
        [focusKey, selectedKey, todayKey].find((key) => cells.includes(key)) ??
        viewKey;

    useEffect(() => {
        if (!shouldFocusRef.current) return;
        shouldFocusRef.current = false;
        gridRef.current
            ?.querySelector<HTMLButtonElement>(`[data-date="${focusKey}"]`)
            ?.focus();
    }, [focusKey, viewKey]);

    const selectDay = (key: string) => {
        navigate(key === todayKey ? '/today' : `/today?date=${key}`);
    };

    const moveFocus = (target: string, changeMonth: boolean) => {
        shouldFocusRef.current = true;
        setFocusKey(target);
        if (changeMonth || !cells.includes(target)) {
            setViewKey(monthStartOf(target));
        }
    };

    const handleDayKeyDown = (event: React.KeyboardEvent, key: string) => {
        if (event.key in KEY_OFFSETS) {
            event.preventDefault();
            moveFocus(addDays(key, KEY_OFFSETS[event.key]), false);
        } else if (event.key === 'PageUp' || event.key === 'PageDown') {
            event.preventDefault();
            const months = event.key === 'PageUp' ? -1 : 1;
            moveFocus(addMonths(key, months), true);
        }
    };

    const weekdayKeys = cells.slice(0, 7);

    return (
        <div className="px-3 py-1.5 select-none">
            <div className="flex h-7 items-center justify-between">
                <span className="text-body-m font-semibold text-surface-on">
                    {formatters.month.format(viewDate)}{' '}
                    <span className="text-primary">
                        {viewDate.getUTCFullYear()}
                    </span>
                </span>
                <div className="flex items-center gap-0.5">
                    <button
                        type="button"
                        aria-label={t(
                            'sidebar.miniMonth.previous',
                            'Previous month'
                        )}
                        onClick={() => setViewKey(addMonths(viewKey, -1))}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-on-variant hover:bg-surface-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                        <ChevronLeftIcon className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                        type="button"
                        aria-label={t('sidebar.miniMonth.next', 'Next month')}
                        onClick={() => setViewKey(addMonths(viewKey, 1))}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-on-variant hover:bg-surface-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                        <ChevronRightIcon className="h-4 w-4" aria-hidden />
                    </button>
                </div>
            </div>

            <div className="mt-1 grid h-5 grid-cols-7 place-items-center text-xs font-medium text-surface-on-variant">
                {weekdayKeys.map((key) => (
                    <span key={key} aria-hidden>
                        {formatters.weekday.format(keyToDate(key))}
                    </span>
                ))}
            </div>

            <div ref={gridRef} className="grid grid-cols-7 place-items-center">
                {cells.map((key) => {
                    const isSelected = key === selectedKey;
                    const isToday = key === todayKey;
                    const isOutsideMonth =
                        key.slice(0, 7) !== viewKey.slice(0, 7);
                    const classes = [
                        'flex h-7 w-7 items-center justify-center rounded-full text-xs tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        isSelected
                            ? 'bg-primary text-primary-on'
                            : 'text-surface-on hover:bg-surface-high',
                        isToday ? 'font-semibold' : '',
                        isToday && !isSelected ? 'text-primary' : '',
                        isOutsideMonth ? 'opacity-40' : '',
                    ]
                        .filter(Boolean)
                        .join(' ');

                    return (
                        <button
                            key={key}
                            type="button"
                            data-date={key}
                            aria-label={formatters.full.format(keyToDate(key))}
                            aria-current={isToday ? 'date' : undefined}
                            aria-pressed={isSelected ? true : undefined}
                            tabIndex={key === tabStopKey ? 0 : -1}
                            onClick={() => selectDay(key)}
                            onKeyDown={(event) => handleDayKeyDown(event, key)}
                            className={classes}
                        >
                            {Number(key.slice(8))}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default SidebarMiniMonth;
