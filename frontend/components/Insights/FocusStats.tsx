import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import {
    FocusStats as Stats,
    fetchFocusStats,
} from '../../utils/focusSessionsService';

const RANGES = [7, 30, 90];

const formatMinutes = (minutes: number) =>
    minutes >= 60
        ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
        : `${minutes} min`;

// One-series bar chart: thin bars, rounded tops, a tooltip per bar.
const Bars: React.FC<{
    label: string;
    values: { key: string; label: string; value: number; tick?: string }[];
}> = ({ label, values }) => {
    const max = Math.max(1, ...values.map((v) => v.value));
    return (
        <figure className="space-y-2">
            <figcaption className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {label}
            </figcaption>
            <div
                className="flex h-32 items-end gap-0.5 border-b border-gray-200 dark:border-gray-600"
                role="img"
                aria-label={label}
            >
                {values.map((v) => (
                    <div
                        key={v.key}
                        className="group relative flex h-full flex-1 items-end"
                        title={`${v.label}: ${formatMinutes(v.value)}`}
                    >
                        <div
                            className="w-full rounded-t bg-blue-500 group-hover:bg-blue-600 dark:bg-blue-400"
                            style={{
                                height: v.value
                                    ? `${(v.value / max) * 100}%`
                                    : 0,
                                minHeight: v.value ? 2 : 0,
                            }}
                        />
                    </div>
                ))}
            </div>
            <div className="flex gap-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                {values.map((v) => (
                    <span key={v.key} className="flex-1 text-center">
                        {v.tick ?? ''}
                    </span>
                ))}
            </div>
        </figure>
    );
};

const FocusStats: React.FC = () => {
    const { t } = useTranslation();
    const [days, setDays] = useState(30);
    const [stats, setStats] = useState<Stats | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
        fetchFocusStats(days)
            .then(setStats)
            .catch(() => setFailed(true));
    }, [days]);

    const busiestHour =
        stats && stats.total_minutes > 0
            ? stats.by_hour.indexOf(Math.max(...stats.by_hour))
            : null;
    const tickEvery = days > 30 ? 14 : days > 7 ? 7 : 1;

    return (
        <section
            className="mt-10 space-y-6"
            aria-labelledby="focus-stats-title"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 id="focus-stats-title" className="text-xl font-light">
                    {t('focusStats.title', 'Focus')}
                </h3>
                <div className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
                    {RANGES.map((range) => (
                        <button
                            key={range}
                            type="button"
                            aria-pressed={days === range}
                            onClick={() => setDays(range)}
                            className={`rounded-md px-3 py-1 text-sm ${
                                days === range
                                    ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                                    : 'text-gray-600 dark:text-gray-300'
                            }`}
                        >
                            {t('focusStats.lastDays', {
                                count: range,
                                defaultValue: '{{count}} days',
                            })}
                        </button>
                    ))}
                </div>
            </div>

            {failed && (
                <p className="text-sm text-gray-500">
                    {t('focusStats.error', 'Could not load focus statistics')}
                </p>
            )}

            {stats && stats.sessions === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t(
                        'focusStats.empty',
                        'No focus sessions yet. Start the tomato timer in the top bar; finished sessions are counted here.'
                    )}
                </p>
            )}

            {stats && stats.sessions > 0 && (
                <>
                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        {[
                            {
                                key: 'total',
                                label: t('focusStats.total', 'Time focused'),
                                value: formatMinutes(stats.total_minutes),
                            },
                            {
                                key: 'sessions',
                                label: t('focusStats.sessions', 'Sessions'),
                                value: String(stats.sessions),
                            },
                            {
                                key: 'hour',
                                label: t(
                                    'focusStats.bestHour',
                                    'Most focused hour'
                                ),
                                value:
                                    busiestHour === null
                                        ? '–'
                                        : `${String(busiestHour).padStart(2, '0')}:00`,
                            },
                        ].map((tile) => (
                            <div
                                key={tile.key}
                                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-800"
                            >
                                <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    {tile.label}
                                </dt>
                                <dd
                                    className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100"
                                    data-testid={`focus-${tile.key}`}
                                >
                                    {tile.value}
                                </dd>
                            </div>
                        ))}
                    </dl>

                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                        <Bars
                            label={t('focusStats.perDay', 'Minutes per day')}
                            values={stats.by_day.map((d, i) => ({
                                key: d.date,
                                label: format(parseISO(d.date), 'PP'),
                                value: d.minutes,
                                tick:
                                    (stats.by_day.length - 1 - i) %
                                        tickEvery ===
                                    0
                                        ? format(parseISO(d.date), 'd/M')
                                        : undefined,
                            }))}
                        />
                        <Bars
                            label={t(
                                'focusStats.perHour',
                                'Minutes by hour of the day'
                            )}
                            values={stats.by_hour.map((minutes, hour) => ({
                                key: String(hour),
                                label: `${String(hour).padStart(2, '0')}:00`,
                                value: minutes,
                                tick: hour % 6 === 0 ? String(hour) : undefined,
                            }))}
                        />
                    </div>

                    {stats.top_tasks.length > 0 && (
                        <table className="w-full text-sm">
                            <caption className="mb-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200">
                                {t(
                                    'focusStats.topTasks',
                                    'Tasks focused on most'
                                )}
                            </caption>
                            <tbody>
                                {stats.top_tasks.map((task) => (
                                    <tr
                                        key={task.uid}
                                        className="border-t border-gray-100 dark:border-gray-700"
                                    >
                                        <td className="py-1.5 text-gray-700 dark:text-gray-200">
                                            {task.name}
                                        </td>
                                        <td className="py-1.5 text-right text-gray-500 dark:text-gray-400">
                                            {formatMinutes(task.minutes)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </>
            )}
        </section>
    );
};

export default FocusStats;
