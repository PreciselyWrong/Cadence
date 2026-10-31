import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { DayName, DayStatus } from '../../utils/cadenceHabitsService';
import {
    DAY_NAMES,
    addDays,
    dayLabel,
    formatDate,
    monthEnd,
    monthStart,
    shiftMonth,
} from '../../utils/cadenceHabitUtils';

export type CalendarStatus = DayStatus | 'CLEAR' | 'OCCURRENCE' | 'UNOBSERVED';

interface HabitCalendarProps {
    // Any date of the month on show
    month: string;
    today: string;
    firstDay: DayName;
    statusOf: (date: string) => CalendarStatus | undefined;
    // What was noted on a date, as a short text ("30 min")
    totalOf: (date: string) => string | null;
    selected: string | null;
    onSelect: (date: string) => void;
    onMonthChange: (month: string) => void;
    // Earliest month that can be shown
    earliest: string;
}

// The glyph says what the colour says, so nothing relies on colour alone.
const LOOK: Record<string, { cell: string; glyph: string }> = {
    IDEAL: { cell: 'bg-success-container text-success', glyph: '✓' },
    MINIMUM: { cell: 'bg-warning-container text-warning', glyph: '◐' },
    MISSED: {
        cell: 'bg-danger-container text-danger-on-container',
        glyph: '×',
    },
    PAUSED: { cell: 'bg-surface-variant text-surface-on-variant', glyph: '॥' },
    ACTIVITY: {
        cell: 'bg-primary-container text-primary-on-container',
        glyph: '•',
    },
    CLEAR: { cell: 'bg-success-container text-success', glyph: '✓' },
    OCCURRENCE: {
        cell: 'bg-danger-container text-danger-on-container',
        glyph: '×',
    },
};

const HabitCalendar: React.FC<HabitCalendarProps> = ({
    month,
    today,
    firstDay,
    statusOf,
    totalOf,
    selected,
    onSelect,
    onMonthChange,
    earliest,
}) => {
    const { t, i18n } = useTranslation();
    const language = i18n?.language ?? 'en';
    const first = monthStart(month);
    const last = monthEnd(month);
    const firstIndex = DAY_NAMES.indexOf(firstDay);
    // Sunday is 0 in JS; DAY_NAMES starts on Monday
    const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
    const blanks = (weekday - firstIndex + 7) % 7;
    const header = [
        ...DAY_NAMES.slice(firstIndex),
        ...DAY_NAMES.slice(0, firstIndex),
    ];
    const days: string[] = [];
    for (let date = first; date <= last; date = addDays(date, 1))
        days.push(date);
    const canGoBack = shiftMonth(first, -1) >= monthStart(earliest);
    const canGoForward = shiftMonth(first, 1) <= monthStart(today);

    const statusNames: Record<string, string> = {
        IDEAL: t('cadenceHabits.calendar.ideal', 'goal reached'),
        MINIMUM: t('cadenceHabits.calendar.minimum', 'minimum reached'),
        MISSED: t('cadenceHabits.calendar.missed', 'missed'),
        PAUSED: t('cadenceHabits.calendar.paused', 'paused'),
        ACTIVITY: t('cadenceHabits.calendar.activity', 'activity'),
        CLEAR: t('cadenceHabits.calendar.clear', 'clear'),
        OCCURRENCE: t('cadenceHabits.calendar.occurrence', 'slip noted'),
    };

    const navButton =
        'flex h-11 w-11 items-center justify-center rounded-full text-surface-on hover:bg-surface-variant/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40';

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <button
                    type="button"
                    className={navButton}
                    disabled={!canGoBack}
                    onClick={() => onMonthChange(shiftMonth(first, -1))}
                    aria-label={t(
                        'cadenceHabits.calendar.previous',
                        'Previous month'
                    )}
                >
                    <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                </button>
                <h3
                    className="text-title-m capitalize text-surface-on"
                    aria-live="polite"
                >
                    {formatDate(first, language, {
                        month: 'long',
                        year: 'numeric',
                    })}
                </h3>
                <button
                    type="button"
                    className={navButton}
                    disabled={!canGoForward}
                    onClick={() => onMonthChange(shiftMonth(first, 1))}
                    aria-label={t('cadenceHabits.calendar.next', 'Next month')}
                >
                    <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
                {header.map((day) => (
                    <span
                        key={day}
                        aria-hidden="true"
                        className="py-1 text-label-m text-surface-on-variant"
                    >
                        {dayLabel(day, language)}
                    </span>
                ))}
                {Array.from({ length: blanks }, (_, i) => (
                    <span key={`blank-${i}`} aria-hidden="true" />
                ))}
                {days.map((date) => {
                    const status = statusOf(date);
                    const look = status ? LOOK[status] : undefined;
                    const total = totalOf(date);
                    const future = date > today;
                    const isSelected = selected === date;
                    const label = [
                        formatDate(date, language, { dateStyle: 'full' }),
                        status ? statusNames[status] : null,
                        total,
                    ]
                        .filter(Boolean)
                        .join(', ');
                    return (
                        <button
                            key={date}
                            type="button"
                            aria-label={label}
                            aria-pressed={isSelected}
                            aria-current={date === today ? 'date' : undefined}
                            disabled={future}
                            onClick={() => onSelect(date)}
                            className={`relative flex min-h-[44px] flex-col items-center justify-center rounded-chip text-body-m transition-colors duration-[220ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 disabled:opacity-40 ${
                                look?.cell ?? 'text-surface-on'
                            } ${isSelected ? 'ring-2 ring-primary' : ''} ${
                                date === today ? 'font-bold underline' : ''
                            }`}
                        >
                            <span aria-hidden="true">
                                {Number(date.slice(8))}
                            </span>
                            <span
                                aria-hidden="true"
                                className="text-[10px] leading-3"
                            >
                                {look?.glyph ?? ' '}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default HabitCalendar;
