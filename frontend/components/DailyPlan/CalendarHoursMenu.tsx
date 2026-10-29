import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { VisibleHours } from '../Calendar/visibleHours';
import { VisibleHoursPicker } from '../Calendar/ViewOptions';

interface CalendarHoursMenuProps {
    value: VisibleHours;
    onChange: (hours: VisibleHours) => void;
}

// The "more" menu of the Today calendar: the hours the grid shows.
const CalendarHoursMenu: React.FC<CalendarHoursMenuProps> = ({
    value,
    onChange,
}) => {
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

    const label = t('dailyPlan.calendarMenu', 'More calendar options');

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                aria-expanded={open}
                aria-label={label}
                title={label}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
                <EllipsisHorizontalIcon
                    className="h-5 w-5"
                    aria-hidden="true"
                />
            </button>
            {open && (
                <div
                    role="dialog"
                    aria-label={label}
                    className="absolute right-0 z-30 mt-2 w-60 space-y-2 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-600 dark:bg-gray-800"
                >
                    <VisibleHoursPicker value={value} onChange={onChange} />
                </div>
            )}
        </div>
    );
};

export default CalendarHoursMenu;
