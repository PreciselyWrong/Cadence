import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { FlagIcon } from '@heroicons/react/24/outline';
import TaskCheckCircle from '../Task/TaskCheckCircle';
import { CalendarEvent } from '../../utils/calendarFeedsService';
import { formatMinute, SLOT_MINUTES, sideBySide } from '../DailyPlan/planUtils';
import { DayLine } from './dayModel';
import type { HabitMark } from './dayHabits';
import { Link } from 'react-router-dom';

export const PX_PER_HOUR = 56;
export const PX_PER_MINUTE = PX_PER_HOUR / 60;
const MIN_BLOCK_PX = 20;
const DEFAULT_MINUTES = 30;

// A calendar colour as a flat fill: lighter in light mode, deeper in dark
// mode (--block-mix in tailwind.css), so blocks never turn muddy.
const blockFill = (color: string | null | undefined): string | undefined =>
    color && /^#[0-9a-f]{6}$/i.test(color)
        ? `color-mix(in srgb, ${color} var(--block-mix), transparent)`
        : undefined;

const snap = (minute: number): number =>
    Math.round(minute / SLOT_MINUTES) * SLOT_MINUTES;

/** Minute under a pointer offset (from the grid top), snapped to 15 min. */
export const minuteFromOffset = (
    offsetY: number,
    range: { start: number; end: number }
): number =>
    Math.min(
        range.end,
        Math.max(range.start, snap(range.start + offsetY / PX_PER_MINUTE))
    );

const assignRef = <T,>(ref: React.Ref<T> | undefined, value: T | null) => {
    if (typeof ref === 'function') ref(value);
    else if (ref) (ref as React.MutableRefObject<T | null>).current = value;
};

const laneStyle = (slot?: { lane: number; lanes: number }) => {
    const { lane, lanes } = slot ?? { lane: 0, lanes: 1 };
    const share = 100 / lanes;
    return {
        left: `calc(${share * lane}% + 4px)`,
        width: `calc(${share}% - 8px)`,
    };
};

const timeRange = (start: number, end: number) =>
    `${formatMinute(start)}–${formatMinute(end)}`;

export interface FocusSpan {
    key: string;
    start: number;
    end: number;
    label?: string;
}

/** One day shown as a column of the grid. */
export interface DayColumnData {
    date: string;
    weekday: string;
    dayNumber: number;
    isToday: boolean;
    // Minutes after midnight on today, null on other days.
    now: number | null;
    lines: DayLine[];
    events: CalendarEvent[];
    focus: FocusSpan[];
    // Habits with a time that day (Today only): small markers, not blocks.
    habits?: HabitMark[];
}

export interface DropPreview {
    date: string;
    minute: number;
    duration: number;
    title: string;
    // The task being dragged: its own slot is not a conflict.
    uid?: string;
}

export interface DropWarnings {
    overlaps: boolean;
    past: boolean;
}

const todayIso = (now: Date): string =>
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/**
 * Whether a drop preview would sit on a timed block already in the column
 * (task slots and timed calendar events, the dragged task excluded) or fall
 * in the past: before the now line, or on a day before today.
 * Overlaps stay allowed; the preview only says so.
 */
export const dropWarnings = (
    column: Pick<DayColumnData, 'date' | 'now' | 'lines' | 'events'>,
    drop: Pick<DropPreview, 'minute' | 'duration' | 'uid'>
): DropWarnings => {
    const end = drop.minute + drop.duration;
    const busy = [
        ...column.lines.flatMap((line) =>
            line.start === null || line.uid === drop.uid
                ? []
                : [{ start: line.start, end: line.start + line.duration }]
        ),
        ...column.events.flatMap((event) => {
            if (event.all_day || event.start_minute === null) return [];
            return [
                {
                    start: event.start_minute,
                    end:
                        event.end_minute ??
                        event.start_minute + DEFAULT_MINUTES,
                },
            ];
        }),
    ];
    return {
        overlaps: busy.some(
            (block) => block.start < end && drop.minute < block.end
        ),
        past:
            column.date < todayIso(new Date()) ||
            (column.now !== null && drop.minute < column.now),
    };
};

