import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../DailyPlan/planUtils';
import type { WeekLoad } from './weekLoad';

// The rest of this week against its hours, in the header of the left
// column's « This week »: red when over.
const WeekLoadBadge: React.FC<{ load: WeekLoad }> = ({ load }) => {
    const { t } = useTranslation();
    const over = load.planned > load.available;
    return (
        <span
            data-testid="week-load"
            data-over={over}
            title={t(
                'upcoming.weekLoadTitle',
                'Planned from today to the end of the week, against your day hours'
            )}
            className={`ml-auto whitespace-nowrap text-xs tabular-nums ${
                over ? 'font-semibold text-danger' : 'text-surface-on-variant'
            }`}
        >
            {t('upcoming.load', '{{planned}} / {{available}}', {
                planned: formatDuration(load.planned),
                available: formatDuration(load.available),
            })}
        </span>
    );
};

export default WeekLoadBadge;
