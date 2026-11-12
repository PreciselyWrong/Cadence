import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
    CollisionDetection,
    DndContext,
    DragEndEvent,
    DragMoveEvent,
    DragOverlay,
    DragStartEvent,
    KeyboardSensor,
    MeasuringStrategy,
    PointerSensor,
    TouchSensor,
    pointerWithin,
    rectIntersection,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { parseISO } from 'date-fns';
import {
    CalendarDaysIcon,
    ChevronDoubleRightIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import { TASK_STATUS, isTaskDone } from '../../constants/taskStatus';
import { getUserTimezone } from '../../utils/dateUtils';
import { useTaskPane } from '../../contexts/TaskPaneContext';
import { useStore } from '../../store/useStore';
import { useToast } from '../Shared/ToastContext';
import Button, { IconButton } from '../Shared/ui/Button';
import {
    createTask,
    toggleTaskCompletion,
    updateTask,
} from '../../utils/tasksService';
import {
    applyPlanOps,
    PlanChangedError,
    restorePlan,
} from '../../utils/dayService';
import type { PlanOp } from '../../utils/dayService';
import type { DailyPlanItem } from '../../utils/dailyPlanService';
import type { FeedEventDetail } from '../Calendar/FeedEventPopover';
import FeedEventPopover from '../Calendar/FeedEventPopover';
import { intlLocale, minuteOfDay } from '../DailyPlan/planUtils';
import {
    DayLine,
    dayLines,
    lineAt,
    tasksOf,
    toPlanInput,
} from '../Today/dayModel';
import DayCalendar, {
    DayColumnData,
    DropPreview,
    PX_PER_MINUTE,
    minuteFromOffset,
} from '../Today/DayCalendar';
import { useIsNarrow } from '../../hooks/useIsNarrow';
import PaneSplitter, { usePaneWidth } from '../DailyPlan/PaneSplitter';
import { useCalendarEvents, useDays, useHorizonTasks } from './useDays';
import InboxColumn from './InboxColumn';
import type { InboxDragData } from './InboxColumn';
import {
    loadInboxItemsToStore,
    processInboxItemWithStore,
} from '../../utils/inboxService';
import DayColumn from './DayColumn';
import type { ColumnDropData } from './DayColumn';
import type { CardData } from './TaskCard';
import ViewMenu from './ViewMenu';
import HorizonColumn, { horizonFromCardDate } from './HorizonColumn';
import type { HorizonDropData } from './HorizonColumn';
import {
    HORIZON_KEYS,
    HorizonKey,
    bucketHorizons,
    horizonOf,
    horizonPatch,
} from './horizons';
import {
    PlanViewOptions,
    loadViewOptions,
    saveViewOptions,
} from './viewOptions';
import {
    PlanWrite,
    calendarDropWrites,
    calendarRange,
    columnDates,
    columnDropWrites,
    dayString,
    planItemUids,
    reorderWrites,
    shiftDay,
    timedSpans,
} from './planOps';

const MIN_COLUMN = 260;
const GAP = 12;
const SLOT = 15;
const DEFAULT_HOURS = { start: 480, end: 1080 };
// Calendar width before the user drags the splitter, per day shown.
const CALENDAR_WIDTH: Record<number, number> = { 1: 360, 3: 620, 7: 900 };

// Pointer first, rectangles when the pointer is between targets (keyboard).
const collision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    return hits.length > 0 ? hits : rectIntersection(args);
};

// What a drag carries: a card of a column, or a block of the calendar (a
// planned block, or an appointment: a timed task due without a slot).
type DragData =
    | CardData
    | InboxDragData
    | {
          kind: 'block' | 'appointment';
          uid: string;
          date: string;
          start: number;
          duration: number;
      };

type OverData =
    | ColumnDropData
    | CardData
    | HorizonDropData
    | { kind: 'grid'; date: string; rangeStart: number };

interface Dragging {
    data: DragData;
    title: string;
}

/**
 * The Plan page. Days: one column per day from the anchor day, as many as
 * fit. Horizons: This week, This month, Next month, Someday. On the right,
 * a resizable calendar of 1, 3 or 7 days that moves on its own. Day writes
 * go through the day plan ops (docs/fork/TODAY-REDESIGN.md) and never touch
 * due dates; horizon writes set week_of, month_of or #someday.
 */