export interface DayCalendarProps {
    range: { start: number; end: number };
    columns: DayColumnData[];
    header?: React.ReactNode;
    onToggle(line: DayLine): void;
    onOpen(line: DayLine, date: string): void;
    onResize(date: string, uid: string, duration: number): void;
    onMove(date: string, uid: string, start: number): void;
    onUnslot(date: string, uid: string): void;
    drop?: DropPreview | null;
    // The first column's lane, to turn a pointer into a minute.
    gridRef?: React.Ref<HTMLDivElement>;
    // A calendar event (not a task) was clicked.
    onOpenEvent?(event: CalendarEvent, date: string): void;
    // Called from the "too narrow" notice to give the calendar more room.
    onWiden?(): void;
    // The task whose detail is open.
    selectedUid?: string | null;
}

// Under this width per day, blocks are unreadable: the view says so.
const MIN_COLUMN_PX = 110;

interface LineBlockProps {
    line: DayLine;
    kind: 'block' | 'appointment';
    start: number;
    rangeStart: number;
    rangeEnd: number;
    style: React.CSSProperties;
    onToggle(line: DayLine): void;
    onOpen(line: DayLine): void;
    onResize(uid: string, duration: number): void;
    onMove(uid: string, start: number): void;
    onUnslot(uid: string): void;
    // The day the block sits on: drag ids stay unique across columns.
    date: string;
    // Its detail is open: the block shows it was the one clicked.
    selected?: boolean;
}

/**
 * A line drawn on the grid: a task with a slot (resizable, with its checkbox)
 * or an appointment (a due time without a slot, drawn as busy).
 */
