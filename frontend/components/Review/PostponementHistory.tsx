import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    fetchTaskPostponements,
    ScheduleChangeKind,
    TaskPostponements,
} from '../../utils/reviewService';
import { formatDay } from './reviewUtils';

// Kinds worth listing; time shifts and automatic changes are only counted.
const LISTED: ScheduleChangeKind[] = [
    'postponed',
    'rescheduled',
    'unscheduled',
    'advanced',
];

interface PostponementHistoryProps {
    taskUid: string;
    // Changes when the task is saved, so the history reloads.
    version?: string | null;
}

// A short line in the task pane once a task has been pushed back, and its
// history on request. Shows nothing for a task never pushed.
const PostponementHistory: React.FC<PostponementHistoryProps> = ({
    taskUid,
    version,
}) => {
    const { t, i18n } = useTranslation();
    const [data, setData] = useState<TaskPostponements | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchTaskPostponements(taskUid)
            .then((result) => {
                if (!cancelled) setData(result);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [taskUid, version]);

    if (!data || data.total_count === 0) return null;

    const locale = i18n.language;
    const kindLabel = (kind: ScheduleChangeKind | 'missed') =>
        ({
            postponed: t('postponements.kinds.postponed', 'Pushed back'),
            rescheduled: t('postponements.kinds.rescheduled', 'Rescheduled'),
            time_shift: t('postponements.kinds.time_shift', 'Time changed'),
            advanced: t('postponements.kinds.advanced', 'Moved earlier'),
            scheduled: t('postponements.kinds.scheduled', 'Date set'),
            unscheduled: t('postponements.kinds.unscheduled', 'Date removed'),
            automatic: t(
                'postponements.kinds.automatic',
                'Changed automatically'
            ),
            missed: t('postponements.kinds.missed', 'Planned, not done'),
        })[kind];

    const entries = [
        ...data.changes
            .filter((change) => LISTED.includes(change.kind))
            .map((change) => ({
                at: change.at,
                kind: change.kind as ScheduleChangeKind | 'missed',
                detail:
                    change.from || change.to
                        ? `${formatDay(change.from, locale) || '—'} → ${
                              formatDay(change.to, locale) || '—'
                          }`
                        : '',
            })),
        ...data.missed_days.map((day) => ({
            at: day,
            kind: 'missed' as const,
            detail: formatDay(day, locale),
        })),
    ].sort((a, b) => b.at.localeCompare(a.at));

    return (
        <div className="text-xs text-gray-500 dark:text-gray-400">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className="text-left hover:text-gray-800 dark:hover:text-gray-200"
            >
                {t(
                    'postponements.summary',
                    'Pushed back {{total}} times, {{count}} in the last 30 days',
                    { total: data.total_count, count: data.recent_count }
                )}
                {data.last_postponed_on &&
                    ` · ${formatDay(data.last_postponed_on, locale)}`}
            </button>
            {open && (
                <ul className="mt-2 space-y-1">
                    {entries.map((entry, index) => (
                        <li key={`${entry.at}-${index}`} className="flex gap-2">
                            <span className="w-14 flex-shrink-0 text-gray-400">
                                {formatDay(entry.at, locale)}
                            </span>
                            <span>
                                {kindLabel(entry.kind)}
                                {entry.detail && entry.kind !== 'missed'
                                    ? ` · ${entry.detail}`
                                    : ''}
                            </span>
                        </li>
                    ))}
                    {!data.history_complete && (
                        <li className="text-gray-400">…</li>
                    )}
                </ul>
            )}
        </div>
    );
};

export default PostponementHistory;