const UpcomingBoard: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { showErrorToast, showUndoToast } = useToast();
    const { openTaskUid, openTask, closeTask } = useTaskPane();
    const calendarEnabled = useStore(
        (state) => state.userSettingsStore.calendarEnabled
    );
    const timezone = getUserTimezone();
    const today = dayString(new Date(), timezone);
    const locale = intlLocale(i18n.language);
    const narrow = useIsNarrow();

    const [options, setOptionsState] =
        useState<PlanViewOptions>(loadViewOptions);
    const setOptions = useCallback((next: PlanViewOptions) => {
        setOptionsState(next);
        saveViewOptions(next);
    }, []);
    const patchOptions = (patch: Partial<PlanViewOptions>) =>
        setOptions({ ...options, ...patch });
    const horizonsMode = options.mode === 'horizons';
    const span = narrow ? 1 : options.calendarSpan;

    const [anchor, setAnchor] = useState(today);
    const [calendarDate, setCalendarDate] = useState(today);
    const [clock, setClock] = useState(() => minuteOfDay(new Date(), timezone));
    const [width, setWidth] = useState(0);
    const [dragging, setDragging] = useState<Dragging | null>(null);
    const [ghost, setGhost] = useState<DropPreview | null>(null);
    const [eventDetail, setEventDetail] = useState<FeedEventDetail | null>(
        null
    );
    const boardRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const panesRef = useRef<HTMLDivElement>(null);
    const pane = usePaneWidth(panesRef, {
        storageKey: 'upcoming.calendarWidth',
        initial: CALENDAR_WIDTH[span] ?? 360,
    });

    useEffect(() => {
        const el = boardRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(([entry]) =>
            setWidth(entry.contentRect.width)
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [horizonsMode]);

    useEffect(() => {
        const timer = window.setInterval(
            () => setClock(minuteOfDay(new Date(), timezone)),
            60_000
        );
        return () => window.clearInterval(timer);
    }, [timezone]);

    const fit =
        width > 0
            ? Math.max(1, Math.floor((width + GAP) / (MIN_COLUMN + GAP)))
            : 3;
    const dates = useMemo(
        () => (horizonsMode ? [] : columnDates(anchor, fit)),
        [anchor, fit, horizonsMode]
    );
    const calendarDates = useMemo(
        () => (options.showCalendar ? columnDates(calendarDate, span) : []),
        [calendarDate, span, options.showCalendar]
    );
    const fetchDates = useMemo(
        () => [...new Set([...dates, ...calendarDates])],
        [dates, calendarDates]
    );
    const { days, error, reload: reloadDays } = useDays(fetchDates);
    const daysRef = useRef(days);
    daysRef.current = days;
    const events = useCalendarEvents(calendarDates, calendarEnabled);
    const horizon = useHorizonTasks(horizonsMode);
    const buckets = useMemo(
        () =>
            horizon.tasks
                ? bucketHorizons(horizon.tasks, today, horizon.firstDayOfWeek)
                : null,
        [horizon.tasks, today, horizon.firstDayOfWeek]
    );
    const bucketsRef = useRef(buckets);
    bucketsRef.current = buckets;
    const inboxItems = useStore((state) => state.inboxStore.inboxItems);
    const inboxLoading = useStore((state) => state.inboxStore.isLoading);

    useEffect(() => {
        loadInboxItemsToStore(true).catch(console.error);
    }, []);

    const reloadHorizons = horizon.reload;
    const reload = useCallback(
        async (only?: string[]) => {
            await Promise.all([
                reloadDays(only),
                horizonsMode ? reloadHorizons() : Promise.resolve(),
            ]);
        },
        [reloadDays, reloadHorizons, horizonsMode]
    );

    const fail = useCallback(
        (err: unknown) => {
            showErrorToast(
                err instanceof PlanChangedError
                    ? t(
                          'upcoming.planChanged',
                          'The plan changed on another device. It has been reloaded.'
                      )
                    : t(
                          'upcoming.saveFailed',
                          'Could not save. Nothing changed.'
                      )
            );
            void reload();
        },
        [reload, showErrorToast, t]
    );

    // An inbox card dropped on a day or a horizon: it becomes a task planned
    // that day or committed to that horizon, the way TodayPage's inbox
    // entries do (createTask, then process the item).
    const planInboxItem = useCallback(
        async (
            data: InboxDragData,
            target: { date: string } | { horizon: HorizonKey }
        ) => {
            try {
                const task = await createTask({
                    name: data.title,
                    status: TASK_STATUS.NOT_STARTED,
                    completed_at: null,
                } as unknown as Task);
                if (!task.uid) return;
                await processInboxItemWithStore(data.uid, {
                    task_uid: task.uid,
                });
                if ('date' in target) {
                    await applyPlanOps(
                        target.date,
                        [{ op: 'add', task_uid: task.uid }],
                        daysRef.current[target.date]?.etag
                    );
                    await reload([target.date]);
                } else {
                    const patch = horizonPatch(null, target.horizon);
                    if (patch) {
                        await updateTask(task.uid, patch as Partial<Task>);
                    }
                    await reloadHorizons();
                }
            } catch (err) {
                fail(err);
            }
        },
        [fail, reload, reloadHorizons]
    );

    /**
     * Sends the writes in order, then refreshes the days they touched. The
     * undo toast puts those days' earlier plans back.
     */
    const commit = useCallback(
        async (writes: PlanWrite[], message?: string) => {
            if (writes.length === 0) return;
            const touched = [...new Set(writes.map((write) => write.date))];
            const snapshot = new Map<string, DailyPlanItem[]>(
                touched.map((date) => [
                    date,
                    daysRef.current[date]?.plan?.items ?? [],
                ])
            );
            try {
                for (const write of writes) {
                    await applyPlanOps(
                        write.date,
                        write.ops,
                        daysRef.current[write.date]?.etag
                    );
                }
            } catch (err) {
                fail(err);
                return;
            }
            await reload(touched);
            if (message) {
                showUndoToast(message, () => {
                    Promise.all(
                        touched.map((date) =>
                            restorePlan(
                                date,
                                toPlanInput(snapshot.get(date) ?? []),
                                daysRef.current[date]?.etag
                            )
                        )
                    )
                        .then(() => reload(touched))
                        .catch(fail);
                });
            }
        },
        [fail, reload, showUndoToast]
    );

    // A card dropped on another horizon. Undo puts the earlier week, month
    // and #someday back.
    const moveToHorizon = useCallback(
        async (uid: string, to: HorizonKey) => {
            const current = bucketsRef.current;
            const from = current ? horizonOf(current, uid) : null;
            const patch = horizonPatch(from, to);
            if (!patch) return;
            try {
                await updateTask(uid, patch as Partial<Task>);
                await reloadHorizons();
            } catch (err) {
                fail(err);
                return;
            }
            const back = from ? horizonPatch(to, from) : null;
            showUndoToast(t('upcoming.moved', 'Task moved'), () => {
                const undo = back ?? {
                    week_of: null,
                    month_of: null,
                    ...(to === 'someday' ? { later: false } : {}),
                };
                updateTask(uid, undo as Partial<Task>)
                    .then(() => reloadHorizons())
                    .catch(fail);
            });
        },
        [fail, reloadHorizons, showUndoToast, t]
    );

    const addTask = useCallback(
        async (date: string, name: string) => {
            try {
                const task = await createTask({
                    name,
                    status: TASK_STATUS.NOT_STARTED,
                    completed_at: null,
                } as unknown as Task);
                if (task.uid) {
                    await applyPlanOps(
                        date,
                        [{ op: 'add', task_uid: task.uid }],
                        daysRef.current[date]?.etag
                    );
                }
                await reload([date]);
            } catch (err) {
                fail(err);
            }
        },
        [fail, reload]
    );

    const toggle = useCallback(
        async (line: DayLine) => {
            // A recurring task done for this day has moved on to its next date.
            if (line.done && !isTaskDone(line.task.status)) return;
            const uid = line.task.uid as string;
            const wasDone = isTaskDone(line.task.status);
            try {
                const saved = await toggleTaskCompletion(uid, line.task);
                await reload();
                if (!wasDone) {
                    showUndoToast(
                        t('upcoming.completed', '“{{name}}” done', {
                            name: line.task.name,
                        }),
                        () => {
                            toggleTaskCompletion(uid, saved)
                                .then(() => reload())
                                .catch(fail);
                        }
                    );
                }
            } catch (err) {
                fail(err);
            }
        },
        [fail, reload, showUndoToast, t]
    );

    const toggleSubtask = useCallback(
        (subtask: Task) => {
            if (!subtask.uid) return;
            toggleTaskCompletion(subtask.uid, subtask)
                .then(() => reload())
                .catch(fail);
        },
        [fail, reload]
    );

    const openLine = (line: DayLine) =>
        openTaskUid === line.uid ? closeTask() : openTask(line.uid);

    // A day picked on the board: the calendar starts there, unless that day
    // is already in view (clicking a card must not shift the calendar).
    const selectDay = (date: string) => {
        if (!calendarDates.includes(date)) setCalendarDate(date);
    };

    const calendarColumns = calendarDates.map((date) => {
        const day = days[date];
        const lines = day
            ? dayLines(day.plan?.items ?? [], day.due, date)
            : null;
        const timed = lines
            ? [
                  ...lines.timed,
                  ...lines.done.filter((line) => lineAt(line) !== null),
              ]
            : [];
        return { date, day, timed, events: events[date] ?? [] };
    });
    const range = calendarRange(
        calendarColumns[0]?.day?.day_hours ?? DEFAULT_HOURS,
        calendarColumns.flatMap((column) => [
            ...column.timed.map((line) => {
                const at = lineAt(line) as number;
                return { start: at, end: at + line.duration };
            }),
            ...timedSpans(column.events),
        ]),
        calendarDates.includes(today) ? clock : null
    );

    // Minute under the pointer on the calendar, or where a block now starts.
    const gridMinute = (
        event: DragMoveEvent | DragEndEvent,
        data: DragData
    ): number | null => {
        const grid = gridRef.current;
        if (!grid || data.kind === 'inbox') return null;
        if (data.kind === 'card') {
            const top = event.active.rect.current.translated?.top;
            if (top === undefined) return null;
            return minuteFromOffset(
                top - grid.getBoundingClientRect().top,
                range
            );
        }
        const moved = data.start + event.delta.y / PX_PER_MINUTE;
        return Math.max(range.start, Math.round(moved / SLOT) * SLOT);
    };

    const nameOf = (data: DragData): string => {
        if (data.kind === 'inbox') return data.title;
        const key = horizonFromCardDate(data.date);
        if (key) {
            return (
                bucketsRef.current?.[key].find((task) => task.uid === data.uid)
                    ?.name ?? ''
            );
        }
        const day = daysRef.current[data.date];
        return (day ? tasksOf(day).get(data.uid)?.name : undefined) ?? '';
    };

    const onDragStart = (event: DragStartEvent) => {
        const data = event.active.data.current as DragData | undefined;
        if (data) setDragging({ data, title: nameOf(data) });
    };

    const onDragMove = (event: DragMoveEvent) => {
        const data = event.active.data.current as DragData | undefined;
        const over = event.over?.data.current as OverData | undefined;
        if (!data || data.kind === 'inbox' || over?.kind !== 'grid') {
            setGhost(null);
            return;
        }
        const minute = gridMinute(event, data);
        // A block moved within its own day shows itself moving.
        const ownDay = data.kind !== 'card' && data.date === over.date;
        setGhost(
            minute === null || ownDay
                ? null
                : {
                      date: over.date,
                      minute,
                      duration: data.duration,
                      title: nameOf(data),
                  }
        );
    };

    const dropWrites = (
        event: DragEndEvent,
        data: Exclude<DragData, InboxDragData>,
        over: Exclude<OverData, HorizonDropData>
    ): { writes: PlanWrite[]; message?: string } => {
        const fromHorizon = horizonFromCardDate(data.date) !== null;
        const from = {
            uid: data.uid,
            date: data.date,
            // A horizon card sits on no day's plan.
            planned:
                !fromHorizon &&
                (data.kind === 'card' ? data.planned : data.kind === 'block'),
        };
        const moved = t('upcoming.moved', 'Task moved');
        if (over.kind === 'grid') {
            const start = gridMinute(event, data);
            if (start === null) return { writes: [] };
            if (
                over.date === data.date &&
                data.kind !== 'card' &&
                start === data.start
            ) {
                return { writes: [] };
            }
            return {
                writes: calendarDropWrites(
                    { ...from, duration: data.duration },
                    { date: over.date, start }
                ),
                message: t('upcoming.planned', 'Time planned'),
            };
        }
        if (fromHorizon) return { writes: [] };
        if (over.kind === 'column' || over.date !== data.date) {
            return {
                writes: columnDropWrites(from, over.date),
                message: moved,
            };
        }
        // Over a card of the same column: order among the untimed cards only;
        // a timed card keeps its place by time.
        if (
            data.kind !== 'card' ||
            data.timed ||
            over.kind !== 'card' ||
            over.timed
        ) {
            return { writes: [] };
        }
        const day = daysRef.current[data.date];
        const lines = dayLines(
            day?.plan?.items ?? [],
            day?.due ?? [],
            data.date
        );
        return {
            writes: reorderWrites(
                from,
                over.uid,
                lines.anytime.map((line) => line.uid),
                planItemUids(day?.plan?.items ?? [])
            ),
            message: t('upcoming.reordered', 'Order changed'),
        };
    };

    // The horizon a drop lands on: the column, or the column of the card
    // under the pointer.
    const horizonTarget = (over: OverData): HorizonKey | null => {
        if (over.kind === 'horizon') return over.key;
        if (over.kind === 'card') return horizonFromCardDate(over.date);
        return null;
    };

    const onDragEnd = (event: DragEndEvent) => {
        setDragging(null);
        setGhost(null);
        const data = event.active.data.current as DragData | undefined;
        const over = event.over?.data.current as OverData | undefined;
        if (!data || !over) return;
        const toHorizon = horizonTarget(over);
        if (data.kind === 'inbox') {
            if (toHorizon) void planInboxItem(data, { horizon: toHorizon });
            else if (over.kind === 'column')
                void planInboxItem(data, { date: over.date });
            return;
        }
        if (toHorizon) {
            if (data.kind === 'card') void moveToHorizon(data.uid, toHorizon);
            return;
        }
        if (over.kind === 'horizon') return;
        const { writes, message } = dropWrites(event, data, over);
        void commit(writes, message);
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 220, tolerance: 6 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const columnData: DayColumnData[] = calendarColumns.map((column) => {
        const at = parseISO(column.date);
        const isToday = column.date === today;
        return {
            date: column.date,
            weekday: new Intl.DateTimeFormat(locale, {
                weekday: 'short',
            }).format(at),
            dayNumber: at.getDate(),
            isToday,
            now: isToday ? clock : null,
            lines: column.timed,
            events: column.events,
            focus: (column.day?.focus_blocks_of_day ?? []).map((block) => ({
                key: `focus-${block.id}`,
                start: block.start,
                end: block.end,
                label: block.label,
            })),
        };
    });

    // "Thu 12 Nov" for one day, "12 Nov – 14 Nov" for several: short
    // enough for a one-day calendar header next to its buttons.
    const rangeLabel = (first: string, last: string) => {
        const format = new Intl.DateTimeFormat(locale, {
            ...(first === last ? { weekday: 'short' } : {}),
            day: 'numeric',
            month: 'short',
        });
        return first === last
            ? format.format(parseISO(first))
            : `${format.format(parseISO(first))} – ${format.format(parseISO(last))}`;
    };

    const calendarHeader = calendarDates.length > 0 && (
        <div className="flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate text-body font-semibold text-surface-on">
                {rangeLabel(
                    calendarDates[0],
                    calendarDates[calendarDates.length - 1]
                )}
            </span>
            <IconButton
                label={t('upcoming.previous', 'Previous day')}
                onClick={() => setCalendarDate(shiftDay(calendarDate, -span))}
            >
                <ChevronLeftIcon />
            </IconButton>
            <Button
                size="sm"
                variant="ghost"
                disabled={calendarDate === today}
                onClick={() => setCalendarDate(today)}
            >
                {t('upcoming.today', 'Today')}
            </Button>
            <IconButton
                label={t('upcoming.next', 'Next day')}
                onClick={() => setCalendarDate(shiftDay(calendarDate, span))}
            >
                <ChevronRightIcon />
            </IconButton>
            <IconButton
                label={t('upcoming.hideCalendar', 'Hide calendar')}
                onClick={() => patchOptions({ showCalendar: false })}
            >
                <ChevronDoubleRightIcon />
            </IconButton>
        </div>
    );

    const sideBySide = !narrow && options.showCalendar && pane.fits;
    // The splitter reports the board's width; the calendar keeps the rest,
    // so its width is what is remembered across window sizes.
    const panesWidth = () => panesRef.current?.clientWidth ?? 0;
    const segment = (active: boolean) =>
        `h-7 rounded-md px-3 text-body-m font-medium transition-colors duration-150 ${
            active
                ? 'bg-surface text-surface-on shadow-sm'
                : 'text-surface-on-variant hover:text-surface-on'
        }`;
    const horizonTitles: Record<HorizonKey, string> = {
        week: t('upcoming.thisWeek', 'This week'),
        this_month: t('upcoming.thisMonth', 'This month'),
        next_month: t('upcoming.nextMonth', 'Next month'),
        someday: t('upcoming.someday', 'Someday'),
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={collision}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
                setDragging(null);
                setGhost(null);
            }}
        >
            <div
                data-testid="upcoming-board"
                className="flex h-full min-h-0 w-full flex-col bg-surface max-md:h-auto max-md:min-h-[calc(100dvh-3.5rem)] max-md:pb-24"
            >
                <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pb-2 pt-4">
                    <h1 className="text-title font-semibold text-surface-on">
                        {t('upcoming.title', 'Plan')}
                    </h1>
                    <div
                        role="group"
                        aria-label={t('upcoming.layout', 'Layout')}
                        className="inline-flex rounded-lg bg-surface-high p-0.5"
                    >
                        <button
                            type="button"
                            aria-pressed={!horizonsMode}
                            onClick={() => patchOptions({ mode: 'days' })}
                            className={segment(!horizonsMode)}
                        >
                            {t('upcoming.days', 'Days')}
                        </button>
                        <button
                            type="button"
                            aria-pressed={horizonsMode}
                            onClick={() => patchOptions({ mode: 'horizons' })}
                            className={segment(horizonsMode)}
                        >
                            {t('upcoming.horizons', 'Horizons')}
                        </button>
                    </div>
                    {!horizonsMode && dates.length > 0 && (
                        <div className="flex items-center gap-1">
                            <IconButton
                                label={t('upcoming.previous', 'Previous day')}
                                onClick={() => setAnchor(shiftDay(anchor, -1))}
                            >
                                <ChevronLeftIcon />
                            </IconButton>
                            <Button
                                size="sm"
                                variant="secondary"
                                disabled={anchor === today}
                                onClick={() => setAnchor(today)}
                            >
                                {t('upcoming.today', 'Today')}
                            </Button>
                            <IconButton
                                label={t('upcoming.next', 'Next day')}
                                onClick={() => setAnchor(shiftDay(anchor, 1))}
                            >
                                <ChevronRightIcon />
                            </IconButton>
                            <span className="ml-1 text-body-m text-surface-on-variant max-sm:hidden">
                                {rangeLabel(dates[0], dates[dates.length - 1])}
                            </span>
                        </div>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                        <ViewMenu options={options} onChange={setOptions} />
                        <IconButton
                            label={
                                options.showCalendar
                                    ? t(
                                          'upcoming.hideCalendar',
                                          'Hide calendar'
                                      )
                                    : t(
                                          'upcoming.showCalendar',
                                          'Show calendar'
                                      )
                            }
                            active={options.showCalendar}
                            onClick={() =>
                                patchOptions({
                                    showCalendar: !options.showCalendar,
                                })
                            }
                        >
                            <CalendarDaysIcon />
                        </IconButton>
                    </div>
                </header>

                {(error || (horizonsMode && horizon.error)) && (
                    <p
                        role="status"
                        className="px-5 pb-2 text-body-m text-danger"
                    >
                        {t('upcoming.loadFailed', 'Could not load the days.')}
                    </p>
                )}

                <div
                    ref={panesRef}
                    className="flex min-h-0 flex-1 flex-col md:flex-row"
                >
                    <div className="flex min-h-0 min-w-0 flex-1 gap-3 pb-3 pl-4 pr-2 pt-1">
                        {options.showInbox && (
                            <div className="flex min-h-0 shrink-0 p-1">
                                <InboxColumn
                                    items={inboxItems}
                                    loading={inboxLoading}
                                />
                            </div>
                        )}
                        <div
                            ref={boardRef}
                            data-testid="upcoming-columns"
                            className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto p-1"
                        >
                            {horizonsMode
                                ? HORIZON_KEYS.map((key) => (
                                      <HorizonColumn
                                          key={key}
                                          horizon={key}
                                          title={horizonTitles[key]}
                                          tasks={buckets?.[key] ?? null}
                                          today={today}
                                          openTaskUid={openTaskUid}
                                          onOpen={openLine}
                                          onToggle={toggle}
                                          onToggleSubtask={toggleSubtask}
                                      />
                                  ))
                                : dates.map((date) => (
                                      <DayColumn
                                          key={date}
                                          date={date}
                                          isToday={date === today}
                                          day={days[date]}
                                          selected={calendarDates.includes(
                                              date
                                          )}
                                          openTaskUid={openTaskUid}
                                          groupBy={options.groupBy}
                                          sortBy={options.sortBy}
                                          showCompleted={options.showCompleted}
                                          onSelect={selectDay}
                                          onAdd={addTask}
                                          onOpen={openLine}
                                          onToggle={toggle}
                                          onToggleSubtask={toggleSubtask}
                                      />
                                  ))}
                        </div>
                    </div>

                    {sideBySide && (
                        <PaneSplitter
                            width={panesWidth() - pane.width}
                            containerRef={panesRef}
                            onChange={(left, persist) =>
                                pane.update(panesWidth() - left, persist)
                            }
                        />
                    )}

                    {options.showCalendar && (
                        <section
                            aria-label={t('upcoming.calendar', 'Calendar')}
                            data-testid="upcoming-calendar"
                            style={sideBySide ? { width: pane.width } : {}}
                            className={`flex min-h-[420px] flex-col md:min-h-0 ${
                                sideBySide
                                    ? 'shrink-0 border-l border-outline-variant/60'
                                    : 'w-full border-t border-outline-variant/60'
                            }`}
                        >
                            <DayCalendar
                                range={range}
                                columns={columnData}
                                gridRef={gridRef}
                                header={calendarHeader}
                                selectedUid={openTaskUid}
                                onWiden={() => pane.update(Infinity, true)}
                                onToggle={toggle}
                                onOpen={openLine}
                                onResize={(date, uid, duration) =>
                                    void commit(
                                        [
                                            {
                                                date,
                                                ops: [
                                                    {
                                                        op: 'resize',
                                                        task_uid: uid,
                                                        duration_minutes:
                                                            duration,
                                                    },
                                                ],
                                            },
                                        ],
                                        t(
                                            'upcoming.resized',
                                            'Duration changed'
                                        )
                                    )
                                }
                                onMove={(date, uid, start) =>
                                    void commit(
                                        [
                                            {
                                                date,
                                                ops: [
                                                    {
                                                        op: 'slot',
                                                        task_uid: uid,
                                                        start_minute: start,
                                                    },
                                                ],
                                            },
                                        ],
                                        t('upcoming.planned', 'Time planned')
                                    )
                                }
                                onUnslot={(date, uid) =>
                                    void commit(
                                        [
                                            {
                                                date,
                                                ops: [
                                                    {
                                                        op: 'unslot',
                                                        task_uid: uid,
                                                    } as PlanOp,
                                                ],
                                            },
                                        ],
                                        t('upcoming.unslotted', 'Time removed')
                                    )
                                }
                                drop={ghost}
                                onOpenEvent={(event, onDate) =>
                                    setEventDetail({
                                        title: event.title,
                                        calendarName: event.feed_name,
                                        day: parseISO(onDate),
                                        start: event.start
                                            ? new Date(event.start)
                                            : null,
                                        end: event.end
                                            ? new Date(event.end)
                                            : null,
                                        allDay: event.all_day,
                                        location: event.location ?? null,
                                        description: event.description ?? null,
                                    })
                                }
                            />
                        </section>
                    )}
                </div>
            </div>
            {eventDetail && (
                <FeedEventPopover
                    detail={eventDetail}
                    onClose={() => setEventDetail(null)}
                />
            )}
            <DragOverlay dropAnimation={null}>
                {dragging && ghost === null ? (
                    <div className="max-w-xs truncate rounded-lg bg-surface px-3 py-1.5 text-body-m text-surface-on shadow-lg ring-1 ring-outline-variant">
                        {dragging.title}
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

export default UpcomingBoard;
