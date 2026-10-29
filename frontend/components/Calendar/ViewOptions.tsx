import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { isTaskCompleted } from '../../constants/taskStatus';
import { CalendarColorBy } from './taskEvents';

export interface CalendarOptions {
    showCompleted: boolean;
    showWeekends: boolean;
    showRepeats: boolean;
    colorBy: CalendarColorBy;
}

export const DEFAULT_CALENDAR_OPTIONS: CalendarOptions = {
    showCompleted: true,
    showWeekends: true,
    showRepeats: true,
    colorBy: 'default',
};

const COLOR_BY: CalendarColorBy[] = ['default', 'project', 'priority', 'tag'];

// Reads ui_settings.calendar, keeping the default for anything missing.
export const readCalendarOptions = (saved: unknown): CalendarOptions => {
    const value = (saved && typeof saved === 'object' ? saved : {}) as Record<
        string,
        unknown
    >;
    const flag = (key: keyof CalendarOptions) =>
        typeof value[key] === 'boolean'
            ? (value[key] as boolean)
            : (DEFAULT_CALENDAR_OPTIONS[key] as boolean);
    return {
        showCompleted: flag('showCompleted'),
        showWeekends: flag('showWeekends'),
        showRepeats: flag('showRepeats'),
        colorBy: COLOR_BY.includes(value.colorBy as CalendarColorBy)
            ? (value.colorBy as CalendarColorBy)
            : 'default',
    };
};

// The tasks the calendar draws under these options.
export const visibleTasks = <
    T extends {
        status?: any;
        completed_at?: string | null;
        is_virtual_occurrence?: boolean;
    },
>(
    tasks: T[],
    options: CalendarOptions
): T[] =>
    tasks.filter((task) => {
        if (!options.showRepeats && task.is_virtual_occurrence) return false;
        if (
            !options.showCompleted &&
            (task.completed_at || isTaskCompleted(task.status))
        ) {
            return false;
        }
        return true;
    });

export const isWeekend = (day: Date) =>
    day.getDay() === 0 || day.getDay() === 6;

interface ViewOptionsProps {
    options: CalendarOptions;
    onChange: (options: CalendarOptions) => void;
}

const ViewOptions: React.FC<ViewOptionsProps> = ({ options, onChange }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node))
                setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const toggles: {
        key: 'showCompleted' | 'showWeekends' | 'showRepeats';
        label: string;
    }[] = [
        {
            key: 'showCompleted',
            label: t('calendar.options.showCompleted', 'Show completed'),
        },
        {
            key: 'showWeekends',
            label: t('calendar.options.showWeekends', 'Show weekends'),
        },
        {
            key: 'showRepeats',
            label: t('calendar.options.showRepeats', 'Show all repeats'),
        },
    ];

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                aria-label={t('calendar.options.title', 'View options')}
                title={t('calendar.options.title', 'View options')}
                className="p-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-all"
            >
                <AdjustmentsHorizontalIcon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </button>
            {open && (
                <div
                    role="dialog"
                    aria-label={t('calendar.options.title', 'View options')}
                    className="absolute right-0 z-30 mt-2 w-60 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg p-3 space-y-2"
                >
                    {toggles.map(({ key, label }) => (
                        <label
                            key={key}
                            className="flex items-center justify-between gap-2 text-sm text-gray-700 dark:text-gray-200"
                        >
                            {label}
                            <input
                                type="checkbox"
                                checked={options[key]}
                                onChange={(e) =>
                                    onChange({
                                        ...options,
                                        [key]: e.target.checked,
                                    })
                                }
                                className="h-4 w-4 rounded border-gray-300 text-blue-600"
                            />
                        </label>
                    ))}
                    <label className="flex items-center justify-between gap-2 text-sm text-gray-700 dark:text-gray-200">
                        {t('calendar.options.colorBy', 'Colour by')}
                        <select
                            value={options.colorBy}
                            onChange={(e) =>
                                onChange({
                                    ...options,
                                    colorBy: e.target.value as CalendarColorBy,
                                })
                            }
                            className="rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-1.5 py-1"
                        >
                            {COLOR_BY.map((key) => (
                                <option key={key} value={key}>
                                    {t(`calendar.options.colorBy_${key}`, key)}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            )}
        </div>
    );
};

export default ViewOptions;
