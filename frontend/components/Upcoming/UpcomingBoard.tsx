import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
    Announcements,
    CollisionDetection,
    DndContext,
    DragEndEvent,
    DragMoveEvent,
    DragOverlay,
    DragStartEvent,
    KeyboardSensor,
    KeyboardSensorOptions,
    MeasuringStrategy,
    PointerSensor,
    TouchSensor,
    pointerWithin,
    rectIntersection,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { addDays, format, getDay, parseISO } from 'date-fns';
import {
    CalendarDaysIcon,
    ChevronDoubleRightIcon,
    ChevronDownIcon,
    SparklesIcon,
    Squares2X2Icon,
    ChevronLeftIcon,
    ChevronRightIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import { TASK_STATUS, isTaskDone } from '../../constants/taskStatus';
import { getUserTimezone } from '../../utils/dateUtils';
import { useTaskPane } from '../../contexts/TaskPaneContext';
import { useStore } from '../../store/useStore';
import { useToast } from '../Shared/ToastContext';
import Button, { IconButton } from '../Shared/ui/Button';
import Segmented from '../Shared/ui/Segmented';
import { useViewportWidth } from '../../hooks/useViewportWidth';
import { PAGE_TITLE_CLASS } from '../Shared/ui/PageHeader';
import { PAGE_GUTTER } from '../Shared/ui/PageShell';
import {
    createTask,
    toggleTaskCompletion,
    updateTask,
} from '../../utils/tasksService';
import {
    applyPlanOps,
    DayResponse,
    PlanChangedError,
    fetchDay,
    restorePlan,
} from '../../utils/dayService';
import type { PlanOp } from '../../utils/dayService';
import CalendarEventDetail from '../Calendar/CalendarEventDetail';
import type { CalendarEvent } from '../../utils/calendarFeedsService';
import { formatMinute, intlLocale, minuteOfDay } from '../DailyPlan/planUtils';
import {
    DayLine,
    dayLines,
    lineAt,
    lineFromDue,
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
import { parseQuickAdd } from '../../utils/quickAddParse';
import {
    useCalendarEvents,
    useDays,
    useHorizonTasks,
    useUnsortedTasks,
} from './useDays';
import { useInboxPolling } from '../Inbox/useInboxPolling';
import InboxColumn, {
    INBOX_CARD_DATE,
    inboxCollapsed,
    loadInboxCollapsed,
    openInboxItems,
    saveInboxCollapsed,
} from './InboxColumn';
import type { InboxDragData } from './InboxColumn';
import { processInboxItemWithStore } from '../../utils/inboxService';
import DayColumn from './DayColumn';
import type { ColumnDropData } from './DayColumn';
import TaskCard, { cardId } from './TaskCard';
import type { CardData } from './TaskCard';
import ViewMenu from './ViewMenu';
import JumpToDate from './JumpToDate';
import HorizonColumn, { horizonFromCardDate } from './HorizonColumn';
import Menu, { MenuEntry } from '../Shared/ui/Menu';
import type { HorizonDropData } from './HorizonColumn';
import {
    HORIZON_KEYS,
    HorizonBuckets,
    HorizonKey,
    bucketHorizons,
    horizonColumns,
    horizonOf,
    horizonPatch,
    horizonRowsFill,
    leaveDayWrites,
    plannedThisWeek,
    STRIP_KEYS,
    toPlan,
    weekDates,
    weekStartOf,
} from './horizons';
import ToPlanBox, {
    TO_PLAN_CARD_DATE,
    loadToPlanCollapsed,
    saveToPlanCollapsed,
    toPlanCount,
} from './ToPlanBox';
import { applyFilters } from './filters';
import {
    PlanFilters,
    PlanViewOptions,
    loadViewOptions,
    saveViewOptions,
} from './viewOptions';
import {
    PlanWrite,
    applyWritesLocally,
    calendarDropWrites,
    calendarRange,
    columnDates,
    columnDropWrites,
    datesHolding,
    dayString,
    inverseWrites,
    planItemUids,
    plannedLine,
    reorderWrites,
    shiftDay,
    timedSpans,
    touchedDates,
    withoutMissingAnchors,
} from './planOps';
import {
    CALENDAR_MIN,
    INBOX_COLLAPSED_WIDTH,
    INBOX_MIN,
    INBOX_WIDTH,
    anchorFor,
    boardDates,
    calendarMaxWidth,
    calendarPlacement,
    calendarStart,
    clampCalendarWidth,
    clampInboxWidth,
    inboxMaxWidth,
    minBoardWidth,
    neighbourDate,
    shiftWeek,
} from './boardDates';
import PluginActions from '../Plugins/PluginActions';
import ProposalButton from '../Proposals/ProposalButton';
import { useProposalChanged } from '../Proposals/useProposalChanged';
import { SPREAD_DAYS, spreadOverdue } from './spreadOverdue';
import { weekLoad } from './weekLoad';
import WeekLoadBadge from './WeekLoadBadge';
import { dayLoad } from './groupCards';
import { firstFreeDay, QuickPlace, QuickPlaceContext } from './firstFreeDay';
import PushedSection, { PushedCountsContext } from './PushedSection';
import {
    decideTask,
    fetchReviewCategory,
    PushedItem,
    TaskDecision,
} from '../../utils/reviewService';
import { PickedCardsContext } from './pickedCards';
import { useLocation, useNavigate } from 'react-router-dom';
import { PROPOSAL_PARAM, setProposalParam } from '../Proposals/proposalLinks';
import { useWeekPreview } from './useWeekPreview';
import { useProposal } from '../Proposals/useProposal';
import {
    PreviewBanner,
    PreviewDragData,
    PreviewHorizons,
    WeekPreviewContext,
    WeekPreviewContextValue,
} from './WeekPreview';
import { decisionOfPlace, PreviewPlace } from './weekPreview';
import { isEditableTarget } from '../../utils/shortcutDispatcher';

const SLOT = 15;
const DEFAULT_HOURS = { start: 480, end: 1080 };
const DEFAULT_DAY_MINUTES = 8 * 60;
// Calendar width before the user drags the splitter, per day shown.
const CALENDAR_WIDTH: Record<number, number> = { 1: 360, 3: 520, 7: 600 };
const WIDTH_KEY = 'upcoming.calendarWidth';
const INBOX_WIDTH_KEY = 'upcoming.inboxWidth';
const OVERDUE_KEY = 'upcoming.overdueCollapsed';
const KEY_STEP = 24;
// The pseudo-day of the overdue strip's cards: planned on no day.
const OVERDUE = 'overdue';
const CARD = '[data-testid="upcoming-card"]';
const COLUMN =
    '[data-testid="upcoming-column"], [data-testid="horizon-column"]';
const CONTAINER = `${COLUMN}, [data-testid="upcoming-overdue"], [data-testid="inbox-column"], [data-testid="to-plan-box"]`;

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
    | PreviewDragData
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

// Keyboard drags start on the M key, read from the character typed so it is
// layout-independent (the physical key code of M differs between layouts).
class LetterKeyboardSensor extends KeyboardSensor {
    static activators = [
        {
            eventName: 'onKeyDown' as const,
            handler: (
                event: React.KeyboardEvent,
                { onActivation }: KeyboardSensorOptions,
                {
                    active,
                }: {
                    active: {
                        activatorNode: React.MutableRefObject<HTMLElement | null>;
                    };
                }
            ) => {
                const native = event.nativeEvent;
                if (
                    native.key?.toLowerCase() !== 'm' ||
                    // Shift+M sends the card to This month instead.
                    native.shiftKey ||
                    native.ctrlKey ||
                    native.metaKey ||
                    native.altKey
                ) {
                    return false;
                }
                const activator = active.activatorNode.current;
                if (activator && event.target !== activator) return false;
                event.preventDefault();
                onActivation?.({ event: native });
                return true;
            },
        },
    ];
}

const readStored = (key: string): string | null => {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

const writeStored = (key: string, value: string) => {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Private mode: the choice lasts for this page view.
    }
};

const useElementWidth = (ref: React.RefObject<HTMLElement>): number => {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(([entry]) =>
            setWidth(entry.contentRect.width)
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref]);
    return width;
};

const filterTasks = (tasks: Task[], filters: PlanFilters): Task[] =>
    applyFilters(
        tasks.map((task) => ({ task })),
        filters
    ).map((line) => line.task);

// The day as the filters let it show: plan items and due tasks that pass.
const filterDay = (day: DayResponse, filters: PlanFilters): DayResponse => ({
    ...day,
    plan: day.plan
        ? { ...day.plan, items: applyFilters(day.plan.items, filters) }
        : null,
    due: filterTasks(day.due, filters),
    overdue: filterTasks(day.overdue ?? [], filters),
});

interface PaneSplitterProps {
    label: string;
    testId: string;
    width: number;
    min: number;
    max: number;
    // The edge of `containerRef` the pane is measured from: the calendar
    // from the right of the panes, the inbox from its own left.
    from: 'left' | 'right';
    containerRef: React.RefObject<HTMLElement>;
    // Double click brings it back.
    defaultWidth: number;
    onChange(width: number, persist?: boolean): void;
}

// A handle between two panes. It reports the pane's width (what is
// remembered), dragged or with the arrow keys; the handle moves with the
// arrow.
const PaneSplitter: React.FC<PaneSplitterProps> = ({
    label,
    testId,
    width,
    min,
    max,
    from,
    containerRef,
    defaultWidth,
    onChange,
}) => {
    const dragging = useRef(false);
    const widthAt = (clientX: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return width;
        return from === 'right' ? rect.right - clientX : clientX - rect.left;
    };
    const end = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging.current) return;
        dragging.current = false;
        onChange(widthAt(event.clientX), true);
    };
    const grow = from === 'right' ? 'ArrowLeft' : 'ArrowRight';
    const shrink = from === 'right' ? 'ArrowRight' : 'ArrowLeft';
    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={label}
            aria-valuemin={min}
            aria-valuemax={Math.round(max)}
            aria-valuenow={Math.round(width)}
            tabIndex={0}
            data-testid={testId}
            className="w-1.5 shrink-0 cursor-col-resize touch-none self-stretch rounded transition-colors hover:bg-primary/30 focus-visible:bg-primary/40 focus:outline-none active:bg-primary/50"
            onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture?.(event.pointerId);
                dragging.current = true;
            }}
            onPointerMove={(event) => {
                if (dragging.current) onChange(widthAt(event.clientX));
            }}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(event) => {
                let next: number | null = null;
                if (event.key === grow) next = width + KEY_STEP;
                if (event.key === shrink) next = width - KEY_STEP;
                if (event.key === 'Home') next = min;
                if (event.key === 'End') next = max;
                if (next === null) return;
                event.preventDefault();
                onChange(next, true);
            }}
            onDoubleClick={() => onChange(defaultWidth, true)}
        />
    );
};

/**
 * The Plan page. Days: two weeks of fixed-width day columns from the anchor
 * day, in a strip that scrolls sideways, with the overdue tasks above them.
 * Horizons: This week, This month, Next month, Someday. On the right, a
 * resizable calendar of 1, 3 or 7 days from the selected day (a drawer over
 * the board on narrow windows). Day writes go through the day plan ops
 * (docs/fork/TODAY-REDESIGN.md), are shown at once and never touch due
 * dates; horizon writes set week_of, month_of or #someday.
 */
