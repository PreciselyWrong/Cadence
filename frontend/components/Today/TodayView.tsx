import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
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
    CollisionDetection,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { addDays, format, nextMonday, parseISO } from 'date-fns';
import { Task } from '../../entities/Task';
import { isTaskDone } from '../../constants/taskStatus';
import { getUserTimezone } from '../../utils/dateUtils';
import { useTaskPane } from '../../contexts/TaskPaneContext';
import { useIsNarrow } from '../../hooks/useIsNarrow';
import { fetchDay } from '../../utils/dayService';
import { toggleTaskCompletion } from '../../utils/tasksService';
import type { DayResponse, PlanOp } from '../../utils/dayService';
import { fetchCalendarEvents } from '../../utils/calendarFeedsService';
import { useStore } from '../../store/useStore';
import type { CalendarEvent } from '../../utils/calendarFeedsService';
import type { MenuEntry } from '../Shared/ui/Menu';
import Button, { IconButton } from '../Shared/ui/Button';
import {
    Bars3BottomLeftIcon,
    CalendarDaysIcon,
    ChevronDoubleRightIcon,
} from '@heroicons/react/24/outline';
import TodayPage from '../DailyPlan/TodayPage';
import PaneSplitter, {
    PANE_MIN,
    usePaneWidth,
} from '../DailyPlan/PaneSplitter';
import {
    findFreeSlot,
    formatDuration,
    intlLocale,
    SLOT_MINUTES,
} from '../DailyPlan/planUtils';
import {
    DayLine,
    dayLines,
    daySummary,
    lineAt,
    lineFromDue,
    reflowSlots,
    visibleLines,
} from './dayModel';
import { useDay } from './useDay';
import DayList from './DayList';
import FeedEventPopover, {
    FeedEventDetail,
} from '../Calendar/FeedEventPopover';
import DayCalendar, {
    DayColumnData,
    PX_PER_MINUTE,
    minuteFromOffset,
} from './DayCalendar';

const todayString = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: getUserTimezone() }).format(
        new Date()
    );

const readOpen = (): boolean => {
    try {
        return localStorage.getItem('today.calendarOpen') !== 'false';
    } catch {
        return true;
    }
};

// Completed tasks are shown unless this viewer hid them.
const readHideCompleted = (): boolean => {
    try {
        return localStorage.getItem('today.hideCompleted') === 'true';
    } catch {
        return false;
    }
};

const writeHideCompleted = (hide: boolean) => {
    try {
        localStorage.setItem('today.hideCompleted', String(hide));
    } catch {
        // Private mode: the choice lasts until reload.
    }
};

const interval = (start: number, end: number) => ({ start, end });

// Overlaps and drops are decided against the pointer first; rectangles only
// when the pointer is between targets (keyboard drags).
const collision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    return hits.length > 0 ? hits : rectIntersection(args);
};

interface DragState {
    kind: 'line' | 'block' | 'appointment';
    line: DayLine;
    // The day the dragged line belongs to.
    fromDate: string;
}

interface ExtraDay {
    day: DayResponse;
    events: CalendarEvent[];
}

const SPANS = [1, 3, 7];

const readSpan = (): number => {
    try {
        const stored = Number(localStorage.getItem('today.span'));
        return SPANS.includes(stored) ? stored : 1;
    } catch {
        return 1;
    }
};

const TodayView: React.FC = () => {
    const [params] = useSearchParams();
    if (params.get('classic') === '1') return <TodayPage />;
    return <NewToday />;
};