const LineBlock: React.FC<LineBlockProps> = ({
    line,
    kind,
    start,
    rangeStart,
    rangeEnd,
    style,
    onToggle,
    onOpen,
    onResize,
    onMove,
    onUnslot,
    date,
    selected = false,
}) => {
    const { t } = useTranslation();
    const { uid, task } = line;
    const { attributes, listeners, setNodeRef, transform, isDragging } =
        useDraggable({
            id: `block:${date}:${uid}`,
            data: { kind, uid, date, start, duration: line.duration },
        });
    const { onKeyDown: dragKeyDown, ...dragListeners } = listeners ?? {};

    const [preview, setPreview] = useState<number | null>(null);
    const detach = useRef<(() => void) | null>(null);
    // A drag or a resize ends with a click on the block: it must not open
    // the task. Only a plain click opens it.
    const moved = useRef(false);
    useEffect(() => {
        if (isDragging) moved.current = true;
    }, [isDragging]);
    useEffect(() => () => detach.current?.(), []);

    const resizable = kind === 'block';
    // Akiflow-like flat pastel: the project's colour, else the accent.
    const fill = blockFill(task.Project?.color);
    const duration = preview ?? line.duration;
    const end = start + duration;
    // A short task stays readable: one line, a little taller than its time.
    const height = Math.max(MIN_BLOCK_PX, duration * PX_PER_MINUTE - 2);
    const top = (start - rangeStart) * PX_PER_MINUTE;
    const label = t(
        kind === 'block' ? 'today.blockLabel' : 'today.appointmentLabel',
        kind === 'block' ? '{{title}}, {{range}}' : '{{title}}, due {{range}}',
        { title: task.name, range: timeRange(start, end) }
    );

    const startResize = (event: React.PointerEvent) => {
        moved.current = true;
        event.stopPropagation();
        event.preventDefault();
        const startY = event.clientY;
        const base = line.duration;
        const maxDuration = Math.max(SLOT_MINUTES, rangeEnd - start);
        let latest = base;
        const move = (e: PointerEvent) => {
            latest = Math.min(
                maxDuration,
                Math.max(
                    SLOT_MINUTES,
                    snap(base + (e.clientY - startY) / PX_PER_MINUTE)
                )
            );
            setPreview(latest);
        };
        const stop = () => {
            detach.current?.();
            setPreview(null);
            if (latest !== base) onResize(uid, latest);
        };
        detach.current = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
            window.removeEventListener('pointercancel', stop);
            detach.current = null;
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        const step = event.key === 'ArrowUp' ? -SLOT_MINUTES : SLOT_MINUTES;
        switch (event.key) {
            case ' ':
                event.preventDefault();
                onToggle(line);
                return;
            case 'Enter':
                event.preventDefault();
                onOpen(line);
                return;
            case 'Delete':
            case 'Backspace':
                if (!resizable) break;
                event.preventDefault();
                onUnslot(uid);
                return;
            case 'ArrowUp':
            case 'ArrowDown':
                if (event.shiftKey) {
                    event.preventDefault();
                    onMove(uid, start + step);
                    return;
                }
                if (event.altKey && resizable) {
                    event.preventDefault();
                    onResize(uid, Math.max(SLOT_MINUTES, line.duration + step));
                    return;
                }
                break;
        }
        dragKeyDown?.(event);
    };

    const tall = height >= 40;

    return (
        <div
            ref={setNodeRef}
            data-testid={`${kind}-${uid}`}
            data-calendar-block
            {...attributes}
            {...dragListeners}
            role="group"
            tabIndex={0}
            aria-label={label}
            onKeyDown={onKeyDown}
            onPointerDownCapture={() => {
                moved.current = false;
            }}
            onClick={() => {
                if (moved.current) {
                    moved.current = false;
                    return;
                }
                onOpen(line);
            }}
            className={`group absolute cursor-grab overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                kind === 'appointment'
                    ? 'bg-surface-high text-surface-on'
                    : fill
                      ? 'text-surface-on'
                      : 'bg-primary-container text-primary-on-container'
            } ${line.done ? 'opacity-50' : ''} ${
                isDragging ? 'z-30 opacity-80 shadow-lg' : 'z-20'
            } ${selected ? 'shadow-md ring-2 ring-primary' : ''}`}
            style={{
                ...style,
                backgroundColor: kind === 'block' ? fill : undefined,
                top,
                height,
                transform: transform
                    ? CSS.Translate.toString(transform)
                    : undefined,
            }}
        >
            <div
                className={`flex h-full min-w-0 gap-1.5 px-2 text-xs ${
                    height < 28 ? 'items-center py-0' : 'items-start py-1'
                }`}
            >
                {kind === 'block' ? (
                    <span className="relative mt-px h-3.5 w-3.5 shrink-0">
                        <span className="absolute left-0 top-0 origin-top-left scale-[0.64]">
                            <TaskCheckCircle
                                task={task}
                                onToggle={() => onToggle(line)}
                            />
                        </span>
                    </span>
                ) : (
                    <FlagIcon
                        aria-hidden="true"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    />
                )}
                <span className="min-w-0 flex-1 overflow-hidden">
                    <span
                        className={`block truncate text-body-m font-semibold ${
                            line.done ? 'line-through' : ''
                        }`}
                    >
                        {task.name}
                    </span>
                    {tall && (
                        <span className="block tabular-nums">
                            {timeRange(start, end)}
                        </span>
                    )}
                </span>
            </div>
            {resizable && (
                <div
                    aria-hidden="true"
                    onPointerDown={startResize}
                    // Only the cursor changes: nothing appears on hover.
                    className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize"
                />
            )}
        </div>
    );
};

interface DayColumnProps {
    column: DayColumnData;
    range: { start: number; end: number };
    first: boolean;
    gridRef?: React.Ref<HTMLDivElement>;
    drop?: DropPreview | null;
    onToggle(line: DayLine): void;
    onOpen(line: DayLine, date: string): void;
    onResize(date: string, uid: string, duration: number): void;
    onMove(date: string, uid: string, start: number): void;
    onUnslot(date: string, uid: string): void;
    onOpenEvent?(event: CalendarEvent, date: string): void;
    selectedUid?: string | null;
}