const UpcomingBoard: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { showErrorToast, showUndoToast, showSuccessToast } = useToast();
    const { openTaskUid, openTask, closeTask } = useTaskPane();
    const calendarEnabled = useStore(
        (state) => state.userSettingsStore.calendarEnabled
    );
    const projects = useStore((state) => state.projectsStore.projects);
    const tags = useStore((state) => state.tagsStore.tags);
    const timezone = getUserTimezone();
    const today = dayString(new Date(), timezone);
    const tomorrow = shiftDay(today, 1);
    const locale = intlLocale(i18n.language);
    const narrow = useIsNarrow();
    const viewport = useViewportWidth();

    const [options, setOptionsState] =
        useState<PlanViewOptions>(loadViewOptions);
    const setOptions = useCallback((next: PlanViewOptions) => {
        setOptionsState(next);
        saveViewOptions(next);
    }, []);
    const patchOptions = (patch: Partial<PlanViewOptions>) =>
        setOptions({ ...options, ...patch });
    // The AI's week (`?proposal=<uid>` of a week proposal): shown over the
    // board until applied or ignored (docs/03-upcoming-view.md › Week preview).
    const location = useLocation();
    const navigate = useNavigate();
    const proposalUid = new URLSearchParams(location.search).get(
        PROPOSAL_PARAM
    );
    const preview = useWeekPreview(proposalUid);
    // The « Planned by AI » tab shows once a week proposal is ready (or open).
    const weekProposal = useProposal('week');
    useProposalChanged(() => void weekProposal.refresh());
    // Nothing of the AI shows while no agent listens (plugin off).
    const previewOpen =
        weekProposal.agent &&
        !!proposalUid &&
        ((preview.isWeek && !preview.closed) || preview.loadFailed);
    const previewing = previewOpen && preview.ready;
    // A week is previewed on the days: the layout is Days while it shows.
    const horizonsMode = options.mode === 'horizons' && !previewOpen;
    const span = narrow ? 1 : options.calendarSpan;

    const [anchor, setAnchor] = useState(today);
    const [selected, setSelected] = useState(today);
    const [calendarDate, setCalendarDate] = useState(today);
    const [scrollTo, setScrollTo] = useState<{ date: string } | null>(null);
    const [clock, setClock] = useState(() => minuteOfDay(new Date(), timezone));
    const [dragging, setDragging] = useState<Dragging | null>(null);
    const draggingRef = useRef(false);
    const [ghost, setGhost] = useState<DropPreview | null>(null);
    const [eventDetail, setEventDetail] = useState<{
        event: CalendarEvent;
        onDate: string;
    } | null>(null);
    const [eventsVersion, setEventsVersion] = useState(0);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [inboxChoice, setInboxChoice] = useState(loadInboxCollapsed);
    // One line until opened: the overdue cards no longer push the week down.
    const [overdueCollapsed, setOverdueCollapsed] = useState(
        () => readStored(OVERDUE_KEY) !== '0'
    );
    const [storedWidth, setStoredWidth] = useState(() => {
        const stored = Number(readStored(WIDTH_KEY));
        return stored > 0 ? stored : (CALENDAR_WIDTH[span] ?? 360);
    });
    const [storedInboxWidth, setStoredInboxWidth] = useState(() =>
        Number(readStored(INBOX_WIDTH_KEY))
    );
    const [pendingFocus, setPendingFocus] = useState<{
        date: string;
        uid: string;
    } | null>(null);
    const boardRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const panesRef = useRef<HTMLDivElement>(null);
    const inboxRef = useRef<HTMLDivElement>(null);
    const panesWidth = useElementWidth(panesRef);
    const boardWidth = useElementWidth(boardRef);

    useEffect(() => {
        const timer = window.setInterval(
            () => setClock(minuteOfDay(new Date(), timezone)),
            60_000
        );
        return () => window.clearInterval(timer);
    }, [timezone]);

    const inboxItems = useStore((state) => state.inboxStore.inboxItems);
    const inboxLoading = useStore((state) => state.inboxStore.isLoading);
    const unsorted = useUnsortedTasks(true);
    // Tasks planned on a loaded day from today on: the server still counts
    // them unsorted (a plan line is no moment), the inbox column does not.
    // Read from the days after they load, hence state.
    const [plannedSoon, setPlannedSoon] = useState('');
    // How many tasks « À planifier » holds, read after the days load: an
    // empty inbox column stays open while the box under it has some.
    const [toPlanTotal, setToPlanTotal] = useState(0);
    const [toPlanCollapsed, setToPlanCollapsedState] =
        useState(loadToPlanCollapsed);
    const setToPlanCollapsed = (collapsed: boolean) => {
        setToPlanCollapsedState(collapsed);
        saveToPlanCollapsed(collapsed);
    };
    const inboxTasks = useMemo(() => {
        const planned = new Set(plannedSoon.split(','));
        return (unsorted.tasks ?? []).filter(
            (task) => !planned.has(task.uid as string)
        );
    }, [unsorted.tasks, plannedSoon]);
    const inboxTasksRef = useRef(inboxTasks);
    inboxTasksRef.current = inboxTasks;
    const openInboxCount =
        openInboxItems(inboxItems).length + inboxTasks.length;
    // A thin bar only in Horizons: in Days the inbox is a section of the
    // left column, among the horizons under it.
    const inboxIsCollapsed =
        horizonsMode &&
        !inboxLoading &&
        unsorted.tasks !== null &&
        inboxCollapsed(openInboxCount + toPlanTotal, inboxChoice);
    // The inbox leaves room for the calendar only when the calendar sits
    // beside a board with the usual inbox; a drawer takes no room.
    const calendarBeside =
        !narrow &&
        options.showCalendar &&
        calendarPlacement(viewport, panesWidth, minBoardWidth(INBOX_WIDTH)) ===
            'split';
    const openInboxWidth = clampInboxWidth(
        storedInboxWidth,
        panesWidth,
        calendarBeside
    );
    const inboxWidth = inboxIsCollapsed
        ? INBOX_COLLAPSED_WIDTH
        : openInboxWidth;
    const minBoard = minBoardWidth(inboxWidth);
    const placement = narrow
        ? 'drawer'
        : calendarPlacement(viewport, panesWidth, minBoard);
    // A previewed week puts each day's events in its column: the side
    // calendar makes room for more days.
    // The calendar merged into the days (Days layout): no side calendar.
    const merged = options.mergeCalendar && !horizonsMode;
    const calendarVisible =
        !previewing &&
        !merged &&
        (placement === 'split' ? options.showCalendar : drawerOpen);
    const calendarWidth = clampCalendarWidth(storedWidth, panesWidth, minBoard);
    const calendarMax = calendarMaxWidth(panesWidth, minBoard);

    // Loaded in both layouts: the Days strip shows the horizons' counts.
    const horizon = useHorizonTasks(true);
    const firstDayOfWeek = horizon.firstDayOfWeek;
    const dates = useMemo(
        () =>
            horizonsMode
                ? weekDates(today, firstDayOfWeek)
                : boardDates(anchor),
        [anchor, horizonsMode, today, firstDayOfWeek]
    );
    const calendarDates = useMemo(
        () => (calendarVisible ? columnDates(calendarDate, span) : []),
        [calendarDate, span, calendarVisible]
    );
    // Today always: its answer holds the overdue tasks.
    const fetchDates = useMemo(
        () => [...new Set([...dates, ...calendarDates, today])],
        [dates, calendarDates, today]
    );
    const {
        days,
        daysRef,
        error,
        mutate,
        reload: reloadDays,
    } = useDays(fetchDates);
    useEffect(() => {
        setPlannedSoon(
            Object.entries(days)
                .filter(([date]) => date >= today)
                .flatMap(([, day]) =>
                    (day.plan?.items ?? []).map((item) => item.task_uid)
                )
                .sort()
                .join(',')
        );
    }, [days, today]);
    const shownDays = useMemo(
        () =>
            Object.fromEntries(
                Object.entries(days).map(([date, day]) => [
                    date,
                    filterDay(day, options.filters),
                ])
            ),
        [days, options.filters]
    );
    // Merged (or a previewed week): the events of every day on the board.
    const eventDates = useMemo(
        () => (merged || previewing ? dates : calendarDates),
        [merged, previewing, dates, calendarDates]
    );
    const events = useCalendarEvents(
        eventDates,
        calendarEnabled,
        eventsVersion
    );
    const buckets = useMemo(
        () =>
            horizon.tasks
                ? bucketHorizons(
                      filterTasks(horizon.tasks, options.filters),
                      today,
                      firstDayOfWeek,
                      shownDays
                  )
                : null,
        [horizon.tasks, today, firstDayOfWeek, options.filters, shownDays]
    );
    // The left column's horizons (Days layout): a task already shown on a
    // day of the board (planned there, or due there) is not listed again.
    const leftHorizons = useMemo(() => {
        if (!buckets) return null;
        const onBoard = new Set<string>();
        Object.entries(shownDays).forEach(([date, day]) => {
            if (date < today) return;
            (day.plan?.items ?? []).forEach((item) =>
                onBoard.add(item.task_uid)
            );
            (day.due ?? []).forEach(
                (task) => task.uid && onBoard.add(task.uid)
            );
        });
        return Object.fromEntries(
            HORIZON_KEYS.map((key) => [
                key,
                buckets[key].filter((task) => !onBoard.has(task.uid as string)),
            ])
        ) as HorizonBuckets;
    }, [buckets, shownDays, today]);
    const bucketsRef = useRef(buckets);
    bucketsRef.current = buckets;
    // « À planifier » under the inbox, in the Days layout only.
    const toPlanBox = useMemo(
        () =>
            horizon.tasks && !horizonsMode
                ? toPlan(
                      filterTasks(horizon.tasks, options.filters),
                      today,
                      firstDayOfWeek,
                      shownDays
                  )
                : null,
        [
            horizon.tasks,
            horizonsMode,
            today,
            firstDayOfWeek,
            options.filters,
            shownDays,
        ]
    );
    const toPlanTasksRef = useRef<Task[]>([]);
    toPlanTasksRef.current = toPlanBox
        ? [...toPlanBox.replan, ...toPlanBox.week, ...toPlanBox.month]
        : [];
    useEffect(() => {
        setToPlanTotal(toPlanCount(toPlanBox));
    }, [toPlanBox]);
    const overdue = horizonsMode ? [] : (shownDays[today]?.overdue ?? []);

    useInboxPolling();

    // Navigation lands on a day: scroll its column to the strip's start.
    useEffect(() => {
        if (!scrollTo) return;
        boardRef.current
            ?.querySelector<HTMLElement>(
                `[data-testid="upcoming-column"][data-date="${scrollTo.date}"]`
            )
            ?.scrollIntoView?.({
                behavior: 'smooth',
                inline: 'start',
                block: 'nearest',
            });
    }, [scrollTo, dates]);

    // A card moved by a shortcut keeps the keyboard focus on its new day.
    useEffect(() => {
        if (!pendingFocus) return;
        const el = boardRef.current?.querySelector<HTMLElement>(
            `[data-date="${pendingFocus.date}"] ${CARD}[data-uid="${pendingFocus.uid}"]`
        );
        if (el) {
            el.focus();
            setPendingFocus(null);
        }
    }, [pendingFocus, days]);

    // The task lists beside the days: the horizons and the inbox's tasks.
    const reloadHorizonTasks = horizon.reload;
    const reloadUnsorted = unsorted.reload;
    const reloadHorizons = useCallback(
        () => Promise.all([reloadHorizonTasks(), reloadUnsorted()]),
        [reloadHorizonTasks, reloadUnsorted]
    );
    // Tasks pushed back again and again (the review's list): a badge on
    // their cards, a section on the left.
    const [pushed, setPushed] = useState<PushedItem[]>([]);
    const reloadPushed = useCallback(
        () =>
            fetchReviewCategory<PushedItem>('pushed', 0, 50)
                .then((page) => setPushed(page.items ?? []))
                .catch(() => undefined),
        []
    );
    useEffect(() => {
        void reloadPushed();
    }, [reloadPushed]);
    const pushedCounts = useMemo(
        () =>
            new Map(
                pushed.map((item) => [
                    item.task.uid as string,
                    item.push.recent_count,
                ])
            ),
        [pushed]
    );
    const reload = useCallback(
        async (only?: string[]) => {
            await Promise.all([
                reloadDays(only),
                reloadHorizonTasks(),
                reloadUnsorted(),
                reloadPushed(),
            ]);
        },
        [reloadDays, reloadHorizonTasks, reloadUnsorted, reloadPushed]
    );
    // A proposal applied elsewhere moves tasks across the plan.
    useProposalChanged(() => void reload());

    const decidePushed = async (uid: string, decision: TaskDecision) => {
        try {
            await decideTask(uid, { ...decision, reviewed: true });
            await reload();
        } catch (err) {
            fail(err);
        }
    };

    const fail = useCallback(
        (err: unknown, dates?: string[]) => {
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
            return reload(dates);
        },
        [reload, showErrorToast, t]
    );

    // Plan writes run one after another: each is sent once the one before
    // it is answered and its days reloaded, so it carries their fresh etags.
    // A failure drops the writes queued behind it (they were made on a view
    // that turned out wrong); the reload shows the server's plan.
    const queueRef = useRef<Promise<unknown>>(Promise.resolve());
    const epochRef = useRef(0);
    const openTaskRef = useRef(openTaskUid);
    openTaskRef.current = openTaskUid;
    const orderRef = useRef<string[]>([]);

    /**
     * Sends `writes` (already shown) in order, then refreshes the days they
     * touched and `refresh`. Resolves to the etags of the written days once
     * reloaded, or null on a failure (toast, reload).
     */
    const send = useCallback(
        async (
            writes: PlanWrite[],
            refresh: string[],
            newTasks: Task[],
            epoch: number
        ): Promise<Record<string, string | undefined> | null> => {
            if (epoch !== epochRef.current) {
                await reload(refresh);
                return null;
            }
            // Again on the days as reloaded by the writes before this one.
            const current = daysRef.current;
            const local = applyWritesLocally(current, writes, today, newTasks);
            const changed = Object.keys(local).filter(
                (date) => local[date] !== current[date]
            );
            mutate(changed, (now) => ({
                ...now,
                ...Object.fromEntries(
                    changed.map((date) => [date, local[date]])
                ),
            }));
            try {
                for (const write of writes) {
                    const written = await applyPlanOps(
                        write.date,
                        write.ops,
                        daysRef.current[write.date]?.etag
                    );
                    mutate([], (now) =>
                        now[write.date]
                            ? {
                                  ...now,
                                  [write.date]: {
                                      ...now[write.date],
                                      etag: written.etag,
                                  },
                              }
                            : now
                    );
                }
            } catch (err) {
                epochRef.current += 1;
                await fail(err, refresh);
                return null;
            }
            await reload(refresh);
            // The open sheet says where its task is planned: keep it true.
            const open = openTaskRef.current;
            if (
                open &&
                writes.some((write) =>
                    write.ops.some((op) => op.task_uid === open)
                )
            ) {
                const line = plannedLine(
                    daysRef.current,
                    open,
                    orderRef.current
                );
                openTask(
                    open,
                    line
                        ? {
                              date: line.date,
                              ...(line.start !== null
                                  ? { startMinute: line.start }
                                  : {}),
                          }
                        : undefined
                );
            }
            return Object.fromEntries(
                touchedDates(writes).map((date) => [
                    date,
                    daysRef.current[date]?.etag,
                ])
            );
        },
        [daysRef, fail, mutate, openTask, reload, today]
    );

    /**
     * Shows the writes at once and queues them (`send`); `alsoReload` adds
     * days to refresh (a due-only card's due day). The undo toast queues the
     * writes that take back these lines only, so later changes stay; when
     * they cannot be worked out, the earlier plans are put back, refused
     * (409) if the day changed since.
     */
    const commit = useCallback(
        (
            writes: PlanWrite[],
            message?: string,
            alsoReload: string[] = [],
            newTasks: Task[] = []
        ): Promise<boolean> => {
            if (writes.length === 0) return Promise.resolve(true);
            const before = daysRef.current;
            const local = applyWritesLocally(before, writes, today, newTasks);
            const changed = Object.keys(local).filter(
                (date) => local[date] !== before[date]
            );
            mutate(changed, (current) => ({
                ...current,
                ...Object.fromEntries(
                    changed.map((date) => [date, local[date]])
                ),
            }));
            const refresh = [
                ...new Set([
                    ...touchedDates(writes),
                    ...changed,
                    ...alsoReload,
                ]),
            ];
            const undo = message ? inverseWrites(before, writes, today) : null;
            const epoch = epochRef.current;
            const run = queueRef.current.then(() =>
                send(writes, refresh, newTasks, epoch)
            );
            queueRef.current = run.catch(() => undefined);
            return run.then((etags) => {
                if (!etags) return false;
                if (!message) return true;
                showUndoToast(message, () => {
                    if (undo) {
                        void commit(
                            withoutMissingAnchors(daysRef.current, undo),
                            undefined,
                            refresh
                        );
                        return;
                    }
                    const restore = queueRef.current.then(() =>
                        Promise.all(
                            Object.entries(etags)
                                .filter(([date]) => before[date])
                                .map(([date, etag]) =>
                                    restorePlan(
                                        date,
                                        toPlanInput(
                                            before[date].plan?.items ?? []
                                        ),
                                        etag
                                    )
                                )
                        )
                            .then(() => reload(refresh))
                            .catch((err) => fail(err, refresh))
                    );
                    queueRef.current = restore.catch(() => undefined);
                });
                return true;
            });
        },
        [daysRef, fail, mutate, reload, send, showUndoToast, today]
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
                    await commit(
                        [
                            {
                                date: target.date,
                                ops: [{ op: 'add', task_uid: task.uid }],
                            },
                        ],
                        undefined,
                        [],
                        [task]
                    );
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
        [commit, fail, reloadHorizons]
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

    const parseLine = useCallback(
        (text: string) =>
            parseQuickAdd(text, {
                // Today in the user's timezone, not the browser's.
                now: parseISO(today),
                locale,
                projects: projects
                    .filter((project) => project.id !== undefined)
                    .map((project) => ({
                        id: project.id as number,
                        name: project.name,
                    })),
            }),
        [locale, projects, today]
    );

    // The task a typed line describes: its project, tags, priority and
    // duration, never a due date.
    const createFromLine = useCallback(
        (parsed: ReturnType<typeof parseQuickAdd>) =>
            createTask({
                name: parsed.name.trim(),
                status: TASK_STATUS.NOT_STARTED,
                completed_at: null,
                ...(parsed.projectId !== undefined
                    ? { project_id: parsed.projectId }
                    : {}),
                ...(parsed.tags.length > 0
                    ? { tags: parsed.tags.map((tag) => ({ name: tag })) }
                    : {}),
                ...(parsed.priority ? { priority: parsed.priority } : {}),
                ...(parsed.durationMinutes
                    ? { estimated_minutes: parsed.durationMinutes }
                    : {}),
            } as unknown as Task),
        []
    );

    /**
     * "+ Add a task" of a day: the typed line is read for a date, a time, a
     * duration, a project, tags and a priority (never a due date). The task
     * is planned on the date it names, else on the column's day, slotted at
     * the time it names.
     */
    const addTask = useCallback(
        async (date: string, text: string) => {
            const parsed = parseLine(text);
            if (!parsed.name.trim()) {
                showErrorToast(
                    t('upcoming.addEmptyName', 'Add a name for the task')
                );
                return false;
            }
            const on = parsed.date ?? date;
            try {
                const task = await createFromLine(parsed);
                if (!task.uid) return false;
                const op: PlanOp = {
                    op: 'add',
                    task_uid: task.uid,
                    ...(parsed.startMinute !== undefined
                        ? { start_minute: parsed.startMinute }
                        : {}),
                    ...(parsed.durationMinutes
                        ? { duration_minutes: parsed.durationMinutes }
                        : {}),
                };
                return await commit(
                    [{ date: on, ops: [op] }],
                    undefined,
                    [],
                    [task]
                );
            } catch (err) {
                void fail(err, [on]);
                return false;
            }
        },
        [commit, createFromLine, fail, parseLine, showErrorToast, t]
    );

    /**
     * The + of the inbox column: a task, read like a day's line. A date (or
     * a time, today) plans it on that day; without one it waits unsorted in
     * the inbox (« Tâches à classer »), even when filed in a project.
     */
    const addToInbox = useCallback(
        async (text: string) => {
            const parsed = parseLine(text);
            // The column keeps the text and says it could not add it.
            if (!parsed.name.trim()) return false;
            const on =
                parsed.date ??
                (parsed.startMinute !== undefined ? today : undefined);
            if (on) return addTask(on, text);
            try {
                const task = await createFromLine(parsed);
                if (!task.uid) return false;
                // Filed, it would leave « Tâches à classer » without its moment.
                if (parsed.projectId !== undefined) {
                    await updateTask(task.uid, {
                        needs_when: true,
                    } as Partial<Task>);
                }
                await reloadUnsorted();
                return true;
            } catch {
                return false;
            }
        },
        [addTask, createFromLine, parseLine, reloadUnsorted, today]
    );

    // "+ Add a task" of a horizon: created, then committed to it.
    const addToHorizon = useCallback(
        async (key: HorizonKey, name: string) => {
            try {
                const task = await createTask({
                    name,
                    status: TASK_STATUS.NOT_STARTED,
                    completed_at: null,
                } as unknown as Task);
                const patch = horizonPatch(null, key);
                if (task.uid && patch) {
                    await updateTask(task.uid, patch as Partial<Task>);
                }
                await reloadHorizons();
            } catch (err) {
                fail(err);
            }
        },
        [fail, reloadHorizons]
    );

    // Days that show a task, and today for its overdue list.
    const daysOf = useCallback(
        (uid: string) => [...datesHolding(daysRef.current, uid), today],
        [daysRef, today]
    );

    const toggle = useCallback(
        async (line: DayLine) => {
            if (draggingRef.current) return;
            // A recurring task done for this day has moved on to its next date.
            if (line.done && !isTaskDone(line.task.status)) return;
            const uid = line.task.uid as string;
            const wasDone = isTaskDone(line.task.status);
            const dates = daysOf(uid);
            try {
                const saved = await toggleTaskCompletion(uid, line.task);
                await reload(dates);
                if (!wasDone) {
                    showUndoToast(
                        t('upcoming.completed', '“{{name}}” done', {
                            name: line.task.name,
                        }),
                        () => {
                            toggleTaskCompletion(uid, saved)
                                .then(() => reload(dates))
                                .catch((err) => fail(err, dates));
                        }
                    );
                }
            } catch (err) {
                fail(err, dates);
            }
        },
        [daysOf, fail, reload, showUndoToast, t]
    );

    const toggleSubtask = useCallback(
        (subtask: Task) => {
            if (!subtask.uid) return;
            const dates = daysOf(subtask.uid);
            toggleTaskCompletion(subtask.uid, subtask)
                .then(() => reload(dates))
                .catch((err) => fail(err, dates));
        },
        [daysOf, fail, reload]
    );

    // Where the sheet looks for the day a task is planned on.
    orderRef.current = [...calendarDates, ...dates];
    const plannedDateOf = (uid: string, hint?: string): string | null =>
        plannedLine(daysRef.current, uid, [
            ...(hint ? [hint] : []),
            ...orderRef.current,
        ])?.date ?? null;

    /**
     * The card as a write starts from. A horizon card may be planned on a
     * day too (from today on, among the loaded days): it starts from there,
     * so it is moved rather than planned twice. A planned card carries its
     * slot, kept on its new day.
     */
    const sourceOf = (uid: string, date: string, planned: boolean) => {
        const fromHorizon = horizonFromCardDate(date) !== null;
        const order = fromHorizon
            ? Object.keys(daysRef.current)
                  .filter((day) => day >= today)
                  .sort()
            : planned
              ? [date]
              : [];
        const line = plannedLine(daysRef.current, uid, order);
        return {
            uid,
            date: line?.date ?? date,
            planned: !!line,
            duration: line?.duration,
            slot:
                line && line.start !== null
                    ? { start: line.start, duration: line.duration }
                    : null,
        };
    };

    // Opens the sheet; a planned card passes its day and slot to it.
    const openLine = (line: DayLine, date?: string) => {
        if (draggingRef.current) return;
        if (openTaskUid === line.uid) {
            closeTask();
            return;
        }
        const on = line.planned ? plannedDateOf(line.uid, date) : null;
        openTask(
            line.uid,
            on
                ? {
                      date: on,
                      ...(line.start !== null
                          ? { startMinute: line.start }
                          : {}),
                  }
                : undefined
        );
    };

    // A day picked on the board (its header, a card): the calendar follows.
    const selectDay = (date: string) => {
        setSelected(date);
        setCalendarDate((current) => calendarStart(current, date, span));
    };

    // Board navigation: the strip moves, the calendar starts on the day.
    const goTo = (date: string, nextAnchor: string) => {
        setAnchor(nextAnchor);
        setSelected(date);
        setCalendarDate(date);
        setScrollTo({ date });
    };

    const calendarColumns = calendarDates.map((date) => {
        const day = shownDays[date];
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
        if (!grid || data.kind === 'inbox' || data.kind === 'preview') {
            return null;
        }
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
        if (data.kind === 'inbox' || data.kind === 'preview') {
            return data.title;
        }
        if (data.date === TO_PLAN_CARD_DATE) {
            return (
                toPlanTasksRef.current.find((task) => task.uid === data.uid)
                    ?.name ?? ''
            );
        }
        if (data.date === INBOX_CARD_DATE) {
            return (
                inboxTasksRef.current.find((task) => task.uid === data.uid)
                    ?.name ?? ''
            );
        }
        const key = horizonFromCardDate(data.date);
        if (key) {
            return (
                bucketsRef.current?.[key].find((task) => task.uid === data.uid)
                    ?.name ?? ''
            );
        }
        const day = daysRef.current[data.date === OVERDUE ? today : data.date];
        return (day ? tasksOf(day).get(data.uid)?.name : undefined) ?? '';
    };

    const longDay = (date: string) =>
        new Intl.DateTimeFormat(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        }).format(parseISO(date));

    const horizonTitles: Record<HorizonKey, string> = {
        week: t('upcoming.thisWeek', 'This week'),
        next_week: t('upcoming.horizonNextWeek', 'Next week'),
        this_month: t('upcoming.thisMonth', 'This month'),
        next_month: t('upcoming.nextMonth', 'Next month'),
        someday: t('upcoming.someday', 'Someday'),
    };
    // Opened on another week: the board moves to the proposed period, so
    // every change shows before it is applied.
    const previewStart = previewing ? preview.facts?.period.start : undefined;
    useEffect(() => {
        if (!previewStart) return;
        setAnchor(previewStart);
        setSelected(previewStart);
        // Only when a proposal starts showing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previewStart]);
    const aiTabUid = !weekProposal.agent
        ? null
        : (proposalUid ??
          (weekProposal.status === 'ready' ? weekProposal.uid : null));
    const [previewHover, setPreviewHover] = useState<string | null>(null);
    const closePreview = () => setProposalParam(navigate, location, null);
    const placeLabel = (place: PreviewPlace): string => {
        switch (place.kind) {
            case 'day':
                return place.date === today
                    ? t('upcoming.overdueToday', 'Today')
                    : place.date === tomorrow
                      ? t('upcoming.overdueTomorrow', 'Tomorrow')
                      : new Intl.DateTimeFormat(locale, {
                            weekday: 'short',
                            day: 'numeric',
                        }).format(parseISO(place.date));
            case 'horizon':
                return horizonTitles[place.key];
            case 'inbox':
                return t('sidebar.inbox', 'Inbox');
            case 'overdue':
                return t('upcoming.overdue', 'Overdue');
            case 'done':
                return t('proposals.ops.done', 'Faite');
            case 'drop':
                return t('proposals.ops.drop', 'Abandonner');
            default:
                return t('upcoming.preview.nowhere', 'not planned');
        }
    };
    const previewCtx: WeekPreviewContextValue | null = previewOpen
        ? {
              state: preview,
              hover: previewHover,
              setHover: setPreviewHover,
              placeLabel,
              openTask: (uid: string) => openTask(uid),
          }
        : null;
    const applyPreview = async () => {
        try {
            const outcome = await preview.apply();
            if (!outcome || outcome.kind !== 'applied') return;
            closePreview();
            void reloadHorizonTasks();
            if (outcome.failed > 0) {
                showErrorToast(
                    t(
                        'upcoming.preview.partly',
                        'Not applied: {{failed}}. Check those tasks.',
                        { failed: outcome.failed }
                    )
                );
            } else {
                showSuccessToast(
                    t('upcoming.preview.applied', 'Your week is planned')
                );
            }
        } catch {
            showErrorToast(
                t(
                    'proposals.apply.error',
                    'Les changements n’ont pas pu être appliqués.'
                )
            );
        }
    };
    const ignorePreview = async () => {
        try {
            await preview.dismiss();
            closePreview();
        } catch {
            showErrorToast(
                t(
                    'proposals.dismiss.error',
                    'Impossible d’ignorer la proposition.'
                )
            );
        }
    };
    const retryPreview = async () => {
        try {
            const started = await preview.retry();
            setProposalParam(navigate, location, started.uid);
        } catch {
            showErrorToast(
                t('proposals.startError', 'Impossible de lancer la demande.')
            );
        }
    };

    const horizonHints: Record<HorizonKey, string> = {
        week: t(
            'upcoming.thisWeekHint',
            'Committed to this week, no fixed day'
        ),
        next_week: t(
            'upcoming.nextWeekHint',
            'Committed to next week, no fixed day'
        ),
        this_month: t(
            'upcoming.thisMonthHint',
            'Sometime this month, no fixed day'
        ),
        next_month: t('upcoming.nextMonthHint', 'Lined up for next month'),
        someday: t('upcoming.somedayHint', 'Maybe later, out of the way'),
    };

    /**
     * A card of the Days layout sent to a horizon (strip, Shift+W/M, its
     * menu): its line leaves the day plan through the write queue, the task
     * is committed to the horizon (due date untouched), one undo takes both
     * back.
     */
    // Sends a card to a horizon and returns its undo; `announce` false
    // leaves the toast to the caller (a selection sent at once).
    const sendToHorizon = async (
        card: CardData,
        to: HorizonKey,
        announce = true
    ): Promise<(() => void) | null> => {
        if (card.date === TO_PLAN_CARD_DATE) {
            await commitToPlanCard(card.uid, to);
            return null;
        }
        const current = bucketsRef.current;
        const from = current ? horizonOf(current, card.uid) : null;
        const patch = horizonPatch(from, to);
        const writes = leaveDayWrites(card);
        if (!patch && writes.length === 0) return null;
        const undoWrites =
            writes.length > 0
                ? inverseWrites(daysRef.current, writes, today)
                : null;
        try {
            if (patch) await updateTask(card.uid, patch as Partial<Task>);
        } catch (err) {
            fail(err);
            return null;
        }
        const left = await commit(writes, undefined, sourceDays(card));
        await reloadHorizons();
        if (!left) return null;
        const back = from
            ? horizonPatch(to, from)
            : {
                  week_of: null,
                  month_of: null,
                  ...(to === 'someday' ? { later: false } : {}),
              };
        const undo = () => {
            if (undoWrites) {
                void commit(
                    withoutMissingAnchors(daysRef.current, undoWrites),
                    undefined,
                    sourceDays(card)
                );
            }
            if (patch && back) {
                updateTask(card.uid, back as Partial<Task>)
                    .then(() => reloadHorizons())
                    .catch(fail);
            }
        };
        if (announce) {
            showUndoToast(
                t('upcoming.sentToHorizon', 'Sent to {{name}}', {
                    name: horizonTitles[to],
                }),
                undo
            );
        }
        return undo;
    };

    /**
     * A card of « À planifier » committed to a horizon, or (null) its week
     * and month taken off. Undo writes back the week and month it held,
     * passed ones included, so a task to replan returns there.
     */
    const commitToPlanCard = async (uid: string, to: HorizonKey | null) => {
        const task = toPlanTasksRef.current.find((item) => item.uid === uid);
        const box = toPlanBox;
        if (!task || !box) return;
        const from: HorizonKey | null = box.week.includes(task)
            ? 'week'
            : box.month.includes(task)
              ? 'this_month'
              : null;
        const patch = to
            ? horizonPatch(from, to)
            : { week_of: null, month_of: null };
        if (!patch) return;
        const held = task as Task & { month_of?: string | null };
        const before = {
            week_of: held.week_of ? String(held.week_of).slice(0, 10) : null,
            month_of: held.month_of ? String(held.month_of).slice(0, 10) : null,
            ...(to === 'someday' ? { later: false } : {}),
        };
        try {
            await updateTask(uid, patch as Partial<Task>);
            await reloadHorizons();
        } catch (err) {
            fail(err);
            return;
        }
        showUndoToast(
            to
                ? t('upcoming.sentToHorizon', 'Sent to {{name}}', {
                      name: horizonTitles[to],
                  })
                : t('upcoming.commitmentRemoved', 'Commitment removed'),
            () => {
                updateTask(uid, before as Partial<Task>)
                    .then(() => reloadHorizons())
                    .catch(fail);
            }
        );
    };

    // The card menu of the Days layout (right click, or a long press that
    // does not start a drag): send the card to a horizon.
    const [cardMenu, setCardMenu] = useState<{
        card: CardData;
        x: number;
        y: number;
    } | null>(null);
    useEffect(() => {
        if (!cardMenu) return;
        document.querySelector<HTMLElement>('[data-card-menu-anchor]')?.click();
    }, [cardMenu]);
    const cardMenuEntries: MenuEntry[] = !cardMenu
        ? []
        : cardMenu.card.date === TO_PLAN_CARD_DATE
          ? [
                { heading: t('upcoming.commitTo', 'Commit to') },
                ...HORIZON_KEYS.map((key) => ({
                    key,
                    label: horizonTitles[key],
                    testId: `card-commit-${key}`,
                    onSelect: () =>
                        void commitToPlanCard(cardMenu.card.uid, key),
                })),
                {
                    key: 'uncommit',
                    label: t(
                        'upcoming.removeCommitment',
                        'Remove the commitment'
                    ),
                    testId: 'card-commit-none',
                    onSelect: () =>
                        void commitToPlanCard(cardMenu.card.uid, null),
                },
            ]
          : [
                { heading: t('upcoming.stripLabel', 'Send to a horizon') },
                ...STRIP_KEYS.map((key) => ({
                    key,
                    label: horizonTitles[key],
                    hint:
                        key === 'next_week'
                            ? '⇧W'
                            : key === 'this_month'
                              ? '⇧M'
                              : undefined,
                    testId: `card-send-${key}`,
                    onSelect: () => void sendToHorizon(cardMenu.card, key),
                })),
            ];

    // Where a drop target is, in words, for screen readers.
    const placeOf = (over: OverData | undefined): string | null => {
        if (!over) return null;
        if (over.kind === 'horizon') return horizonTitles[over.key];
        if (over.kind === 'grid') {
            return t('upcoming.calendarOn', 'the calendar, {{day}}', {
                day: longDay(over.date),
            });
        }
        if (over.date === OVERDUE) return t('upcoming.overdue', 'Overdue');
        // An inbox card takes no drop: the card is over no day.
        if (over.date === INBOX_CARD_DATE) return null;
        if (over.date === TO_PLAN_CARD_DATE) return null;
        const key = horizonFromCardDate(over.date);
        return key ? horizonTitles[key] : longDay(over.date);
    };

    const announcements: Announcements = {
        onDragStart: ({ active }) =>
            t('upcoming.a11yPicked', '“{{name}}” picked up', {
                name: nameOf(active.data.current as DragData),
            }),
        onDragOver: ({ active, over }) => {
            const name = nameOf(active.data.current as DragData);
            const place = placeOf(over?.data.current as OverData | undefined);
            return place
                ? t('upcoming.a11yOver', '“{{name}}” moved over {{day}}', {
                      name,
                      day: place,
                  })
                : t(
                      'upcoming.a11yOverNothing',
                      '“{{name}}” is no longer over a day',
                      { name }
                  );
        },
        onDragEnd: ({ active, over }) => {
            const name = nameOf(active.data.current as DragData);
            const place = placeOf(over?.data.current as OverData | undefined);
            return place
                ? t('upcoming.a11yDropped', '“{{name}}” dropped on {{day}}', {
                      name,
                      day: place,
                  })
                : t('upcoming.a11yReturned', '“{{name}}” put back', { name });
        },
        onDragCancel: ({ active }) =>
            t('upcoming.a11yCancelled', 'Move of “{{name}}” cancelled', {
                name: nameOf(active.data.current as DragData),
            }),
    };

    const onDragStart = (event: DragStartEvent) => {
        const data = event.active.data.current as DragData | undefined;
        draggingRef.current = true;
        if (data) setDragging({ data, title: nameOf(data) });
    };

    const endDrag = () => {
        // The key that ends a keyboard drag also reaches the card (Enter
        // opens it): keep the guard until that event is over.
        window.setTimeout(() => {
            draggingRef.current = false;
        }, 0);
        setDragging(null);
        setGhost(null);
    };

    const onDragMove = (event: DragMoveEvent) => {
        const data = event.active.data.current as DragData | undefined;
        const over = event.over?.data.current as OverData | undefined;
        if (
            !data ||
            data.kind === 'inbox' ||
            data.kind === 'preview' ||
            over?.kind !== 'grid'
        ) {
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
                      uid: data.uid,
                  }
        );
    };

    const dropWrites = (
        event: DragEndEvent,
        data: Exclude<DragData, InboxDragData | PreviewDragData>,
        over: Exclude<OverData, HorizonDropData>
    ): { writes: PlanWrite[]; message?: string } => {
        // The overdue strip takes nothing: overdue is a due date, not a plan.
        // Nor does the inbox: a plan line is taken back by undo, not a drop.
        if (
            over.kind !== 'grid' &&
            (over.date === OVERDUE ||
                over.date === INBOX_CARD_DATE ||
                over.date === TO_PLAN_CARD_DATE)
        )
            return { writes: [] };
        const fromHorizon = horizonFromCardDate(data.date) !== null;
        // An overdue card sits on no day's plan.
        const from = sourceOf(
            data.uid,
            data.date,
            data.date !== OVERDUE &&
                (data.kind === 'card' ? data.planned : data.kind === 'block')
        );
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
                    { ...from, duration: from.duration ?? data.duration },
                    { date: over.date, start }
                ),
                message: t('upcoming.planned', 'Time planned'),
            };
        }
        if (fromHorizon && over.kind === 'card' && over.date === data.date) {
            return { writes: [] };
        }
        if (over.kind === 'column' || over.date !== data.date) {
            if (horizonFromCardDate(over.date)) return { writes: [] };
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

    // A due-only card leaves its due day once planned: refresh that day too.
    const sourceDays = (
        data: Exclude<DragData, InboxDragData | PreviewDragData>
    ): string[] =>
        data.date === OVERDUE
            ? [today]
            : horizonFromCardDate(data.date) ||
                data.date === INBOX_CARD_DATE ||
                data.date === TO_PLAN_CARD_DATE
              ? []
              : [data.date];

    // An inbox task is on no loaded day yet: the local plan needs it.
    const inboxTaskOf = (
        data: Exclude<DragData, InboxDragData | PreviewDragData>
    ): Task[] =>
        data.date === INBOX_CARD_DATE
            ? inboxTasksRef.current.filter((task) => task.uid === data.uid)
            : data.date === TO_PLAN_CARD_DATE
              ? toPlanTasksRef.current.filter((task) => task.uid === data.uid)
              : horizonFromCardDate(data.date)
                ? (bucketsRef.current?.[
                      horizonFromCardDate(data.date) as HorizonKey
                  ].filter((task) => task.uid === data.uid) ?? [])
                : [];

    const onDragEnd = (event: DragEndEvent) => {
        endDrag();
        const data = event.active.data.current as DragData | undefined;
        const over = event.over?.data.current as OverData | undefined;
        if (!data || !over) return;
        const toHorizon = horizonTarget(over);
        // While previewing the AI's week, moving one of its tasks changes the
        // proposal only; nothing is written before « Apply ».
        const previewUid =
            data.kind === 'preview'
                ? data.uid
                : data.kind === 'card' &&
                    previewing &&
                    preview.decidable(data.uid)
                  ? data.uid
                  : null;
        if (previewUid) {
            const place: PreviewPlace | null = toHorizon
                ? { kind: 'horizon', key: toHorizon }
                : over.kind === 'column' ||
                    (over.kind === 'card' && /^\d{4}-/.test(over.date))
                  ? { kind: 'day', date: over.date }
                  : null;
            const decision = place && decisionOfPlace(place);
            if (decision) preview.decide(previewUid, decision);
            return;
        }
        if (data.kind === 'preview') return;
        if (data.kind === 'inbox') {
            if (toHorizon) void planInboxItem(data, { horizon: toHorizon });
            else if (over.kind === 'column')
                void planInboxItem(data, { date: over.date });
            return;
        }
        // A picked card carries the whole selection to a day or a horizon.
        if (data.kind === 'card' && inGroup(data.uid)) {
            if (toHorizon) {
                void sendPickedToHorizon(toHorizon);
                return;
            }
            if (over.kind === 'column') {
                planPickedOn(over.date);
                return;
            }
        }
        if (toHorizon) {
            if (data.kind !== 'card') return;
            // From one horizon to another: only the commitment changes.
            if (horizonsMode || horizonFromCardDate(data.date)) {
                void moveToHorizon(data.uid, toHorizon);
            } else void sendToHorizon(data, toHorizon);
            return;
        }
        if (over.kind === 'horizon') return;
        const { writes, message } = dropWrites(event, data, over);
        void commit(writes, message, sourceDays(data), inboxTaskOf(data));
    };

    // Keyboard drags start on M only: Enter opens a card, and Space must not
    // pick up a card by accident.
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 220, tolerance: 6 },
        }),
        useSensor(LetterKeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
            keyboardCodes: {
                start: [],
                cancel: ['Escape'],
                end: ['Enter', 'Space'],
            },
        })
    );

    // What a shortcut acts on: the card's day (or overdue, or a horizon) and
    // whether that day's plan holds it.
    const cardAt = (card: HTMLElement): CardData | null => {
        const uid = card.dataset.uid;
        const container = card.closest<HTMLElement>(CONTAINER);
        if (!uid || !container) return null;
        const own = card.closest<HTMLElement>('[data-card-date]');
        const date =
            own?.dataset.cardDate ??
            (container.dataset.testid === 'upcoming-overdue'
                ? OVERDUE
                : container.dataset.horizon
                  ? `horizon:${container.dataset.horizon}`
                  : container.dataset.date);
        if (!date) return null;
        const planned = !!daysRef.current[date]?.plan?.items.some(
            (item) => item.task_uid === uid
        );
        return {
            kind: 'card',
            uid,
            date,
            planned,
            timed: false,
            duration: 0,
        };
    };

    const planCardOn = (card: CardData, to: string) => {
        const writes = columnDropWrites(
            sourceOf(card.uid, card.date, card.planned),
            to
        );
        if (writes.length === 0) return;
        // Focus follows the card only to a column on screen.
        const focus = boardRef.current?.querySelector(
            `[data-testid="upcoming-column"][data-date="${to}"]`
        )
            ? { date: to, uid: card.uid }
            : null;
        if (focus) setPendingFocus(focus);
        void commit(
            writes,
            t('upcoming.moved', 'Task moved'),
            sourceDays(card),
            inboxTaskOf(card)
        ).finally(() => {
            if (focus) {
                setPendingFocus((current) =>
                    current === focus ? null : current
                );
            }
        });
    };

    // Cards picked with Ctrl, Cmd or Shift click (Days layout only): a drag,
    // a day shortcut or the selection bar moves them all at once.
    const [picked, setPicked] = useState<Map<string, CardData>>(
        () => new Map()
    );
    const togglePicked = useCallback((card: CardData) => {
        setPicked((current) => {
            const next = new Map(current);
            if (next.has(card.uid)) next.delete(card.uid);
            else next.set(card.uid, card);
            return next;
        });
    }, []);
    const clearPicked = useCallback(() => setPicked(new Map()), []);
    const pickedCards = useMemo(
        () => (horizonsMode ? null : { picked, toggle: togglePicked }),
        [horizonsMode, picked, togglePicked]
    );
    useEffect(clearPicked, [horizonsMode, clearPicked]);
    useEffect(() => {
        if (picked.size === 0) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') clearPicked();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [picked.size, clearPicked]);
    const inGroup = (uid: string) => picked.size > 1 && picked.has(uid);

    // Every picked card on `to`, as one write per day touched.
    const planPickedOn = (to: string) => {
        const cards = [...picked.values()];
        const ops = new Map<string, PlanOp[]>();
        cards.forEach((card) => {
            const planned = !!daysRef.current[card.date]?.plan?.items.some(
                (item) => item.task_uid === card.uid
            );
            columnDropWrites(
                sourceOf(card.uid, card.date, planned),
                to
            ).forEach((write) =>
                ops.set(write.date, [
                    ...(ops.get(write.date) ?? []),
                    ...write.ops,
                ])
            );
        });
        const writes: PlanWrite[] = [...ops].map(([date, dayOps]) => ({
            date,
            ops: dayOps,
        }));
        clearPicked();
        void commit(
            writes,
            t('upcoming.pickedMoved', 'Selected tasks moved'),
            [...new Set(cards.flatMap(sourceDays))],
            cards.flatMap(inboxTaskOf)
        );
    };

    // Every picked card sent to a horizon, one Undo for all.
    const sendPickedToHorizon = async (to: HorizonKey) => {
        const cards = [...picked.values()];
        clearPicked();
        const undos: Array<() => void> = [];
        for (const card of cards) {
            const undo = await sendToHorizon(card, to, false);
            if (undo) undos.push(undo);
        }
        if (undos.length === 0) return;
        showUndoToast(
            t('upcoming.sentToHorizon', 'Sent to {{name}}', {
                name: horizonTitles[to],
            }),
            () => undos.forEach((undo) => undo())
        );
    };

    // The first day of the board with room for a task (all plan lines
    // count, whatever the filters); a « Next week » task from its first day.
    const nextWeekStart = format(
        addDays(parseISO(weekStartOf(today, firstDayOfWeek)), 7),
        'yyyy-MM-dd'
    );
    const quickPlace: QuickPlace | null = horizonsMode
        ? null
        : {
              suggest: (minutes, place) =>
                  firstFreeDay(
                      minutes,
                      dates
                          .filter(
                              (date) =>
                                  place !== 'horizon:next_week' ||
                                  date >= nextWeekStart
                          )
                          .map((date) => {
                              const day = days[date];
                              const lines = day
                                  ? dayLines(
                                        day.plan?.items ?? [],
                                        day.due,
                                        date
                                    )
                                  : null;
                              const hours = day?.day_hours;
                              return {
                                  date,
                                  load: lines
                                      ? dayLoad([
                                            ...lines.timed,
                                            ...lines.anytime,
                                        ])
                                      : 0,
                                  capacity: hours
                                      ? hours.end - hours.start
                                      : DEFAULT_DAY_MINUTES,
                              };
                          }),
                      {
                          today,
                          nowMinute: clock,
                          dayEnd: days[today]?.day_hours?.end ?? 1080,
                      }
                  ),
              label: (date) =>
                  date === today
                      ? t('upcoming.overdueToday', 'Today')
                      : date === tomorrow
                        ? t('upcoming.overdueTomorrow', 'Tomorrow')
                        : new Intl.DateTimeFormat(locale, {
                              weekday: 'short',
                              day: 'numeric',
                          }).format(parseISO(date)),
              place: (card, date) => planCardOn(card, date),
          };

    /**
     * Board shortcuts on a focused card: arrows or h j k l move the focus
     * (between cards, between days), Shift with left/right (or H, L) moves
     * the card a day, t plans it today, Shift+T tomorrow. Enter (open) and
     * the checkbox stay with the card; M picks it up for a keyboard drag.
     */
    const onBoardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (draggingRef.current) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const target = event.target as HTMLElement;
        if (!target.matches?.(CARD)) return;
        const card = cardAt(target);
        const container = target.closest<HTMLElement>(CONTAINER);
        if (!card || !container) return;
        const focusIn = (el: Element | null | undefined) => {
            if (!el) return false;
            (el as HTMLElement).focus();
            return true;
        };
        const cards = Array.from(container.querySelectorAll(CARD));
        const index = cards.indexOf(target);
        const key = event.key;
        let handled = false;
        const vertical = (step: number) => focusIn(cards[index + step]);
        const sideways = (step: number) => {
            const columns = Array.from(
                boardRef.current?.querySelectorAll(COLUMN) ?? []
            );
            const next = columns[columns.indexOf(container) + step];
            if (!next) return false;
            const nextCards = next.querySelectorAll(CARD);
            return (
                focusIn(nextCards[Math.min(index, nextCards.length - 1)]) ||
                focusIn(next.querySelector('button'))
            );
        };
        const group = inGroup(card.uid);
        const planOn = (to: string) =>
            group ? planPickedOn(to) : planCardOn(card, to);
        const toHorizon = (to: HorizonKey) =>
            void (group ? sendPickedToHorizon(to) : sendToHorizon(card, to));
        const moveDay = (step: number) => {
            const to = neighbourDate(dates, card.date, step);
            if (horizonsMode || !to) return false;
            planOn(to);
            return true;
        };
        if (event.shiftKey && (key === 'ArrowLeft' || key === 'H')) {
            handled = moveDay(-1);
        } else if (event.shiftKey && (key === 'ArrowRight' || key === 'L')) {
            handled = moveDay(1);
        } else if (key === 'ArrowLeft' || key === 'h') {
            handled = sideways(-1);
        } else if (key === 'ArrowRight' || key === 'l') {
            handled = sideways(1);
        } else if (key === 'ArrowDown' || key === 'j') {
            handled = vertical(1);
        } else if (key === 'ArrowUp' || key === 'k') {
            handled = vertical(-1);
        } else if (!horizonsMode && event.shiftKey && key === 'W') {
            toHorizon('next_week');
            handled = true;
        } else if (!horizonsMode && event.shiftKey && key === 'M') {
            toHorizon('this_month');
            handled = true;
        } else if (key === 't') {
            planOn(today);
            handled = true;
        } else if (key === 'T') {
            planOn(tomorrow);
            handled = true;
        }
        if (handled) event.preventDefault();
    };

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

    // "Thu 12 Nov" for one day, "12 Nov – 14 Nov" for several.
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

    const closeCalendar = () =>
        placement === 'split'
            ? patchOptions({ showCalendar: false })
            : setDrawerOpen(false);

    const calendarHeader = calendarDates.length > 0 && (
        <div className="flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate text-body font-semibold text-surface-on">
                {rangeLabel(
                    calendarDates[0],
                    calendarDates[calendarDates.length - 1]
                )}
            </span>
            <IconButton
                label={
                    placement === 'split'
                        ? t('upcoming.hideCalendar', 'Hide calendar')
                        : t('upcoming.closeCalendar', 'Close the calendar')
                }
                onClick={closeCalendar}
            >
                {placement === 'split' ? (
                    <ChevronDoubleRightIcon />
                ) : (
                    <XMarkIcon />
                )}
            </IconButton>
        </div>
    );

    const setCalendarWidth = (width: number, persist = false) => {
        const next = clampCalendarWidth(width, panesWidth, minBoard);
        setStoredWidth(next);
        if (persist) writeStored(WIDTH_KEY, String(next));
    };

    // N anywhere on the page (not in a field or a dialog) adds to the inbox.
    const [inboxAddRequest, setInboxAddRequest] = useState(0);
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'n' && event.key !== 'N') return;
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.shiftKey || isEditableTarget(event.target)) return;
            event.preventDefault();
            setInboxAddRequest((n) => n + 1);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    const setInboxWidth = (width: number, persist = false) => {
        const next = clampInboxWidth(width, panesWidth, calendarBeside);
        setStoredInboxWidth(next);
        if (persist) writeStored(INBOX_WIDTH_KEY, String(next));
    };

    const setInboxCollapsed = (collapsed: boolean) => {
        setInboxChoice(collapsed);
        saveInboxCollapsed(collapsed);
    };

    const toggleOverdue = () => {
        const next = !overdueCollapsed;
        setOverdueCollapsed(next);
        writeStored(OVERDUE_KEY, next ? '1' : '0');
    };

    // The tasks the strip shows (the filters apply), planned on days from
    // today on; today is reloaded so the strip drops them.
    const lateUids = () =>
        overdue.map((task) => task.uid).filter(Boolean) as string[];
    const planOverdue = (
        placed: { uid: string; date: string }[],
        message = t('upcoming.overdueReplanned', 'Overdue tasks replanned')
    ) => {
        const byDate = new Map<string, string[]>();
        placed.forEach(({ uid, date }) =>
            byDate.set(date, [...(byDate.get(date) ?? []), uid])
        );
        const writes: PlanWrite[] = [...byDate.keys()].sort().map((date) => ({
            date,
            ops: (byDate.get(date) ?? []).map((uid) => ({
                op: 'add' as const,
                task_uid: uid,
            })),
        }));
        return commit(writes, message, [today]);
    };
    const replanOverdueOn = (date: string) => {
        if (date < today) return;
        void planOverdue(lateUids().map((uid) => ({ uid, date })));
    };
    // « Étaler sur 7 jours »: the load of a day counts every task planned on
    // it, filters or not; days the board has not loaded are fetched.
    const spreadOverdueOverWeek = async () => {
        const late = overdue.filter((task) => task.uid);
        if (late.length === 0) return;
        const week = columnDates(today, SPREAD_DAYS);
        const loaded = { ...daysRef.current };
        try {
            const missing = week.filter((date) => !loaded[date]);
            const fetched = await Promise.all(
                missing.map((date) => fetchDay(date))
            );
            missing.forEach((date, i) => (loaded[date] = fetched[i]));
        } catch (err) {
            fail(err);
            return;
        }
        const planned = Object.fromEntries(
            week.map((date) => [
                date,
                (loaded[date]?.plan?.items ?? []).map((item) => item.task),
            ])
        );
        const placed = spreadOverdue(
            late.map((task) => ({
                uid: task.uid as string,
                priority: task.priority,
                due_date: task.due_date,
                estimated_minutes: task.estimated_minutes,
                start_date: task.start_date,
                defer_until: task.defer_until,
            })),
            today,
            planned
        );
        if (placed.length === 0) return;
        // The toast names the last day used: « réparties jusqu'à samedi ».
        const last = placed.reduce(
            (max, { date }) => (date > max ? date : max),
            today
        );
        const until = new Intl.DateTimeFormat(i18n.language, {
            weekday: 'long',
        }).format(new Date(`${last}T12:00:00`));
        void planOverdue(
            placed,
            t(
                'upcoming.overdueSpreadDone',
                'Overdue tasks spread until {{until}}',
                { until }
            )
        );
    };
    const [pickingOverdueDate, setPickingOverdueDate] = useState(false);
    const replanMenuRef = useRef<HTMLButtonElement | null>(null);
    const replanEntries: MenuEntry[] = [
        {
            key: 'today',
            label: t('upcoming.overdueToday', 'Today'),
            testId: 'overdue-replan-today',
            onSelect: () => replanOverdueOn(today),
        },
        {
            key: 'tomorrow',
            label: t('upcoming.overdueTomorrow', 'Tomorrow'),
            testId: 'overdue-replan-tomorrow',
            onSelect: () => replanOverdueOn(shiftDay(today, 1)),
        },
        {
            key: 'pick',
            label: t('upcoming.overduePick', 'Pick a date…'),
            testId: 'overdue-replan-pick',
            // After the menu has closed and refocused its button.
            onSelect: () =>
                requestAnimationFrame(() => setPickingOverdueDate(true)),
        },
    ];

    const filterProjects = projects
        .filter((project) => project.id !== undefined)
        .map((project) => ({
            id: project.id as number,
            name: project.name,
            color: (project as { color?: string }).color,
        }));
    const filterTags = tags.map((tag) => tag.name).filter(Boolean);
    const plannedOnDays =
        horizonsMode && buckets
            ? plannedThisWeek(shownDays, today, firstDayOfWeek, buckets.week)
            : [];

    const calendar = calendarVisible && (
        <DayCalendar
            range={range}
            columns={columnData}
            gridRef={gridRef}
            header={calendarHeader}
            selectedUid={openTaskUid}
            onWiden={
                placement === 'split'
                    ? () => setCalendarWidth(calendarMax, true)
                    : undefined
            }
            onToggle={toggle}
            onOpen={(line) => openLine(line)}
            onResize={(date, uid, duration) =>
                void commit(
                    [
                        {
                            date,
                            ops: [
                                {
                                    op: 'resize',
                                    task_uid: uid,
                                    duration_minutes: duration,
                                },
                            ],
                        },
                    ],
                    t('upcoming.resized', 'Duration changed')
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
                    [{ date, ops: [{ op: 'unslot', task_uid: uid }] }],
                    t('upcoming.unslotted', 'Time removed')
                )
            }
            drop={ghost}
            onOpenEvent={(event, onDate) => setEventDetail({ event, onDate })}
        />
    );

    const overdueCards = overdue.map((task) => lineFromDue(task, today));

    return (
        <QuickPlaceContext.Provider value={quickPlace}>
            <PushedCountsContext.Provider value={pushedCounts}>
                <PickedCardsContext.Provider value={pickedCards}>
                    <WeekPreviewContext.Provider value={previewCtx}>
                        <DndContext
                            sensors={sensors}
                            collisionDetection={collision}
                            measuring={{
                                droppable: {
                                    strategy: MeasuringStrategy.Always,
                                },
                            }}
                            accessibility={{
                                announcements,
                                screenReaderInstructions: {
                                    draggable: t(
                                        'upcoming.a11yInstructions',
                                        'To move a task, press M, move it with the arrow keys, then press Enter or Space to drop it, or Escape to cancel. On a focused task: arrows or H, J, K, L move between tasks and days; Shift with Left or Right moves the task a day; T plans it today, Shift+T tomorrow; Enter opens it.'
                                    ),
                                },
                            }}
                            onDragStart={onDragStart}
                            onDragMove={onDragMove}
                            onDragEnd={onDragEnd}
                            onDragCancel={endDrag}
                        >
                            <div
                                data-testid="upcoming-board"
                                className="flex h-full min-h-0 w-full flex-col bg-surface max-md:h-auto max-md:min-h-[calc(100dvh-3.5rem)] max-md:pb-24"
                            >
                                <header
                                    className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${PAGE_GUTTER} pb-3 pt-6`}
                                >
                                    <h1 className={`mr-1 ${PAGE_TITLE_CLASS}`}>
                                        {t('upcoming.title', 'Plan')}
                                    </h1>
                                    <Segmented
                                        aria-label={t(
                                            'upcoming.layout',
                                            'Layout'
                                        )}
                                        selected={
                                            previewOpen
                                                ? 'ai'
                                                : horizonsMode
                                                  ? 'horizons'
                                                  : 'days'
                                        }
                                        onSelect={(mode) => {
                                            if (mode === 'ai') {
                                                if (aiTabUid) {
                                                    setProposalParam(
                                                        navigate,
                                                        location,
                                                        aiTabUid
                                                    );
                                                }
                                                return;
                                            }
                                            // Leaving the AI tab keeps the proposal
                                            // ready for later.
                                            if (proposalUid) closePreview();
                                            patchOptions({
                                                mode:
                                                    mode === 'horizons'
                                                        ? 'horizons'
                                                        : 'days',
                                            });
                                        }}
                                        options={[
                                            {
                                                id: 'days',
                                                label: t(
                                                    'upcoming.days',
                                                    'Days'
                                                ),
                                            },
                                            {
                                                id: 'horizons',
                                                label: t(
                                                    'upcoming.horizons',
                                                    'Horizons'
                                                ),
                                            },
                                            ...(aiTabUid
                                                ? [
                                                      {
                                                          id: 'ai',
                                                          label: t(
                                                              'upcoming.aiTab',
                                                              'Planned by AI'
                                                          ),
                                                          testId: 'ai-tab',
                                                          icon: (
                                                              <SparklesIcon className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                                                          ),
                                                      },
                                                  ]
                                                : []),
                                        ]}
                                    />
                                    {!horizonsMode && (
                                        <nav
                                            aria-label={t(
                                                'upcoming.dateNav',
                                                'Dates'
                                            )}
                                            className="flex items-center gap-1"
                                        >
                                            {/* Never disabled: on today it scrolls today's
                                column back into view. */}
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                aria-current={
                                                    anchor === today &&
                                                    selected === today
                                                        ? 'date'
                                                        : undefined
                                                }
                                                onClick={() =>
                                                    goTo(today, today)
                                                }
                                            >
                                                {t('upcoming.today', 'Today')}
                                            </Button>
                                            <IconButton
                                                label={t(
                                                    'upcoming.previousWeek',
                                                    'Previous week'
                                                )}
                                                onClick={() => {
                                                    const to = shiftWeek(
                                                        anchor,
                                                        -1
                                                    );
                                                    goTo(to, to);
                                                }}
                                            >
                                                <ChevronLeftIcon />
                                            </IconButton>
                                            <IconButton
                                                label={t(
                                                    'upcoming.nextWeek',
                                                    'Next week'
                                                )}
                                                onClick={() => {
                                                    const to = shiftWeek(
                                                        anchor,
                                                        1
                                                    );
                                                    goTo(to, to);
                                                }}
                                            >
                                                <ChevronRightIcon />
                                            </IconButton>
                                            <JumpToDate
                                                value={selected}
                                                today={today}
                                                weekStartsOn={firstDayOfWeek}
                                                onPick={(date) =>
                                                    goTo(
                                                        date,
                                                        anchorFor(anchor, date)
                                                    )
                                                }
                                            />
                                            <span className="ml-1 text-body-m text-surface-on-variant max-sm:hidden">
                                                {rangeLabel(
                                                    dates[0],
                                                    dates[dates.length - 1]
                                                )}
                                            </span>
                                        </nav>
                                    )}
                                    <div className="ml-auto flex items-center gap-1">
                                        <ProposalButton kind="week" />
                                        <PluginActions
                                            place="plan"
                                            context={{
                                                start: dates[0],
                                                end: dates[dates.length - 1],
                                            }}
                                        />
                                        <ViewMenu
                                            options={options}
                                            onChange={setOptions}
                                            projects={filterProjects}
                                            tags={filterTags}
                                        />
                                        <Button
                                            size="sm"
                                            variant={
                                                calendarVisible
                                                    ? 'secondary'
                                                    : 'ghost'
                                            }
                                            aria-label={
                                                calendarVisible
                                                    ? t(
                                                          'upcoming.hideCalendar',
                                                          'Hide calendar'
                                                      )
                                                    : t(
                                                          'upcoming.showCalendar',
                                                          'Show calendar'
                                                      )
                                            }
                                            aria-pressed={calendarVisible}
                                            aria-expanded={
                                                placement === 'drawer'
                                                    ? drawerOpen
                                                    : undefined
                                            }
                                            onClick={() =>
                                                merged
                                                    ? patchOptions({
                                                          mergeCalendar: false,
                                                          showCalendar: true,
                                                      })
                                                    : placement === 'split'
                                                      ? patchOptions({
                                                            showCalendar:
                                                                !options.showCalendar,
                                                        })
                                                      : setDrawerOpen(
                                                            !drawerOpen
                                                        )
                                            }
                                        >
                                            <CalendarDaysIcon
                                                aria-hidden="true"
                                                className="h-4 w-4"
                                            />
                                            {t('upcoming.calendar', 'Calendar')}
                                        </Button>
                                        {!horizonsMode && (
                                            <Button
                                                size="sm"
                                                variant={
                                                    merged
                                                        ? 'secondary'
                                                        : 'ghost'
                                                }
                                                aria-pressed={merged}
                                                title={t(
                                                    'upcoming.mergeCalendarTitle',
                                                    'Show the agenda inside the day columns and hide the side calendar'
                                                )}
                                                onClick={() => {
                                                    setDrawerOpen(false);
                                                    patchOptions({
                                                        mergeCalendar: !merged,
                                                    });
                                                }}
                                            >
                                                <Squares2X2Icon
                                                    aria-hidden="true"
                                                    className="h-4 w-4"
                                                />
                                                {t(
                                                    'upcoming.mergeCalendar',
                                                    'Merged calendar'
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </header>

                                {(error || (horizonsMode && horizon.error)) && (
                                    <p
                                        role="status"
                                        className={`${PAGE_GUTTER} pb-2 text-body-m text-danger`}
                                    >
                                        {t(
                                            'upcoming.loadFailed',
                                            'Could not load the days.'
                                        )}
                                    </p>
                                )}

                                <div
                                    ref={panesRef}
                                    className="relative flex min-h-0 flex-1 flex-col md:flex-row"
                                >
                                    <div
                                        className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 pb-3 pl-5 pr-2 pt-1"
                                        onKeyDown={onBoardKeyDown}
                                        onContextMenu={(event) => {
                                            if (horizonsMode) return;
                                            const el = (
                                                event.target as HTMLElement
                                            ).closest?.(
                                                CARD
                                            ) as HTMLElement | null;
                                            const card = el ? cardAt(el) : null;
                                            if (!card) return;
                                            event.preventDefault();
                                            setCardMenu({
                                                card,
                                                x: event.clientX,
                                                y: event.clientY,
                                            });
                                        }}
                                    >
                                        {previewOpen && (
                                            <PreviewBanner
                                                onApply={() =>
                                                    void applyPreview()
                                                }
                                                onIgnore={() =>
                                                    void ignorePreview()
                                                }
                                                onRetry={() =>
                                                    void retryPreview()
                                                }
                                                onClose={closePreview}
                                            />
                                        )}
                                        <div className="flex min-h-0 min-w-0 flex-1 gap-3">
                                            <div
                                                ref={inboxRef}
                                                data-testid="plan-left-column"
                                                className="flex min-h-0 shrink-0 flex-col gap-2 overflow-y-auto p-1"
                                            >
                                                {overdueCards.length > 0 && (
                                                    <div
                                                        style={{
                                                            width: openInboxWidth,
                                                        }}
                                                        className="shrink-0"
                                                    >
                                                        <section
                                                            data-testid="upcoming-overdue"
                                                            aria-label={t(
                                                                'upcoming.overdue',
                                                                'Overdue'
                                                            )}
                                                            data-collapsed={
                                                                overdueCollapsed ||
                                                                undefined
                                                            }
                                                            className={`shrink-0 rounded-2xl px-2 ${
                                                                overdueCollapsed
                                                                    ? 'py-0.5'
                                                                    : 'border border-danger/30 bg-danger/5 py-1.5'
                                                            }`}
                                                        >
                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                                <button
                                                                    type="button"
                                                                    aria-expanded={
                                                                        !overdueCollapsed
                                                                    }
                                                                    onClick={
                                                                        toggleOverdue
                                                                    }
                                                                    className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 text-body-m font-semibold text-danger hover:bg-surface-high/60 focus-visible:outline-2 focus-visible:outline-primary"
                                                                >
                                                                    <ChevronRightIcon
                                                                        aria-hidden="true"
                                                                        className={`h-4 w-4 transition-transform duration-150 ${
                                                                            overdueCollapsed
                                                                                ? ''
                                                                                : 'rotate-90'
                                                                        }`}
                                                                    />
                                                                    {t(
                                                                        'upcoming.overdueCount',
                                                                        'Overdue ({{count}})',
                                                                        {
                                                                            count: overdueCards.length,
                                                                        }
                                                                    )}
                                                                </button>
                                                                <div className="relative ml-auto flex flex-wrap items-center justify-end gap-1">
                                                                    <PluginActions
                                                                        place="overdue"
                                                                        context={{
                                                                            date: today,
                                                                        }}
                                                                    />
                                                                    <ProposalButton
                                                                        kind="week"
                                                                        label={t(
                                                                            'upcoming.overdueAiReplan',
                                                                            'Reschedule with AI'
                                                                        )}
                                                                        testId="overdue-replan-ai"
                                                                    />
                                                                    <div className="flex items-center">
                                                                        <Button
                                                                            size="sm"
                                                                            variant="danger"
                                                                            className="rounded-r-none"
                                                                            data-testid="overdue-replan"
                                                                            title={t(
                                                                                'upcoming.overdueReplanTitle',
                                                                                'Spread over the next days: high priority today or tomorrow, medium within 4 days, the rest within 7, on the lightest days, never before a start date.'
                                                                            )}
                                                                            onClick={() =>
                                                                                void spreadOverdueOverWeek()
                                                                            }
                                                                        >
                                                                            {t(
                                                                                'upcoming.overdueReplan',
                                                                                'Reschedule'
                                                                            )}
                                                                        </Button>
                                                                        <Menu
                                                                            entries={
                                                                                replanEntries
                                                                            }
                                                                            testId="overdue-replan-menu"
                                                                            trigger={({
                                                                                ref,
                                                                                ...props
                                                                            }) => (
                                                                                <Button
                                                                                    {...props}
                                                                                    ref={(
                                                                                        el
                                                                                    ) => {
                                                                                        replanMenuRef.current =
                                                                                            el;
                                                                                        if (
                                                                                            typeof ref ===
                                                                                            'function'
                                                                                        ) {
                                                                                            ref(
                                                                                                el
                                                                                            );
                                                                                        } else if (
                                                                                            ref
                                                                                        ) {
                                                                                            (
                                                                                                ref as React.MutableRefObject<HTMLButtonElement | null>
                                                                                            ).current =
                                                                                                el;
                                                                                        }
                                                                                    }}
                                                                                    size="sm"
                                                                                    variant="danger"
                                                                                    className="-ml-px rounded-l-none px-1.5"
                                                                                    aria-label={t(
                                                                                        'upcoming.overdueMore',
                                                                                        'All on one day'
                                                                                    )}
                                                                                    data-testid="overdue-replan-more"
                                                                                >
                                                                                    <ChevronDownIcon
                                                                                        aria-hidden="true"
                                                                                        className="h-3.5 w-3.5"
                                                                                    />
                                                                                </Button>
                                                                            )}
                                                                        />
                                                                    </div>
                                                                    <JumpToDate
                                                                        value={
                                                                            today
                                                                        }
                                                                        today={
                                                                            today
                                                                        }
                                                                        weekStartsOn={
                                                                            firstDayOfWeek
                                                                        }
                                                                        onPick={
                                                                            replanOverdueOn
                                                                        }
                                                                        controlled={{
                                                                            open: pickingOverdueDate,
                                                                            label: t(
                                                                                'upcoming.overduePick',
                                                                                'Pick a date…'
                                                                            ),
                                                                            testId: 'overdue-replan-date',
                                                                            min: today,
                                                                            onClose:
                                                                                () => {
                                                                                    setPickingOverdueDate(
                                                                                        false
                                                                                    );
                                                                                    replanMenuRef.current?.focus();
                                                                                },
                                                                        }}
                                                                    />
                                                                </div>
                                                            </div>
                                                            {!overdueCollapsed && (
                                                                <div
                                                                    role="list"
                                                                    className="flex flex-col gap-2 px-0.5 pb-1.5 pt-1"
                                                                >
                                                                    <SortableContext
                                                                        items={overdueCards.map(
                                                                            (
                                                                                line
                                                                            ) =>
                                                                                cardId(
                                                                                    OVERDUE,
                                                                                    line.uid
                                                                                )
                                                                        )}
                                                                        strategy={
                                                                            verticalListSortingStrategy
                                                                        }
                                                                    >
                                                                        {overdueCards.map(
                                                                            (
                                                                                line
                                                                            ) => (
                                                                                <div
                                                                                    key={
                                                                                        line.uid
                                                                                    }
                                                                                    className="w-full"
                                                                                >
                                                                                    <TaskCard
                                                                                        line={
                                                                                            line
                                                                                        }
                                                                                        date={
                                                                                            OVERDUE
                                                                                        }
                                                                                        selected={
                                                                                            openTaskUid ===
                                                                                            line.uid
                                                                                        }
                                                                                        onToggle={
                                                                                            toggle
                                                                                        }
                                                                                        onOpen={(
                                                                                            l
                                                                                        ) =>
                                                                                            openLine(
                                                                                                l
                                                                                            )
                                                                                        }
                                                                                        onToggleSubtask={
                                                                                            toggleSubtask
                                                                                        }
                                                                                    />
                                                                                </div>
                                                                            )
                                                                        )}
                                                                    </SortableContext>
                                                                </div>
                                                            )}
                                                        </section>
                                                    </div>
                                                )}
                                                {toPlanBox &&
                                                    !previewing &&
                                                    !horizonsMode && (
                                                        <ToPlanBox
                                                            box={{
                                                                ...toPlanBox,
                                                                week: [],
                                                                month: [],
                                                            }}
                                                            today={today}
                                                            openTaskUid={
                                                                openTaskUid
                                                            }
                                                            collapsed={
                                                                toPlanCollapsed
                                                            }
                                                            onCollapsedChange={
                                                                setToPlanCollapsed
                                                            }
                                                            thin={
                                                                inboxIsCollapsed
                                                            }
                                                            width={
                                                                openInboxWidth
                                                            }
                                                            onExpand={() => {
                                                                setInboxCollapsed(
                                                                    false
                                                                );
                                                                setToPlanCollapsed(
                                                                    false
                                                                );
                                                            }}
                                                            onOpenTask={(
                                                                line
                                                            ) => openLine(line)}
                                                            onToggleTask={
                                                                toggle
                                                            }
                                                            onToggleSubtask={
                                                                toggleSubtask
                                                            }
                                                        />
                                                    )}
                                                {!horizonsMode &&
                                                    !previewing && (
                                                        <PushedSection
                                                            items={pushed}
                                                            width={
                                                                openInboxWidth
                                                            }
                                                            onOpenTask={(uid) =>
                                                                openTask(uid)
                                                            }
                                                            onDecide={(
                                                                uid,
                                                                decision
                                                            ) =>
                                                                void decidePushed(
                                                                    uid,
                                                                    decision
                                                                )
                                                            }
                                                        />
                                                    )}
                                                <div
                                                    className={`flex ${
                                                        inboxIsCollapsed
                                                            ? 'min-h-0 flex-1'
                                                            : 'shrink-0'
                                                    }`}
                                                >
                                                    <InboxColumn
                                                        width={openInboxWidth}
                                                        addRequest={
                                                            inboxAddRequest
                                                        }
                                                        items={inboxItems}
                                                        tasks={inboxTasks}
                                                        today={today}
                                                        loading={
                                                            inboxLoading ||
                                                            unsorted.tasks ===
                                                                null
                                                        }
                                                        openTaskUid={
                                                            openTaskUid
                                                        }
                                                        onAdd={addToInbox}
                                                        onOpenTask={(line) =>
                                                            openLine(line)
                                                        }
                                                        onToggleTask={toggle}
                                                        onToggleSubtask={
                                                            toggleSubtask
                                                        }
                                                        collapsed={
                                                            inboxIsCollapsed
                                                        }
                                                        onCollapsedChange={
                                                            horizonsMode
                                                                ? setInboxCollapsed
                                                                : undefined
                                                        }
                                                        onIdeaToTask={() =>
                                                            void reloadUnsorted()
                                                        }
                                                    />
                                                </div>
                                                {previewing && (
                                                    <div
                                                        style={{
                                                            width: openInboxWidth,
                                                        }}
                                                    >
                                                        <PreviewHorizons
                                                            buckets={buckets}
                                                            titles={
                                                                horizonTitles
                                                            }
                                                        />
                                                    </div>
                                                )}
                                                {!horizonsMode &&
                                                    !previewing &&
                                                    HORIZON_KEYS.map((key) => (
                                                        <div
                                                            key={key}
                                                            style={{
                                                                width: openInboxWidth,
                                                            }}
                                                            className="shrink-0"
                                                        >
                                                            <HorizonColumn
                                                                horizon={key}
                                                                title={
                                                                    horizonTitles[
                                                                        key
                                                                    ]
                                                                }
                                                                hint={
                                                                    horizonHints[
                                                                        key
                                                                    ]
                                                                }
                                                                tasks={
                                                                    leftHorizons?.[
                                                                        key
                                                                    ] ?? null
                                                                }
                                                                today={today}
                                                                openTaskUid={
                                                                    openTaskUid
                                                                }
                                                                onOpen={(
                                                                    line
                                                                ) =>
                                                                    openLine(
                                                                        line
                                                                    )
                                                                }
                                                                onToggle={
                                                                    toggle
                                                                }
                                                                onToggleSubtask={
                                                                    toggleSubtask
                                                                }
                                                                onAdd={(name) =>
                                                                    void addToHorizon(
                                                                        key,
                                                                        name
                                                                    )
                                                                }
                                                                fill={false}
                                                                collapsible
                                                                defaultCollapsed={
                                                                    key ===
                                                                    'someday'
                                                                }
                                                                headerExtra={
                                                                    key ===
                                                                    'week' ? (
                                                                        <WeekLoadBadge
                                                                            load={weekLoad(
                                                                                days,
                                                                                today,
                                                                                firstDayOfWeek,
                                                                                DEFAULT_DAY_MINUTES
                                                                            )}
                                                                        />
                                                                    ) : undefined
                                                                }
                                                            />
                                                        </div>
                                                    ))}
                                            </div>
                                            {!inboxIsCollapsed && (
                                                // Sits in the gap: as wide as the gap alone.
                                                <div className="-mx-[9px] flex">
                                                    <PaneSplitter
                                                        label={t(
                                                            'upcoming.resizeInbox',
                                                            'Inbox width'
                                                        )}
                                                        testId="inbox-splitter"
                                                        width={openInboxWidth}
                                                        min={INBOX_MIN}
                                                        max={inboxMaxWidth(
                                                            panesWidth,
                                                            calendarBeside
                                                        )}
                                                        from="left"
                                                        containerRef={inboxRef}
                                                        defaultWidth={
                                                            INBOX_WIDTH
                                                        }
                                                        onChange={setInboxWidth}
                                                    />
                                                </div>
                                            )}
                                            <div
                                                ref={boardRef}
                                                data-testid="upcoming-columns"
                                                style={
                                                    horizonsMode
                                                        ? {
                                                              gridTemplateColumns: `repeat(${horizonColumns(boardWidth)}, minmax(0, 1fr))`,
                                                          }
                                                        : undefined
                                                }
                                                className={
                                                    horizonsMode
                                                        ? `grid min-h-0 min-w-0 flex-1 gap-3 overflow-y-auto p-1 ${
                                                              horizonRowsFill(
                                                                  horizonColumns(
                                                                      boardWidth
                                                                  )
                                                              )
                                                                  ? 'auto-rows-[minmax(0,1fr)]'
                                                                  : 'content-start auto-rows-auto'
                                                          }`
                                                        : 'flex min-h-0 min-w-0 flex-1 snap-x snap-proximity scroll-px-1 gap-3 overflow-x-auto p-1'
                                                }
                                            >
                                                {horizonsMode
                                                    ? HORIZON_KEYS.map(
                                                          (key) => (
                                                              <HorizonColumn
                                                                  key={key}
                                                                  horizon={key}
                                                                  title={
                                                                      horizonTitles[
                                                                          key
                                                                      ]
                                                                  }
                                                                  hint={
                                                                      horizonHints[
                                                                          key
                                                                      ]
                                                                  }
                                                                  tasks={
                                                                      buckets?.[
                                                                          key
                                                                      ] ?? null
                                                                  }
                                                                  plannedOnDays={
                                                                      key ===
                                                                      'week'
                                                                          ? plannedOnDays
                                                                          : undefined
                                                                  }
                                                                  today={today}
                                                                  openTaskUid={
                                                                      openTaskUid
                                                                  }
                                                                  onOpen={(
                                                                      line
                                                                  ) =>
                                                                      openLine(
                                                                          line
                                                                      )
                                                                  }
                                                                  onToggle={
                                                                      toggle
                                                                  }
                                                                  onToggleSubtask={
                                                                      toggleSubtask
                                                                  }
                                                                  onAdd={(
                                                                      name
                                                                  ) =>
                                                                      void addToHorizon(
                                                                          key,
                                                                          name
                                                                      )
                                                                  }
                                                                  fill={horizonRowsFill(
                                                                      horizonColumns(
                                                                          boardWidth
                                                                      )
                                                                  )}
                                                              />
                                                          )
                                                      )
                                                    : dates.map((date) => {
                                                          const day =
                                                              shownDays[date];
                                                          const hours =
                                                              day?.day_hours;
                                                          return (
                                                              <div
                                                                  key={date}
                                                                  className="flex w-[264px] shrink-0 snap-start flex-col"
                                                              >
                                                                  {/* Room for the week label of the columns that start a week, so headers line up. */}
                                                                  {getDay(
                                                                      parseISO(
                                                                          date
                                                                      )
                                                                  ) !==
                                                                      firstDayOfWeek && (
                                                                      <div
                                                                          aria-hidden="true"
                                                                          className="h-6 shrink-0"
                                                                      />
                                                                  )}
                                                                  <DayColumn
                                                                      date={
                                                                          date
                                                                      }
                                                                      isToday={
                                                                          date ===
                                                                          today
                                                                      }
                                                                      day={day}
                                                                      selected={
                                                                          calendarVisible
                                                                              ? calendarDates.includes(
                                                                                    date
                                                                                )
                                                                              : date ===
                                                                                selected
                                                                      }
                                                                      openTaskUid={
                                                                          openTaskUid
                                                                      }
                                                                      groupBy={
                                                                          options.groupBy
                                                                      }
                                                                      sortBy={
                                                                          options.sortBy
                                                                      }
                                                                      showCompleted={
                                                                          options.showCompleted
                                                                      }
                                                                      onOpenEvent={(
                                                                          event,
                                                                          onDate
                                                                      ) =>
                                                                          setEventDetail(
                                                                              {
                                                                                  event,
                                                                                  onDate,
                                                                              }
                                                                          )
                                                                      }
                                                                      events={
                                                                          merged
                                                                              ? (
                                                                                    events[
                                                                                        date
                                                                                    ] ??
                                                                                    []
                                                                                ).map(
                                                                                    (
                                                                                        event
                                                                                    ) => ({
                                                                                        title: event.title,
                                                                                        all_day:
                                                                                            event.all_day,
                                                                                        start:
                                                                                            event.start_minute ===
                                                                                            null
                                                                                                ? undefined
                                                                                                : formatMinute(
                                                                                                      event.start_minute
                                                                                                  ),
                                                                                        end:
                                                                                            event.end_minute ===
                                                                                            null
                                                                                                ? undefined
                                                                                                : formatMinute(
                                                                                                      event.end_minute
                                                                                                  ),
                                                                                        source: event,
                                                                                    })
                                                                                )
                                                                              : undefined
                                                                      }
                                                                      availableMinutes={
                                                                          hours
                                                                              ? hours.end -
                                                                                hours.start
                                                                              : DEFAULT_DAY_MINUTES
                                                                      }
                                                                      weekStartsOn={
                                                                          firstDayOfWeek
                                                                      }
                                                                      onSelect={
                                                                          selectDay
                                                                      }
                                                                      onAdd={
                                                                          addTask
                                                                      }
                                                                      onOpen={(
                                                                          line
                                                                      ) =>
                                                                          openLine(
                                                                              line,
                                                                              date
                                                                          )
                                                                      }
                                                                      onToggle={
                                                                          toggle
                                                                      }
                                                                      onToggleSubtask={
                                                                          toggleSubtask
                                                                      }
                                                                  />
                                                              </div>
                                                          );
                                                      })}
                                            </div>
                                        </div>
                                    </div>

                                    {calendarVisible &&
                                        placement === 'split' && (
                                            <>
                                                <PaneSplitter
                                                    label={t(
                                                        'upcoming.resizeCalendar',
                                                        'Calendar width'
                                                    )}
                                                    testId="pane-splitter"
                                                    width={calendarWidth}
                                                    min={CALENDAR_MIN}
                                                    max={calendarMax}
                                                    from="right"
                                                    containerRef={panesRef}
                                                    defaultWidth={
                                                        CALENDAR_WIDTH[1]
                                                    }
                                                    onChange={setCalendarWidth}
                                                />
                                                <section
                                                    aria-label={t(
                                                        'upcoming.calendar',
                                                        'Calendar'
                                                    )}
                                                    data-testid="upcoming-calendar"
                                                    style={{
                                                        width: calendarWidth,
                                                    }}
                                                    className="flex min-h-0 shrink-0 flex-col border-l border-outline-variant/60"
                                                >
                                                    {calendar}
                                                </section>
                                            </>
                                        )}
                                    {calendarVisible &&
                                        placement === 'drawer' && (
                                            <section
                                                aria-label={t(
                                                    'upcoming.calendar',
                                                    'Calendar'
                                                )}
                                                data-testid="upcoming-calendar"
                                                data-drawer="true"
                                                onKeyDown={(event) => {
                                                    if (
                                                        event.key ===
                                                            'Escape' &&
                                                        !dragging
                                                    ) {
                                                        setDrawerOpen(false);
                                                    }
                                                }}
                                                className="absolute inset-y-0 right-0 z-30 flex w-[min(400px,100%)] flex-col border-l border-outline-variant/60 bg-surface shadow-xl"
                                            >
                                                {calendar}
                                            </section>
                                        )}
                                </div>
                            </div>
                            {cardMenu && (
                                <div
                                    className="fixed"
                                    style={{
                                        left: cardMenu.x,
                                        top: cardMenu.y,
                                    }}
                                >
                                    <Menu
                                        entries={cardMenuEntries}
                                        align="start"
                                        testId="card-horizon-menu"
                                        onOpenChange={(open) => {
                                            if (!open) setCardMenu(null);
                                        }}
                                        trigger={(triggerProps) => (
                                            <button
                                                {...triggerProps}
                                                type="button"
                                                data-card-menu-anchor=""
                                                aria-label={t(
                                                    'upcoming.stripLabel',
                                                    'Send to a horizon'
                                                )}
                                                className="block h-0 w-0 overflow-hidden opacity-0"
                                            />
                                        )}
                                    />
                                </div>
                            )}
                            {eventDetail && (
                                <CalendarEventDetail
                                    event={eventDetail.event}
                                    onDate={eventDetail.onDate}
                                    onClose={() => setEventDetail(null)}
                                    onChanged={() =>
                                        setEventsVersion((v) => v + 1)
                                    }
                                />
                            )}
                            <DragOverlay dropAnimation={null}>
                                {dragging && ghost === null ? (
                                    <div className="max-w-xs truncate rounded-lg bg-surface px-3 py-1.5 text-body-m text-surface-on shadow-lg ring-1 ring-outline-variant">
                                        {dragging.title}
                                    </div>
                                ) : null}
                            </DragOverlay>
                            {picked.size > 0 && (
                                <div
                                    role="toolbar"
                                    aria-label={t(
                                        'upcoming.pickedCount',
                                        'Selected: {{count}}',
                                        {
                                            count: picked.size,
                                        }
                                    )}
                                    className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-2xl bg-surface-card px-2 py-1.5 shadow-2xl ring-1 ring-outline-variant"
                                >
                                    <span className="px-2 text-body-m font-semibold tabular-nums text-surface-on">
                                        {t(
                                            'upcoming.pickedCount',
                                            'Selected: {{count}}',
                                            {
                                                count: picked.size,
                                            }
                                        )}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => planPickedOn(today)}
                                    >
                                        {t('upcoming.overdueToday', 'Today')}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => planPickedOn(tomorrow)}
                                    >
                                        {t(
                                            'upcoming.overdueTomorrow',
                                            'Tomorrow'
                                        )}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() =>
                                            void sendPickedToHorizon(
                                                'next_week'
                                            )
                                        }
                                    >
                                        {horizonTitles.next_week}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() =>
                                            void sendPickedToHorizon(
                                                'this_month'
                                            )
                                        }
                                    >
                                        {horizonTitles.this_month}
                                    </Button>
                                    <IconButton
                                        label={t(
                                            'upcoming.pickedClear',
                                            'Clear the selection'
                                        )}
                                        onClick={clearPicked}
                                    >
                                        <XMarkIcon />
                                    </IconButton>
                                </div>
                            )}
                        </DndContext>
                    </WeekPreviewContext.Provider>
                </PickedCardsContext.Provider>
            </PushedCountsContext.Provider>
        </QuickPlaceContext.Provider>
    );
};

export default UpcomingBoard;