const NewToday: React.FC = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const today = todayString();
    const tomorrowOfToday = format(addDays(parseISO(today), 1), 'yyyy-MM-dd');
    // `?date=tomorrow` (the sidebar's Tomorrow) means the day after today.
    const asked = params.get('date');
    const date = asked === 'tomorrow' ? tomorrowOfToday : asked || today;
    const {
        day,
        events,
        error,
        now,
        tasks,
        revision,
        reload,
        run,
        runOn,
        toggle,
        create,
    } = useDay(date);
    const narrow = useIsNarrow();
    const calendarEnabled = useStore(
        (state) => state.userSettingsStore.calendarEnabled
    );
    const [calendarOpen, setCalendarOpen] = useState(readOpen);
    const [hideCompleted, setHideCompletedState] = useState(readHideCompleted);
    const setHideCompleted = (hide: boolean) => {
        setHideCompletedState(hide);
        writeHideCompleted(hide);
    };
    const [mobileView, setMobileView] = useState<'list' | 'calendar'>('list');
    const panesRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    // Its own key: the earlier page stored a narrower candidates column.
    const pane = usePaneWidth(panesRef, {
        storageKey: 'today.listWidth',
        initial: 480,
    });
    const [dragging, setDragging] = useState<DragState | null>(null);
    const [ghost, setGhost] = useState<{
        date: string;
        minute: number;
    } | null>(null);
    const [span, setSpanState] = useState<number>(readSpan);
    const [extras, setExtras] = useState<Record<string, ExtraDay>>({});
    const [adding, setAdding] = useState('');
    const [expanded, setExpanded] = useState(() => {
        try {
            return localStorage.getItem('today.expanded') === 'true';
        } catch {
            return false;
        }
    });
    const setExpandedStored = (value: boolean) => {
        setExpanded(value);
        try {
            localStorage.setItem('today.expanded', String(value));
        } catch {
            // Private mode: lasts until reload.
        }
    };
    const [eventDetail, setEventDetail] = useState<FeedEventDetail | null>(
        null
    );
    const locale = intlLocale(i18n.language);

    const items = useMemo(() => day?.plan?.items ?? [], [day]);
    const lines = useMemo(
        () => dayLines(items, day?.due ?? [], date),
        [items, day, date]
    );
    const hours = day?.day_hours ?? { start: 480, end: 1080 };
    const timedEvents = useMemo(
        () =>
            events.filter(
                (e) => !e.all_day && e.start_minute !== null && e.end_minute
            ),
        [events]
    );
    const focus = useMemo(
        () =>
            (day?.focus_blocks_of_day ?? []).map((block) => ({
                key: `focus-${block.id}`,
                start: block.start,
                end: block.end,
                label: block.label,
            })),
        [day]
    );
    // Unslotted due-time tasks are appointments: busy, like meetings.
    const appointments = useMemo(
        () =>
            lines.timed.filter(
                (line) => line.start === null && line.dueMinute !== null
            ),
        [lines]
    );
    const busy = useMemo(
        () => [
            ...timedEvents
                .filter((e) => e.busy)
                .map((e) =>
                    interval(e.start_minute as number, e.end_minute as number)
                ),
            ...focus.map((f) => interval(f.start, f.end)),
            ...appointments.map((l) =>
                interval(
                    l.dueMinute as number,
                    (l.dueMinute as number) + l.duration
                )
            ),
        ],
        [timedEvents, focus, appointments]
    );
    // findFreeSlot reads busy time as calendar events.
    const busyEvents = useMemo<CalendarEvent[]>(
        () =>
            busy.map((s, i) => ({
                uid: `busy-${i}`,
                title: '',
                all_day: false,
                busy: true,
                start: '',
                end: '',
                start_minute: s.start,
                end_minute: s.end,
                feed_uid: 'busy',
                feed_name: '',
                color: null,
            })),
        [busy]
    );
    const summary = daySummary(lines, busy, hours, now);
    const calendarLines = useMemo(() => {
        const shown = visibleLines(lines, hideCompleted);
        return [
            ...shown.timed,
            ...shown.done.filter((line) => lineAt(line) !== null),
        ];
    }, [lines, hideCompleted]);
    const range = useMemo(() => {
        let start = hours.start;
        let end = hours.end;
        const widen = (s: number, e: number) => {
            start = Math.min(start, s);
            end = Math.max(end, e);
        };
        calendarLines.forEach((line) => {
            const at = lineAt(line) as number;
            widen(at, at + line.duration);
        });
        timedEvents.forEach((e) =>
            widen(e.start_minute as number, e.end_minute as number)
        );
        Object.entries(extras).forEach(([d, extra]) => {
            const extraLines = dayLines(
                extra.day.plan?.items ?? [],
                extra.day.due,
                d
            );
            extraLines.timed.forEach((line) => {
                const at = lineAt(line) as number;
                widen(at, at + line.duration);
            });
            extra.events.forEach((e) => {
                if (!e.all_day && e.start_minute !== null && e.end_minute)
                    widen(e.start_minute, e.end_minute);
            });
        });
        if (now !== null) widen(now, now);
        return {
            start: Math.floor(start / 60) * 60,
            end: Math.min(1440, Math.ceil(end / 60) * 60),
        };
    }, [hours, calendarLines, timedEvents, now, extras]);

    // The other days of a 3- or 7-day view, read after every load of the
    // main day so a write anywhere shows everywhere.
    const shownDates = useMemo(
        () =>
            Array.from({ length: narrow ? 1 : span }, (_, i) =>
                format(addDays(parseISO(date), i), 'yyyy-MM-dd')
            ),
        [date, span, narrow]
    );
    const extraKey = shownDates.slice(1).join(',');
    useEffect(() => {
        const dates = extraKey ? extraKey.split(',') : [];
        if (dates.length === 0) {
            setExtras({});
            return;
        }
        let cancelled = false;
        Promise.all(
            dates.map(async (d) => {
                const [dayData, feed] = await Promise.all([
                    fetchDay(d),
                    calendarEnabled
                        ? fetchCalendarEvents(d).catch(() => null)
                        : Promise.resolve(null),
                ]);
                return [
                    d,
                    { day: dayData, events: feed?.events ?? [] },
                ] as const;
            })
        )
            .then((entries) => {
                if (!cancelled) setExtras(Object.fromEntries(entries));
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [extraKey, revision, calendarEnabled]);

    const columns = useMemo<DayColumnData[]>(
        () =>
            shownDates.map((d) => {
                const at = parseISO(d);
                const base = {
                    date: d,
                    weekday: new Intl.DateTimeFormat(locale, {
                        weekday: 'short',
                    }).format(at),
                    dayNumber: at.getDate(),
                    isToday: d === today,
                };
                if (d === date) {
                    return {
                        ...base,
                        now,
                        lines: calendarLines,
                        events,
                        focus,
                    };
                }
                const extra = extras[d];
                const extraLines = extra
                    ? visibleLines(
                          dayLines(
                              extra.day.plan?.items ?? [],
                              extra.day.due,
                              d
                          ),
                          hideCompleted
                      )
                    : null;
                return {
                    ...base,
                    now: null,
                    lines: extraLines
                        ? [
                              ...extraLines.timed,
                              ...extraLines.done.filter(
                                  (line) => lineAt(line) !== null
                              ),
                          ]
                        : [],
                    events: extra?.events ?? [],
                    focus: (extra?.day.focus_blocks_of_day ?? []).map(
                        (block) => ({
                            key: `focus-${block.id}`,
                            start: block.start,
                            end: block.end,
                            label: block.label,
                        })
                    ),
                };
            }),
        [
            shownDates,
            date,
            today,
            locale,
            now,
            calendarLines,
            events,
            focus,
            extras,
            hideCompleted,
        ]
    );

    const current = useMemo(() => {
        if (now === null) return null;
        return (
            lines.timed.find(
                (line) =>
                    line.start !== null &&
                    line.start <= now &&
                    now < line.start + line.duration
            ) ?? null
        );
    }, [lines, now]);
    const slipped = useMemo(() => {
        if (now === null) return null;
        return (
            lines.timed.find(
                (line) =>
                    line.start !== null && line.start + line.duration <= now
            ) ?? null
        );
    }, [lines, now]);

    const goTo = (next: string) =>
        setParams(next === today ? {} : { date: next }, { replace: false });
    const shift = (days: number) =>
        goTo(format(addDays(parseISO(date), days), 'yyyy-MM-dd'));

    // The next free slot for `line`, from now on today.
    const freeSlotFor = useCallback(
        (line: DayLine, taken = items) =>
            findFreeSlot(
                taken.filter((item) => item.task_uid !== line.uid),
                busyEvents,
                line.duration,
                hours,
                now ?? hours.start
            ),
        [items, busyEvents, hours, now]
    );

    const plan = (line: DayLine) => {
        const start = freeSlotFor(line);
        if (start === null) return;
        void run(
            [
                {
                    op: 'slot',
                    task_uid: line.uid,
                    start_minute: start,
                    duration_minutes: line.duration,
                },
            ],
            t('today.planned', '“{{name}}” at {{time}}', {
                name: line.task.name,
                time: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
            })
        );
    };

    const postpone = (line: DayLine, to: string, label: string) => {
        if (line.planned) {
            void run([{ op: 'move', task_uid: line.uid, to_date: to }], label);
        } else {
            void runOn(to, [{ op: 'add', task_uid: line.uid }], label);
        }
    };

    const tomorrow = format(addDays(parseISO(date), 1), 'yyyy-MM-dd');
    const nextWeek = format(nextMonday(parseISO(date)), 'yyyy-MM-dd');

    const lineMenu = (line: DayLine): MenuEntry[] => {
        const entries: MenuEntry[] = [];
        if (!line.done && line.start === null) {
            entries.push({
                key: 'plan',
                label: t('today.planIt', 'Plan at the next free time'),
                hint: 'T',
                onSelect: () => plan(line),
            });
        }
        if (line.start !== null) {
            entries.push({
                key: 'unslot',
                label: t('today.unslot', 'Remove the time'),
                onSelect: () =>
                    run(
                        [{ op: 'unslot', task_uid: line.uid }],
                        t('today.unslotted', 'Time removed')
                    ),
            });
        }
        entries.push(
            {
                key: 'tomorrow',
                label: t('today.toTomorrow', 'Move to tomorrow'),
                hint: 'D',
                onSelect: () =>
                    postpone(
                        line,
                        tomorrow,
                        t('today.movedTomorrow', 'Moved to tomorrow')
                    ),
            },
            {
                key: 'nextWeek',
                label: t('today.toNextWeek', 'Move to next week'),
                onSelect: () =>
                    postpone(
                        line,
                        nextWeek,
                        t('today.movedNextWeek', 'Moved to next week')
                    ),
            }
        );
        if (line.planned) {
            entries.push({
                key: 'remove',
                label: t('today.removeFromDay', 'Take off this day'),
                onSelect: () =>
                    run(
                        [{ op: 'remove', task_uid: line.uid }],
                        t('today.removed', 'Taken off the day')
                    ),
            });
        }
        entries.push('separator', {
            key: 'open',
            label: t('today.open', 'Open'),
            hint: '↵',
            onSelect: () => openLine(line),
        });
        return entries;
    };

    // The detail opens in the layout's side pane (`?task=`), as in TickTick.
    const { openTaskUid, openTask } = useTaskPane();
    // A second click on the open task closes its detail.
    const { closeTask } = useTaskPane();
    const openLine = (line: DayLine) =>
        openTaskUid === line.uid ? closeTask() : openTask(line.uid);

    // A recurring task done for this day has already moved on to its next
    // date: toggling it here would complete that next occurrence.
    const toggleLine = (line: DayLine) => {
        if (line.done && !isTaskDone(line.task.status)) return;
        void toggle(line.task);
    };

    // Places every open line without a time in the free time, in list order.
    const organize = () => {
        let taken = items;
        const ops: PlanOp[] = [];
        for (const line of lines.anytime) {
            const start = freeSlotFor(line, taken);
            if (start === null) continue;
            ops.push({
                op: 'slot',
                task_uid: line.uid,
                start_minute: start,
                duration_minutes: line.duration,
            });
            taken = [
                ...taken.filter((item) => item.task_uid !== line.uid),
                {
                    task_uid: line.uid,
                    task: line.task,
                    position: taken.length,
                    start_minute: start,
                    duration_minutes: line.duration,
                },
            ];
        }
        if (ops.length === 0) return;
        void run(
            ops,
            t('today.organized', '{{count}} tasks placed', {
                count: ops.length,
            })
        );
    };

    // "Shift the rest": the slipped task starts now, later ones move as far
    // as needed, in order; nothing else moves.
    const shiftRest = () => {
        if (!slipped || now === null) return;
        const later = lines.timed.filter(
            (line) =>
                line.start !== null &&
                (line.uid === slipped.uid ||
                    (line.start as number) >= (slipped.start as number))
        );
        let cursor = Math.ceil(now / SLOT_MINUTES) * SLOT_MINUTES;
        const ops: PlanOp[] = [];
        for (const line of later) {
            const clash = busy.find(
                (b) => cursor < b.end && b.start < cursor + line.duration
            );
            if (clash)
                cursor = Math.ceil(clash.end / SLOT_MINUTES) * SLOT_MINUTES;
            const start = Math.max(
                cursor,
                line.uid === slipped.uid ? cursor : (line.start as number)
            );
            if (start !== line.start) {
                ops.push({
                    op: 'slot',
                    task_uid: line.uid,
                    start_minute: start,
                });
            }
            cursor = start + line.duration;
        }
        void run(ops, t('today.shifted', 'Rest of the day shifted'));
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

    const lineOf = (uid: string, onDate = date): DayLine | null => {
        if (onDate !== date) {
            return (
                columns
                    .find((column) => column.date === onDate)
                    ?.lines.find((line) => line.uid === uid) ?? null
            );
        }
        const all = [...lines.timed, ...lines.anytime, ...lines.done];
        const found = all.find((line) => line.uid === uid);
        if (found) return found;
        const task = tasks.get(uid) as Task | undefined;
        return task ? lineFromDue(task, date) : null;
    };

    // Plan writes on the shown day are optimistic; on another day of the
    // view they go straight to the server, and every day reloads after.
    const write = (onDate: string, ops: PlanOp[], undo?: string) =>
        onDate === date ? run(ops, undo) : runOn(onDate, ops, undo);

    // Gives `line` a slot on `target`, taking it off the day it was planned
    // on when that is another one. The deadline never moves.
    const slotOn = async (
        line: DayLine,
        fromDate: string,
        target: string,
        start: number
    ) => {
        const slot: PlanOp = {
            op: 'slot',
            task_uid: line.uid,
            start_minute: Math.min(start, 1440 - line.duration),
            duration_minutes: line.duration,
        };
        const undo = t('today.slotMoved', '“{{name}}” planned', {
            name: line.task.name,
        });
        if (target === fromDate || !line.planned) {
            await write(target, [slot], undo);
            return;
        }
        await write(fromDate, [
            { op: 'move', task_uid: line.uid, to_date: target },
        ]);
        await write(target, [slot], undo);
    };

    const dropMinute = (event: DragMoveEvent | DragEndEvent): number | null => {
        const grid = gridRef.current;
        const data = event.active.data.current as
            { kind: string; start?: number } | undefined;
        if (!grid || !data) return null;
        if (data.kind === 'line') {
            const top = event.active.rect.current.translated?.top;
            if (top === undefined) return null;
            return minuteFromOffset(
                top - grid.getBoundingClientRect().top,
                range
            );
        }
        const moved = (data.start as number) + event.delta.y / PX_PER_MINUTE;
        return Math.max(
            range.start,
            Math.round(moved / SLOT_MINUTES) * SLOT_MINUTES
        );
    };

    // The day's tasks that have a slot, in time order.
    const slottedLines = lines.timed.filter((l) => l.start !== null);

    const reflowOps = (moving: DayLine, overUid: string): PlanOp[] =>
        reflowSlots(slottedLines, moving, overUid, busy).map((slot) => ({
            op: 'slot' as const,
            task_uid: slot.uid,
            start_minute: slot.start,
            duration_minutes: slot.duration,
        }));

    const onDragStart = (event: DragStartEvent) => {
        const data = event.active.data.current as
            { kind: DragState['kind']; uid: string; date?: string } | undefined;
        const fromDate = data?.date ?? date;
        const line = data ? lineOf(data.uid, fromDate) : null;
        if (data && line) setDragging({ kind: data.kind, line, fromDate });
    };

    const overDate = (event: DragMoveEvent | DragEndEvent): string | null => {
        const data = event.over?.data.current as
            { kind?: string; date?: string } | undefined;
        return data?.kind === 'grid' && data.date ? data.date : null;
    };

    const onDragMove = (event: DragMoveEvent) => {
        if (!dragging) return;
        const target = overDate(event);
        const minute = target ? dropMinute(event) : null;
        // A block dragged within its own day shows itself moving.
        const ownDay = dragging.kind !== 'line' && target === dragging.fromDate;
        setGhost(
            target && minute !== null && !ownDay
                ? { date: target, minute }
                : null
        );
    };

    const onDragEnd = (event: DragEndEvent) => {
        const state = dragging;
        setDragging(null);
        setGhost(null);
        if (!state || !event.over) return;
        const { line } = state;
        const overId = String(event.over.id);
        const target = overDate(event);
        if (target) {
            const start = dropMinute(event);
            if (start === null) return;
            if (target === state.fromDate && start === line.start) return;
            void slotOn(line, state.fromDate, target, start);
            return;
        }
        // A block of another day dropped on the list comes to this day.
        if (
            overId === 'list' &&
            state.kind === 'block' &&
            state.fromDate !== date
        ) {
            void write(
                state.fromDate,
                [{ op: 'move', task_uid: line.uid, to_date: date }],
                t('today.movedHere', 'Moved to this day')
            );
            return;
        }
        if (overId === 'list' && state.kind === 'block') {
            void run(
                [{ op: 'unslot', task_uid: line.uid }],
                t('today.unslotted', 'Time removed')
            );
            return;
        }
        if (!overId.startsWith('line:') || state.kind !== 'line') return;
        const overUid = overId.slice(5);
        if (overUid === line.uid) return;

        // Dropped among the tasks that have a time: the list order is the
        // day's order, so the slots follow it (Sunsama's Today).
        if (slottedLines.some((l) => l.uid === overUid)) {
            const ops = reflowOps(line, overUid);
            if (ops.length > 0) {
                void run(ops, t('today.reordered', 'Day reordered'));
            }
            return;
        }

        // Among the lines without a time: the plan holds the order. A task
        // that had a time loses it there, and stays on the day.
        const order = lines.anytime.map((l) => l.uid);
        const to = order.indexOf(overUid);
        if (to === -1) return;
        const from = order.indexOf(line.uid);
        if (from !== -1) order.splice(from, 1);
        order.splice(to, 0, line.uid);
        const after = order.slice(order.indexOf(line.uid) + 1);
        const plannedUids = new Set(items.map((item) => item.task_uid));
        const before = after.find((uid) => plannedUids.has(uid)) ?? null;
        const ops: PlanOp[] = [
            line.planned
                ? { op: 'reorder', task_uid: line.uid, before_uid: before }
                : { op: 'add', task_uid: line.uid, before_uid: before },
        ];
        if (line.start !== null) {
            ops.push({ op: 'unslot', task_uid: line.uid });
        }
        void run(
            ops,
            line.start !== null
                ? t('today.unslotted', 'Time removed')
                : undefined
        );
    };

    const dateObj = parseISO(date);
    const isToday = date === today;
    const relative = isToday
        ? t('today.title', 'Today')
        : date === format(addDays(parseISO(today), 1), 'yyyy-MM-dd')
          ? t('today.tomorrow', 'Tomorrow')
          : date === format(addDays(parseISO(today), -1), 'yyyy-MM-dd')
            ? t('today.yesterday', 'Yesterday')
            : new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(
                  dateObj
              );
    // Beside the heavy title, as in Sorted³ ("Today Tue Sep 1").
    const subtitle = new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    }).format(dateObj);
    const summaryText = summary.over
        ? t('today.summaryOver', '{{needed}} planned for {{free}} free', {
              needed: formatDuration(summary.needed),
              free: formatDuration(summary.free),
          })
        : [
              t('today.taskCount', '{{count}} tasks', { count: summary.open }),
              summary.needed > 0 ? formatDuration(summary.needed) : null,
          ]
              .filter(Boolean)
              .join(' · ');

    const showCalendar = narrow ? mobileView === 'calendar' : calendarOpen;
    const setCalendar = (open: boolean) => {
        setCalendarOpen(open);
        try {
            localStorage.setItem('today.calendarOpen', String(open));
        } catch {
            // Private mode: the choice lasts until reload.
        }
    };

    const headerMenu: MenuEntry[] = [
        ...(slipped
            ? [
                  {
                      key: 'shift',
                      label: t('today.shiftRest', 'Shift the rest of the day'),
                      onSelect: shiftRest,
                  },
              ]
            : []),
        {
            key: 'brief',
            label: t('today.brief', 'Daily brief'),
            onSelect: () => navigate('/insights/daily-brief'),
        },
        'separator',
        {
            key: 'classic',
            label: t('today.classic', 'Previous Today page'),
            onSelect: () =>
                setParams({ ...(isToday ? {} : { date }), classic: '1' }),
        },
    ];

    const pickRow = (task: Task, action: () => void, label: string) => (
        <div
            key={task.uid}
            className="flex min-h-[36px] items-center gap-3 rounded-lg px-3 hover:bg-surface-high max-sm:min-h-[44px]"
        >
            <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-body-m text-surface-on"
                onClick={() => task.uid && openTask(task.uid)}
            >
                {task.name}
            </button>
            {task.due_date && (
                <span className="text-xs tabular-nums text-surface-on-variant">
                    {new Intl.DateTimeFormat(locale, {
                        day: 'numeric',
                        month: 'short',
                    }).format(parseISO(task.due_date.slice(0, 10)))}
                </span>
            )}
            <Button size="sm" variant="ghost" onClick={action}>
                {label}
            </Button>
        </div>
    );

    const suggestionTasks = useMemo(() => {
        const s = day?.suggestions;
        if (!s) return [];
        const seen = new Set<string>();
        return [
            ...s.tagged_today,
            ...s.in_progress,
            ...s.tomorrow,
            ...s.this_week,
            ...s.in_view,
            ...s.suggested,
        ].filter((task) => {
            if (!task.uid || seen.has(task.uid)) return false;
            seen.add(task.uid);
            return true;
        });
    }, [day]);

    const take = (task: Task) =>
        task.uid &&
        void run(
            [{ op: 'add', task_uid: task.uid }],
            t('today.added', '“{{name}}” added to the day', {
                name: task.name,
            })
        );

    const addField = (
        <form
            className="mx-4 mb-1.5 mt-2"
            onSubmit={(event) => {
                event.preventDefault();
                const name = adding.trim();
                if (!name) return;
                setAdding('');
                void create(name);
            }}
        >
            <label className="flex h-10 items-center gap-2.5 rounded-chip bg-surface-low px-3 text-body-m focus-within:ring-2 focus-within:ring-primary/40 max-sm:h-11">
                <span aria-hidden className="text-primary">
                    +
                </span>
                <input
                    value={adding}
                    onChange={(event) => setAdding(event.target.value)}
                    placeholder={t('today.addPlaceholder', 'Add a task')}
                    aria-label={t('today.addPlaceholder', 'Add a task')}
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-surface-on placeholder:text-surface-on-variant focus:outline-none focus:ring-0"
                />
            </label>
        </form>
    );

    if (error && !day) {
        return (
            <div className="p-8 text-body-m text-surface-on-variant">
                {error}
            </div>
        );
    }

    const list = (
        <DayList
            title={relative}
            subtitle={subtitle}
            summaryText={summaryText}
            overloaded={summary.over}
            summaryTitle={t(
                'today.summaryDetail',
                '{{needed}} needed · {{free}} free',
                {
                    needed: formatDuration(summary.needed),
                    free: formatDuration(summary.free),
                }
            )}
            isToday={isToday}
            onPrev={() => shift(-1)}
            onNext={() => shift(1)}
            onToday={() => goTo(today)}
            headerMenu={headerMenu}
            hideCompleted={hideCompleted}
            onHideCompletedChange={setHideCompleted}
            organize={
                lines.anytime.length > 0
                    ? {
                          label: t('today.organize', 'Organize'),
                          onClick: organize,
                      }
                    : null
            }
            addField={addField}
            expanded={expanded}
            onToggleSubtask={(sub) =>
                sub.uid &&
                toggleTaskCompletion(sub.uid, sub).then(reload).catch(reload)
            }
            extraActions={
                <>
                    <Button
                        size="sm"
                        variant={expanded ? 'primary' : 'secondary'}
                        aria-pressed={expanded}
                        icon={<Bars3BottomLeftIcon className="h-4 w-4" />}
                        onClick={() => setExpandedStored(!expanded)}
                    >
                        {t('today.details', 'Details')}
                    </Button>
                    {!showCalendar ? (
                        <Button
                            size="sm"
                            variant="secondary"
                            icon={<CalendarDaysIcon className="h-4 w-4" />}
                            onClick={() =>
                                narrow
                                    ? setMobileView('calendar')
                                    : setCalendar(true)
                            }
                        >
                            {t('today.calendarButton', 'Calendar')}
                        </Button>
                    ) : null}
                </>
            }
            slip={
                slipped
                    ? {
                          title: slipped.task.name,
                          actions: [
                              {
                                  label: t(
                                      'today.shiftRestShort',
                                      'Shift the rest'
                                  ),
                                  onClick: shiftRest,
                              },
                              {
                                  label: t('today.later', 'Later'),
                                  onClick: () =>
                                      run(
                                          [
                                              {
                                                  op: 'unslot',
                                                  task_uid: slipped.uid,
                                              },
                                          ],
                                          t('today.unslotted', 'Time removed')
                                      ),
                              },
                          ],
                      }
                    : null
            }
            lines={lines}
            dateOfDay={date}
            currentUid={current?.uid ?? null}
            selectedUid={openTaskUid}
            lineMenu={lineMenu}
            onToggle={toggleLine}
            onOpen={openLine}
            overdue={
                day && day.overdue.length > 0
                    ? {
                          count: day.overdue.length,
                          content: day.overdue.map((task) =>
                              pickRow(
                                  task,
                                  () => take(task),
                                  t('today.takeToday', 'Do today')
                              )
                          ),
                          action: {
                              label: t('today.takeAll', 'Do all today'),
                              onClick: () =>
                                  run(
                                      day.overdue
                                          .filter((task) => task.uid)
                                          .map((task) => ({
                                              op: 'add' as const,
                                              task_uid: task.uid as string,
                                          })),
                                      t(
                                          'today.takenAll',
                                          'Late tasks added to the day'
                                      )
                                  ),
                          },
                      }
                    : null
            }
            suggestions={
                suggestionTasks.length > 0
                    ? {
                          count: suggestionTasks.length,
                          content: suggestionTasks
                              .slice(0, 20)
                              .map((task) =>
                                  pickRow(
                                      task,
                                      () => take(task),
                                      t('today.add', 'Add')
                                  )
                              ),
                      }
                    : null
            }
            emptyText={
                isToday
                    ? t(
                          'today.empty',
                          'Nothing planned. Add a task or pick one from the suggestions.'
                      )
                    : t('today.emptyDay', 'Nothing planned for this day.')
            }
        />
    );

    const setSpan = (value: number) => {
        setSpanState(value);
        try {
            localStorage.setItem('today.span', String(value));
        } catch {
            // Private mode: the choice lasts until reload.
        }
    };

    // The day arrows live in the list header only: one control per page.
    const calendarHeader = (
        <div className="flex items-center gap-1">
            <span className="ml-auto flex items-center gap-2">
                {!narrow && (
                    <span
                        role="group"
                        aria-label={t('today.daysShown', 'Days shown')}
                        className="inline-flex rounded-lg bg-surface-high p-0.5"
                    >
                        {SPANS.map((value) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={span === value}
                                onClick={() => setSpan(value)}
                                className={`h-7 rounded-md px-2.5 text-body-m tabular-nums ${
                                    span === value
                                        ? 'bg-surface font-semibold text-surface-on shadow-sm'
                                        : 'text-surface-on-variant hover:text-surface-on'
                                }`}
                            >
                                {t('today.spanDays', '{{count}} d', {
                                    count: value,
                                })}
                            </button>
                        ))}
                    </span>
                )}
                {narrow ? (
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setMobileView('list')}
                    >
                        {t('today.backToList', 'List')}
                    </Button>
                ) : (
                    <IconButton
                        label={t('today.hideCalendar', 'Hide the calendar')}
                        onClick={() => setCalendar(false)}
                    >
                        <ChevronDoubleRightIcon />
                    </IconButton>
                )}
            </span>
        </div>
    );

    const calendar = (
        <DayCalendar
            range={range}
            columns={columns}
            gridRef={gridRef}
            header={calendarHeader}
            selectedUid={openTaskUid}
            onWiden={() => pane.update(PANE_MIN, true)}
            onToggle={toggleLine}
            onOpen={openLine}
            onResize={(onDate, uid, duration) =>
                write(
                    onDate,
                    [
                        {
                            op: 'resize',
                            task_uid: uid,
                            duration_minutes: duration,
                        },
                    ],
                    t('today.resized', 'Duration changed')
                )
            }
            onMove={(onDate, uid, start) =>
                write(onDate, [
                    { op: 'slot', task_uid: uid, start_minute: start },
                ])
            }
            onUnslot={(onDate, uid) =>
                write(
                    onDate,
                    [{ op: 'unslot', task_uid: uid }],
                    t('today.unslotted', 'Time removed')
                )
            }
            drop={
                ghost && dragging
                    ? {
                          date: ghost.date,
                          minute: ghost.minute,
                          duration: dragging.line.duration,
                          title: dragging.line.task.name,
                      }
                    : null
            }
            onOpenEvent={(event, onDate) =>
                setEventDetail({
                    title: event.title,
                    calendarName: event.feed_name,
                    day: parseISO(onDate),
                    start: event.start ? new Date(event.start) : null,
                    end: event.end ? new Date(event.end) : null,
                    allDay: event.all_day,
                    location: event.location ?? null,
                    description: event.description ?? null,
                })
            }
        />
    );

    const showList = !narrow || mobileView === 'list';
    const sideBySide = !narrow && showCalendar && pane.fits;

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
                ref={panesRef}
                data-testid="today-view"
                className="flex h-full min-h-0 w-full bg-surface max-md:h-auto max-md:min-h-[calc(100dvh-3.5rem)] max-md:pb-24"
            >
                {showList && (
                    <section
                        aria-label={t('today.title', 'Today')}
                        className="flex min-h-0 min-w-0 flex-col overflow-y-auto"
                        style={
                            sideBySide
                                ? {
                                      width: pane.width,
                                      flex: 'none',
                                  }
                                : { flex: 1 }
                        }
                    >
                        {list}
                    </section>
                )}
                {sideBySide && (
                    <PaneSplitter
                        width={pane.width}
                        containerRef={panesRef}
                        onChange={pane.update}
                    />
                )}
                {showCalendar && (
                    <section
                        aria-label={t('today.calendar', 'Day calendar')}
                        className={`flex min-h-0 min-w-0 flex-1 flex-col ${
                            sideBySide
                                ? 'border-l border-outline-variant/60'
                                : ''
                        }`}
                    >
                        {calendar}
                    </section>
                )}
            </div>
            {eventDetail && (
                <FeedEventPopover
                    detail={eventDetail}
                    onClose={() => setEventDetail(null)}
                />
            )}
            <DragOverlay dropAnimation={null}>
                {dragging?.kind === 'line' && ghost === null ? (
                    <div className="max-w-xs truncate rounded-lg bg-surface px-3 py-1.5 text-body-m text-surface-on shadow-lg ring-1 ring-outline-variant">
                        {dragging.line.task.name}
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

export default TodayView;
