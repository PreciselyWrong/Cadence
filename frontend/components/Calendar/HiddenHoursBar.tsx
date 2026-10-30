import React from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { CalendarEvent } from './taskEvents';

interface HiddenHoursBarProps {
    // 'earlier' items start before the visible hours, 'later' ones end after.
    direction: 'earlier' | 'later';
    events: CalendarEvent[];
    onClick: () => void;
    // Compact badge for one day column of the week view.
    compact?: boolean;
}

// Count of timed items hidden above or below the visible hours. Clicking it
// shows the whole day for the current page session.
const HiddenHoursBar: React.FC<HiddenHoursBarProps> = ({
    direction,
    events,
    onClick,
    compact = false,
}) => {
    const { t } = useTranslation();
    const count = events.length;
    const label =
        direction === 'earlier'
            ? t('calendar.hiddenHours.earlier', {
                  count,
                  defaultValue: '{{count}} earlier',
              })
            : t('calendar.hiddenHours.later', {
                  count,
                  defaultValue: '{{count}} later',
              });
    const tooltip = events
        .map(
            (event) =>
                `${format(event.start, 'HH:mm')} – ${format(event.end, 'HH:mm')} ${event.title}`
        )
        .join('\n');

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            title={`${tooltip}\n${t('calendar.hiddenHours.show', 'Show all hours')}`}
            aria-label={t('calendar.hiddenHours.show', 'Show all hours')}
            className={`w-full flex items-center justify-center gap-1 rounded-md font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ${
                compact ? 'px-1 py-0.5 text-[12px]' : 'px-3 py-1.5 text-xs'
            }`}
        >
            <span aria-hidden="true">
                {direction === 'earlier' ? '▲' : '▼'}
            </span>
            <span>{label}</span>
        </button>
    );
};

// The toggle shown while the whole day is displayed.
export const HideHoursButton: React.FC<{ onClick: () => void }> = ({
    onClick,
}) => {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            className="w-full px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
        >
            {t('calendar.hiddenHours.hide', 'Hide early and late hours')}
        </button>
    );
};

export const HIDDEN_HOURS_STRIPES: React.CSSProperties = {
    backgroundImage:
        'repeating-linear-gradient(45deg, rgba(148, 163, 184, 0.14) 0 6px, transparent 6px 12px)',
};

export default HiddenHoursBar;