/** The blocks of one day; the lane is the drop target of that day. */
const DayColumn: React.FC<DayColumnProps> = ({
    column,
    range,
    first,
    gridRef,
    drop,
    onToggle,
    onOpen,
    onResize,
    onMove,
    onUnslot,
    onOpenEvent,
    selectedUid,
}) => {
    const { t } = useTranslation();
    const { date, lines, events, focus, now, habits = [] } = column;
    const openOnDay = useCallback(
        (line: DayLine) => onOpen(line, date),
        [onOpen, date]
    );
    const { setNodeRef: setDrop, isOver } = useDroppable({
        id: `grid:${date}`,
        data: { kind: 'grid', date, rangeStart: range.start },
    });
    const setLane = useCallback(
        (node: HTMLDivElement | null) => {
            setDrop(node);
            if (first) assignRef(gridRef, node);
        },
        [setDrop, gridRef, first]
    );

    const offset = (minute: number) => (minute - range.start) * PX_PER_MINUTE;
    const inRange = (start: number, end: number) =>
        end > range.start && start < range.end;
    const clip = (start: number, end: number) => ({
        start: Math.max(range.start, start),
        end: Math.min(range.end, end),
    });

    const slotted = lines.filter((line) => line.start !== null);
    const appointments = lines.filter(
        (line) => line.start === null && line.dueMinute !== null
    );
    const dueMarkers = slotted.filter(
        (line) =>
            line.dueMinute !== null &&
            line.dueMinute >= range.start &&
            line.dueMinute <= range.end
    );
    const eventBlocks = events.flatMap((event, index) => {
        if (event.all_day || event.start_minute === null) return [];
        const start = event.start_minute;
        const end = event.end_minute ?? start + DEFAULT_MINUTES;
        return inRange(start, end)
            ? [{ key: `event:${index}`, event, ...clip(start, end) }]
            : [];
    });
    const focusBlocks = focus
        .filter((block) => inRange(block.start, block.end))
        .map((block) => ({
            key: `focus:${block.key}`,
            block,
            ...clip(block.start, block.end),
        }));
    const lineSpans = [
        ...slotted.map((line) => ({
            key: `line:${line.uid}`,
            ...clip(
                line.start as number,
                (line.start as number) + line.duration
            ),
        })),
        ...appointments.map((line) => ({
            key: `appt:${line.uid}`,
            ...clip(
                line.dueMinute as number,
                (line.dueMinute as number) + line.duration
            ),
        })),
    ].filter((span) => span.end > span.start);
    const layout = sideBySide([
        ...eventBlocks.map((b) => ({ key: b.key, start: b.start, end: b.end })),
        ...focusBlocks.map((b) => ({ key: b.key, start: b.start, end: b.end })),
        ...lineSpans,
    ]);
    const place = (key: string) => laneStyle(layout.get(key));
    const showDrop = drop && drop.date === date;
    const warnings = showDrop ? dropWarnings(column, drop) : null;
    const warningLabels = [
        warnings?.overlaps && t('today.dropOverlaps', 'Overlaps'),
        warnings?.past && t('today.dropPast', 'In the past'),
    ].filter(Boolean) as string[];
    const warned = warningLabels.length > 0;

    return (
        <div
            ref={setLane}
            data-testid={first ? 'calendar-grid' : `calendar-grid-${date}`}
            className={`relative h-full min-w-0 flex-1 border-l border-outline-variant/40 ${
                isOver ? 'bg-primary/[0.03]' : ''
            }`}
        >
            {focusBlocks.map(({ key, block, start, end }) => (
                <div
                    key={key}
                    className="absolute overflow-hidden rounded-md px-2 py-1 text-xs text-surface-on-variant"
                    style={{
                        ...place(key),
                        top: offset(start),
                        height: (end - start) * PX_PER_MINUTE,
                        backgroundImage:
                            'repeating-linear-gradient(-45deg, rgb(var(--color-outline-variant) / 0.35) 0 6px, transparent 6px 12px)',
                    }}
                >
                    {block.label ?? t('today.protectedTime', 'Protected time')}
                </div>
            ))}

            {/* A habit's time: a slim marker on the right edge that opens
                the habit (logging stays on the list, one tap away). Not
                draggable: the time is the habit's reminder. */}
            {habits
                .filter(
                    (mark) =>
                        mark.minute >= range.start && mark.minute < range.end
                )
                .map((mark) => (
                    <Link
                        key={`habit:${mark.uid}`}
                        to={`/habit/${mark.uid}`}
                        data-testid="calendar-habit"
                        aria-label={t('today.habitAt', '{{name}} at {{time}}', {
                            name: mark.name,
                            time: formatMinute(mark.minute),
                        })}
                        className={`absolute right-1 z-[5] flex h-5 max-w-[60%] -translate-y-1/2 items-center gap-1 truncate rounded-full border-l-[3px] bg-surface-high px-1.5 text-[11px] leading-none text-surface-on shadow-sm hover:bg-surface-highest ${
                            mark.done ? 'opacity-60 line-through' : ''
                        }`}
                        style={{
                            top: offset(mark.minute),
                            borderLeftColor: mark.color ?? undefined,
                        }}
                    >
                        <span className="truncate">{mark.name}</span>
                    </Link>
                ))}

            {eventBlocks.map(({ key, event, start, end }) => (
                <button
                    type="button"
                    key={key}
                    onClick={() => onOpenEvent?.(event, date)}
                    aria-label={`${event.title}, ${timeRange(start, end)}`}
                    className={`absolute overflow-hidden rounded-md px-2 py-1 text-left text-xs text-surface-on ${
                        event.color ? '' : 'bg-surface-high'
                    }`}
                    style={{
                        ...place(key),
                        top: offset(start),
                        height: Math.max(
                            MIN_BLOCK_PX,
                            (end - start) * PX_PER_MINUTE - 2
                        ),
                        backgroundColor: blockFill(event.color),
                    }}
                >
                    <span className="block truncate text-body-m font-semibold">
                        {event.title}
                    </span>
                    {(end - start) * PX_PER_MINUTE >= 40 && (
                        <span className="block tabular-nums text-surface-on-variant">
                            {timeRange(start, end)}
                        </span>
                    )}
                </button>
            ))}

            {slotted.map((line) => (
                <LineBlock
                    key={line.uid}
                    line={line}
                    kind="block"
                    start={line.start as number}
                    rangeStart={range.start}
                    rangeEnd={range.end}
                    style={place(`line:${line.uid}`)}
                    onToggle={onToggle}
                    onOpen={openOnDay}
                    onResize={(uid, duration) => onResize(date, uid, duration)}
                    onMove={(uid, start) => onMove(date, uid, start)}
                    onUnslot={(uid) => onUnslot(date, uid)}
                    date={date}
                    selected={line.uid === selectedUid}
                />
            ))}

            {appointments.map((line) => (
                <LineBlock
                    key={line.uid}
                    line={line}
                    kind="appointment"
                    start={line.dueMinute as number}
                    rangeStart={range.start}
                    rangeEnd={range.end}
                    style={place(`appt:${line.uid}`)}
                    onToggle={onToggle}
                    onOpen={openOnDay}
                    onResize={(uid, duration) => onResize(date, uid, duration)}
                    onMove={(uid, start) => onMove(date, uid, start)}
                    onUnslot={(uid) => onUnslot(date, uid)}
                    date={date}
                    selected={line.uid === selectedUid}
                />
            ))}

            {dueMarkers.map((line) => (
                <div
                    key={`due-${line.uid}`}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 right-0 z-10 border-t border-dashed border-outline"
                    style={{ top: offset(line.dueMinute as number) }}
                >
                    <span className="absolute right-1 top-0 inline-flex -translate-y-1/2 items-center gap-1 rounded-full bg-surface px-1.5 text-xs tabular-nums text-surface-on-variant ring-1 ring-inset ring-outline-variant">
                        <FlagIcon className="h-3 w-3" />
                        {formatMinute(line.dueMinute as number)}
                    </span>
                </div>
            ))}

            {showDrop && (
                <div
                    aria-hidden="true"
                    data-testid="drop-preview"
                    data-warned={warned ? 'true' : undefined}
                    className={`pointer-events-none absolute inset-x-1 z-40 overflow-hidden rounded-md ring-2 ${
                        warned
                            ? 'bg-warning-container/70 ring-warning dark:bg-warning/20'
                            : 'ring-primary'
                    }`}
                    style={{
                        top: offset(drop.minute),
                        height: drop.duration * PX_PER_MINUTE,
                    }}
                >
                    <span
                        className={`block truncate px-2 py-1 text-xs font-medium tabular-nums ${
                            warned ? 'text-warning' : 'text-primary'
                        }`}
                    >
                        {formatMinute(drop.minute)}
                        {drop.title ? ` · ${drop.title}` : ''}
                        {warningLabels.map((label) => (
                            <span key={label} className="ml-1.5 font-semibold">
                                {label}
                            </span>
                        ))}
                    </span>
                </div>
            )}

            {now !== null && now >= range.start && now <= range.end && (
                <>
                    <span
                        aria-hidden="true"
                        data-testid="now-line"
                        className="pointer-events-none absolute left-0 right-0 z-30 h-[1.5px] bg-danger"
                        style={{ top: offset(now) }}
                    />
                    <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-0 z-30 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-danger"
                        style={{ top: offset(now) }}
                    />
                </>
            )}
        </div>
    );
};

