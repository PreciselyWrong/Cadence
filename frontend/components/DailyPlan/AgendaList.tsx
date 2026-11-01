import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DailyPlanItem } from '../../utils/dailyPlanService';
import { CalendarEvent } from '../../utils/calendarFeedsService';
import { formatDuration, formatMinute } from './planUtils';
import { openTaskPanel } from '../../store/taskPanelStore';

interface AgendaListProps {
    items: DailyPlanItem[];
    events: CalendarEvent[];
    // Minute of the day when the list is for today, to mark what is over.
    now: number | null;
    // On Today: untimed plan rows become sortable (the page's DndContext
    // saves the order) and open plan rows offer to move their due date.
    sortable?: boolean;
    onReschedule?: (item: DailyPlanItem, when: RescheduleWhen) => void;
}

type RescheduleWhen = 'tomorrow' | 'next_week';

interface Row {
    key: string;
    start: number | null;
    end: number | null;
    title: string;
    kind: 'task' | 'event';
    color?: string | null;
    uid?: string;
    done?: boolean;
    item?: DailyPlanItem;
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
            done:
                item.task.status === 2 ||
                item.task.status === 'done' ||
                !!item.occurrence_done,
            item,
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

// An untimed plan row that can be dragged onto another one to take its
// place. The pointer drags from anywhere on the row (a plain click still
// opens the task); the keyboard drags from the "Any time" label, so Enter on
// the row keeps opening the task.
const SortableRow: React.FC<{
    id: string;
    item: DailyPlanItem;
    handle: React.ReactNode;
    children: React.ReactNode;
}> = ({ id, item, handle, children }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, data: { type: 'item', item } });
    return (
        <li
            ref={setNodeRef}
            data-testid="agenda-row"
            className={`group flex items-center ${isDragging ? 'opacity-40' : ''}`}
            style={{
                // The drag overlay carries the row; the row stays in place.
                transform: isDragging
                    ? undefined
                    : CSS.Transform.toString(transform),
                transition,
            }}
            onPointerDown={
                listeners?.onPointerDown as
                    React.PointerEventHandler | undefined
            }
        >
            <span
                {...attributes}
                onKeyDown={
                    listeners?.onKeyDown as
                        React.KeyboardEventHandler | undefined
                }
                className="cursor-grab rounded active:cursor-grabbing"
                data-testid={`agenda-handle-${item.task_uid}`}
            >
                {handle}
            </span>
            {children}
        </li>
    );
};

const AgendaList: React.FC<AgendaListProps> = ({
    items,
    events,
    now,
    sortable = false,
    onReschedule,
}) => {
    const { t } = useTranslation();
    const { timed, untimed } = buildAgendaRows(items, events);

    const timeLabel = (row: Row) => (
        <span className="block w-28 shrink-0 px-2 py-2 text-xs tabular-nums text-gray-600 dark:text-gray-300">
            {row.start === null
                ? t('dailyPlan.agendaAnytime', 'Any time')
                : `${formatMinute(row.start)}${
                      row.end !== null && row.end > row.start
                          ? ` – ${formatMinute(row.end)}`
                          : ''
                  }`}
        </span>
    );

    const body = (row: Row) => (
        <>
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

    // Tomorrow / Next week on an open plan row; shown on hover or focus where
    // a pointer can hover, always on touch screens.
    const dateChips = (row: Row) =>
        onReschedule && row.item && !row.done ? (
            <span className="flex shrink-0 gap-1 pl-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
                {(['tomorrow', 'next_week'] as const).map((when) => (
                    <button
                        key={when}
                        type="button"
                        onClick={() =>
                            onReschedule(row.item as DailyPlanItem, when)
                        }
                        className="rounded px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        data-testid={`agenda-${when}-${row.uid}`}
                    >
                        {when === 'tomorrow'
                            ? t('dailyPlan.tomorrow', 'Tomorrow')
                            : t('dailyPlan.nextWeek', 'Next week')}
                    </button>
                ))}
            </span>
        ) : null;

    const renderRow = (row: Row) => {
        const over = now !== null && row.end !== null && row.end <= now;
        const rowClass =
            'flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2 pr-2 text-left';
        const main = row.uid ? (
            <button
                type="button"
                className={`${rowClass} hover:bg-gray-50 dark:hover:bg-gray-800`}
                onClick={() => openTaskPanel(row.uid as string)}
            >
                {body(row)}
            </button>
        ) : (
            <div className={rowClass}>{body(row)}</div>
        );
        if (sortable && row.item && row.start === null) {
            return (
                <SortableRow
                    key={row.key}
                    id={`item:${row.item.task_uid}`}
                    item={row.item}
                    handle={timeLabel(row)}
                >
                    {main}
                    {dateChips(row)}
                </SortableRow>
            );
        }
        return (
            <li
                key={row.key}
                data-testid="agenda-row"
                className={`group flex items-center ${over ? 'opacity-60' : ''}`}
            >
                {timeLabel(row)}
                {main}
                {dateChips(row)}
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

    const untimedList = (
        <ul className="flex flex-col">{untimed.map(renderRow)}</ul>
    );

    return (
        <div data-testid="day-agenda">
            <ul className="flex flex-col">{timed.map(renderRow)}</ul>
            {untimed.length > 0 && (
                <>
                    <h3 className="mb-1 mt-4 px-2 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                        {t('dailyPlan.agendaUntimed', 'No set time')}
                    </h3>
                    {sortable ? (
                        <SortableContext
                            items={untimed
                                .filter((row) => row.item)
                                .map((row) => `item:${row.item!.task_uid}`)}
                            strategy={verticalListSortingStrategy}
                        >
                            {untimedList}
                        </SortableContext>
                    ) : (
                        untimedList
                    )}
                </>
            )}
        </div>
    );
};

export default AgendaList;
