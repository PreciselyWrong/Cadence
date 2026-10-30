import React from 'react';
import { useTranslation } from 'react-i18next';
import { capacityState } from './autoPlace';
import { formatDuration } from './planUtils';

interface CapacityMeterProps {
    planned: number;
    free: number;
}

// Planned time against the free time of the day. Amber from 90 %, red past
// 100 % with the overshoot spelled out (colour is never the only signal).
const CapacityMeter: React.FC<CapacityMeterProps> = ({ planned, free }) => {
    const { t } = useTranslation();
    const { percent, over, overBy } = capacityState(planned, free);
    const tight = !over && percent >= 90;
    const fill = over
        ? 'bg-red-600'
        : tight
          ? 'bg-amber-500'
          : 'bg-blue-600 dark:bg-blue-500';

    return (
        <div
            className="flex w-full min-w-[12rem] max-w-xs flex-col gap-1 text-[13px]"
            data-testid="capacity"
        >
            <span
                className={
                    over
                        ? 'font-medium text-red-700 dark:text-red-400'
                        : 'text-gray-700 dark:text-gray-300'
                }
            >
                {t('dailyPlan.planned', '{{time}} planned', {
                    time: formatDuration(planned),
                })}{' '}
                <span className="text-gray-500 dark:text-gray-400">
                    {t('dailyPlan.ofFree', 'of {{time}} free', {
                        time: formatDuration(free),
                    })}
                </span>
            </span>
            <div
                role="progressbar"
                aria-label={t('dailyPlan.capacity', 'Day capacity')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(percent, 100)}
                aria-valuetext={`${percent} %`}
                className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
            >
                <div
                    className={`h-full rounded-full transition-[width] ${fill}`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                    data-testid="capacity-fill"
                />
            </div>
            {over && (
                <span
                    role="status"
                    className="text-xs font-medium text-red-700 dark:text-red-400"
                    data-testid="capacity-over"
                >
                    {t(
                        'dailyPlan.capacityOver',
                        '{{time}} too much for today: move something to another day.',
                        { time: formatDuration(overBy) }
                    )}
                </span>
            )}
        </div>
    );
};

export default CapacityMeter;