/**
 * The time grid of the Today page: one column per day (1, 3 or 7), the
 * hours on the left. Blocks are placed side by side when they overlap; each
 * day's lane is the drop target for list lines.
 */
const DayCalendar: React.FC<DayCalendarProps> = ({
    range,
    columns,
    header,
    onToggle,
    onOpen,
    onResize,
    onMove,
    onUnslot,
    drop,
    gridRef,
    onOpenEvent,
    onWiden,
    selectedUid,
}) => {
    const { t } = useTranslation();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(([entry]) =>
            setWidth(entry.contentRect.width)
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    const tooNarrow =
        columns.length > 1 &&
        width > 0 &&
        (width - 48) / columns.length < MIN_COLUMN_PX;
    const height = (range.end - range.start) * PX_PER_MINUTE;
    const offset = (minute: number) => (minute - range.start) * PX_PER_MINUTE;
    const now = columns.find((column) => column.now !== null)?.now ?? null;
    const multi = columns.length > 1;

    const firstSlot = columns[0]?.lines.reduce<number | null>(
        (min, line) =>
            line.start !== null && (min === null || line.start < min)
                ? line.start
                : min,
        null
    );

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const target = now ?? firstSlot ?? range.start;
        el.scrollTop = Math.max(0, offset(target) - el.clientHeight / 3);
        // Only on mount: later renders must not move the user's scroll.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const hours: number[] = [];
    for (let minute = range.start; minute < range.end; minute += 60) {
        hours.push(minute);
    }
    const hasAllDay = columns.some((column) =>
        column.events.some((event) => event.all_day)
    );

    return (
        <section
            aria-label={t('today.calendarLabel', 'Day calendar')}
            className="flex h-full min-h-0 flex-col"
        >
            {header && <div className="px-4 pb-1 pt-3">{header}</div>}

            {tooNarrow && (
                <div
                    role="status"
                    className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-warning-container/60 py-1 pl-3 pr-1 text-body-m text-warning dark:bg-warning/10"
                >
                    <span className="min-w-0 flex-1">
                        {t(
                            'today.tooNarrow',
                            'Too narrow for {{count}} days: widen the calendar or show fewer days.',
                            { count: columns.length }
                        )}
                    </span>
                    {onWiden && (
                        <button
                            type="button"
                            onClick={onWiden}
                            className="h-7 shrink-0 rounded-md px-2.5 font-medium text-surface-on hover:bg-black/5 dark:hover:bg-white/10"
                        >
                            {t('today.widen', 'Widen')}
                        </button>
                    )}
                </div>
            )}

            <div className="flex pr-2">
                <span className="w-12 shrink-0" />
                {columns.map((column) => (
                    <div
                        key={column.date}
                        className="flex min-w-0 flex-1 flex-col items-center pb-1.5"
                    >
                        <span className="text-xs font-medium uppercase tracking-wide text-surface-on-variant">
                            {column.weekday}
                        </span>
                        <span
                            className={`mt-0.5 grid h-8 w-8 place-items-center rounded-full tabular-nums ${
                                multi ? 'text-body' : 'text-title'
                            } ${
                                column.isToday
                                    ? 'bg-primary font-semibold text-primary-on'
                                    : 'text-surface-on'
                            }`}
                        >
                            {column.dayNumber}
                        </span>
                    </div>
                ))}
            </div>

            {hasAllDay && (
                <div className="flex border-b border-outline-variant/40 pb-1 pr-2">
                    <span className="w-12 shrink-0" />
                    {columns.map((column) => (
                        <div
                            key={column.date}
                            className="flex min-w-0 flex-1 flex-wrap gap-1 px-1"
                        >
                            {column.events
                                .filter((event) => event.all_day)
                                .map((event, index) => (
                                    <button
                                        type="button"
                                        key={`${event.uid}-${index}`}
                                        onClick={() =>
                                            onOpenEvent?.(event, column.date)
                                        }
                                        className={`inline-flex h-6 max-w-full items-center rounded-md px-2 text-xs font-medium text-surface-on ${
                                            event.color ? '' : 'bg-surface-high'
                                        }`}
                                        style={{
                                            backgroundColor: blockFill(
                                                event.color
                                            ),
                                        }}
                                    >
                                        <span className="truncate">
                                            {event.title}
                                        </span>
                                    </button>
                                ))}
                        </div>
                    ))}
                </div>
            )}

            <div
                ref={scrollRef}
                className="relative min-h-0 flex-1 overflow-y-auto py-3 pr-2"
            >
                <div className="relative flex" style={{ height }}>
                    <div className="relative w-12 shrink-0">
                        {hours.map((minute) => (
                            <span
                                key={minute}
                                className="absolute left-0 w-12 -translate-y-1/2 pr-2 text-right text-xs tabular-nums text-surface-on-variant"
                                style={{ top: offset(minute) }}
                            >
                                {formatMinute(minute)}
                            </span>
                        ))}
                        {now !== null &&
                            now >= range.start &&
                            now <= range.end && (
                                <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute left-0 z-30 w-12 -translate-y-1/2 bg-surface pr-2 text-right text-xs font-semibold tabular-nums text-danger"
                                    style={{ top: offset(now) }}
                                >
                                    {formatMinute(now)}
                                </span>
                            )}
                    </div>
                    <div className="relative flex min-w-0 flex-1">
                        {hours.map((minute) => (
                            <span
                                key={minute}
                                aria-hidden="true"
                                className="pointer-events-none absolute left-0 right-0 h-px bg-outline-variant/50"
                                style={{ top: offset(minute) }}
                            />
                        ))}
                        {columns.map((column, index) => (
                            <DayColumn
                                key={column.date}
                                column={column}
                                range={range}
                                first={index === 0}
                                gridRef={gridRef}
                                drop={drop}
                                onToggle={onToggle}
                                onOpen={onOpen}
                                onResize={onResize}
                                onMove={onMove}
                                onUnslot={onUnslot}
                                onOpenEvent={onOpenEvent}
                                selectedUid={selectedUid}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default DayCalendar;
