import React from 'react';
import { useTranslation } from 'react-i18next';
import { DailyPlanItem } from '../../utils/dailyPlanService';
import { CalendarEvent } from '../../utils/calendarFeedsService';
import { formatDuration, formatMinute } from './planUtils';
import { openTaskPanel } from '../../store/taskPanelStore';

interface AgendaListProps {
    items: DailyPlanItem[];
    events: CalendarEvent[];
    // Minute of the day when the list is for today, to mark what is over.
    now: number | null;
}

interface Row {
    key: string;
    start: number | null;
    end: number | null;
    title: string;
    kind: 'task' | 'event';
    color?: string | null;
    uid?: string;
    done?: boolean;
}

// Orders a day's rows: timed ones by start (then end), untimed after, by
// their given order.
export const buildAgendaRows = (
    items: DailyPlanItem[],
    events: CalendarEvent[]
): { timed: Row[]; untimed: Row[] } => {
    const rows: Row[] = [
        ...items.map<Row>((item) => ({
            key: `item-${item.task_uid}`,
            start: item.start_minute,
            end:
                item.start_minute === null
                    ? null
                    : item.start_minute + item.duration_minutes,
            title: item.task.name,
            kind: 'task',
            uid: item.task_uid,
            done: item.task.status === 2 || item.task.status === 'done',
        })),
        ...events.map<Row>((event) => ({
            key: `event-${event.feed_uid}-${event.uid}-${event.start_minute ?? 'all'}`,
            start: event.all_day ? null : event.start_minute,
            end: event.all_day ? null : event.end_minute,
            title: event.title || event.feed_name,
            kind: event.feed_uid === 'tasks' ? 'task' : 'event',
            color: event.color,
        })),
    ];
    const timed = rows
        .filter((row) => row.start !== null)
        .sort(
            (a, b) =>
                (a.start as number) - (b.start as number) ||
                (a.end ?? 0) - (b.end ?? 0)
        );
    const untimed = rows.filter((row) => row.start === null);
    return { timed, untimed };
};

const AgendaList: React.FC<AgendaListProps> = ({ items, events, now }) => {
    const { t } = useTranslation();
    const { timed, untimed } = buildAgendaRows(items, events);

    const renderRow = (row: Row) => {
        const over = now !== null && row.end !== null && row.end <= now;
        const content = (
            <>
                <span className="w-24 shrink-0 text-xs tabular-nums text-gray-600 dark:text-gray-300">
                    {row.start === null
                        ? t('dailyPlan.agendaAnytime', 'Any time')
                        : `${formatMinute(row.start)}${
                              row.end !== null && row.end > row.start
                                  ? ` – ${formatMinute(row.end)}`
                                  : ''
                          }`}
                </span>
                <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                        backgroundColor:
                            row.kind === 'event'
                                ? row.color || '#6b7280'
                                : '#3b82f6',
                    }}
                    aria-hidden
                />
                <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                        row.done
                            ? 'text-gray-500 line-through'
                            : 'text-gray-900 dark:text-gray-100'
                    }`}
                >
                    {row.title}
                </span>
                {row.start !== null && row.end !== null && (
                    <span className="shrink-0 text-xs text-gray-500">
                        {formatDuration(row.end - row.start)}
                    </span>
                )}
            </>
        );
        const className = `flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ${
            over ? 'opacity-60' : ''
        }`;
        return (
            <li key={row.key} data-testid="agenda-row">
                {row.uid ? (
                    <button
                        type="button"
                        className={`${className} hover:bg-gray-50 dark:hover:bg-gray-800`}
                        onClick={() => openTaskPanel(row.uid as string)}
                    >
                        {content}
                    </button>
                ) : (
                    <div className={className}>{content}</div>
                )}
            </li>
        );
    };

    if (timed.length === 0 && untimed.length === 0) {
        return (
            <p
                className="py-8 text-center text-sm text-gray-600 dark:text-gray-300"
                data-testid="agenda-empty"
            >
                {t('dailyPlan.agendaEmpty', 'Nothing scheduled for this day.')}
            </p>
        );
    }

    return (
        <div data-testid="day-agenda">
            <ul className="flex flex-col">{timed.map(renderRow)}</ul>
            {untimed.length > 0 && (
                <>
                    <h3 className="mb-1 mt-4 px-2 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                        {t('dailyPlan.agendaUntimed', 'No set time')}
                    </h3>
                    <ul className="flex flex-col">{untimed.map(renderRow)}</ul>
                </>
            )}
        </div>
    );
};

export default AgendaList;
