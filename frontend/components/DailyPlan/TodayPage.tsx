import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    CollisionDetection,
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    pointerWithin,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Task } from '../../entities/Task';
import {
    AiWrapUp,
    DailyPlanItem,
    DayHours,
    InboxCandidate,
    PlanCandidates,
    fetchDailyPlan,
    fetchPlanCandidates,
    saveDailyPlanItems,
    startDailyPlan,
    toPlanItemInputs,
    draftDayWithAi,
    estimateWithAi,
} from '../../utils/dailyPlanService';
import { focusKey, focusScopeParams, useFocus } from '../../utils/focus';
import {
    CalendarEvent,
    fetchCalendarEvents,
    fetchCalendarFeeds,
} from '../../utils/calendarFeedsService';
import {
    createTask,
    fetchCalendarTasks,
    fetchTaskByUid,
    deleteTask,
    fetchTasks,
    toggleTaskCompletion,
    updateTask,
} from '../../utils/tasksService';
import { useIsMinimal } from '../../hooks/useUiDensity';
import TaskList from '../Task/TaskList';
import NewTask from '../Task/NewTask';
import CompletedTasksSection, {
    useCompletedTasks,
} from '../Task/CompletedTasksSection';
import { onCaptureSaved, openCapture } from '../../utils/captureUi';
import { processInboxItem } from '../../utils/inboxService';
import { getUserTimezone } from '../../utils/dateUtils';
import { isHabitDoneForNow } from '../../utils/habitUtils';
import { TASK_STATUS, isTaskDone } from '../../constants/taskStatus';
import { countOutside } from '../Calendar/visibleHours';
import { parseISO } from 'date-fns';
import { useToast } from '../Shared/ToastContext';
import { useStore } from '../../store/useStore';
import { useDailyPlanProgress } from '../../store/dailyPlanStore';
import {
    EllipsisHorizontalIcon,
    LockClosedIcon,
    SparklesIcon,
    CalendarDaysIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from '@heroicons/react/24/outline';
import PlanTips from './PlanTips';
import NowCard from './NowCard';
import WrapUpCard from './WrapUpCard';
import { useDailyQuote } from './useDailyQuote';
import { buildTips, rescheduleMissed } from './tips';
import CandidateList, { CandidateFilter } from './CandidateList';
import DayTimeline, { PX_PER_MINUTE } from './DayTimeline';
import PlanList from './PlanList';
import CalendarDayView from '../Calendar/CalendarDayView';
import {
    VisibleHours,
    WHOLE_DAY,
    readVisibleHours,
} from '../Calendar/visibleHours';
import CalendarHoursMenu from './CalendarHoursMenu';
import { fetchProfile, updateUiSettings } from '../../utils/profileService';
import {
    CalendarEvent as CalendarBlock,
    CalendarTask,
    dropToDueUpdate,
    resizeUpdate,
    taskIdOf,
    taskToEvents,
} from '../Calendar/taskEvents';
import { useAiAllowed, useTrialLock } from '../../hooks/useTrialStatus';
import { useTaskUpdatedEvent } from '../../hooks/useTaskUpdatedEvent';
import {
    DEFAULT_DAY_END,
    DEFAULT_DAY_START,
    DEFAULT_DURATION,
    SLOT_MINUTES,
    busyMinutes,
    clampDayHours,
    dayRange,
    findFreeSlot,
    formatDuration,
    itemEnd,
    isItemDone,
    minuteOfDay,
    overlapsItems,
    plannedMinutes,
    taskLength,
    intlLocale,
} from './planUtils';

type Mode = 'timeline' | 'list';
type PanelMode = 'planning' | 'calendar';
const MODE_KEY = 'dailyPlanMode';
const CALENDAR_OPEN_KEY = 'today.calendarOpen';
const PANEL_MODE_KEY = 'today.panelMode';
const SAVE_DELAY_MS = 500;
// How many more suggestions each "Show more" past the loaded ones asks for.
const SUGGESTIONS_PAGE = 20;
const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

// The server's count of suggestions, moved by a local add or removal so
// "Show more" still knows whether anything is left to fetch.
const countSuggested = (list: PlanCandidates, delta: number) =>
    Math.max(
        list.suggested.length + delta,
        (list.suggested_total ?? list.suggested.length) + delta
    );

const readMode = (): Mode => {
    try {
        return localStorage.getItem(MODE_KEY) === 'list' ? 'list' : 'timeline';
    } catch {
        return 'timeline';
    }
};

// Remembered per browser; storage can be blocked (private windows). Without
// a choice the calendar is open on wide screens only.
const readCalendarOpen = (narrow: boolean): boolean => {
    try {
        const stored = window.localStorage.getItem(CALENDAR_OPEN_KEY);
        if (stored === 'true' || stored === 'false') return stored === 'true';
    } catch {
        // Fall through to the screen-width default.
    }
    return !narrow;
};

const writeCalendarOpen = (open: boolean) => {
    try {
        window.localStorage.setItem(CALENDAR_OPEN_KEY, String(open));
    } catch {
        // The choice only lasts for this page view.
    }
};

const readPanelMode = (): PanelMode => {
    try {
        return window.localStorage.getItem(PANEL_MODE_KEY) === 'calendar'
            ? 'calendar'
            : 'planning';
    } catch {
        return 'planning';
    }
};

const writePanelMode = (mode: PanelMode) => {
    try {
        window.localStorage.setItem(PANEL_MODE_KEY, mode);
    } catch {
        // The choice only lasts for this page view.
    }
};

// The calendar's "today" in the user's timezone, as YYYY-MM-DD.
const todayString = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: getUserTimezone() }).format(
        new Date()
    );

const isRecurring = (task: Task): boolean =>
    !task.habit_mode &&
    !!task.recurrence_type &&
    task.recurrence_type !== 'none';

// A recurring task's day is done once it reopened for a later date.
const occurrenceDone = (task: Task, day: string): boolean =>
    task.habit_mode
        ? isHabitDoneForNow(task)
        : isRecurring(task) &&
          !isTaskDone(task.status) &&
          !!task.due_date &&
          task.due_date.slice(0, 10) > day;

// The open tasks due on a day, shaped like the planner's candidates for a
// day that is not today (the server only ranks today's candidates).
const dayCandidates = (tasks: Task[], day: string): PlanCandidates => ({
    tagged_today: [],
    in_progress: [],
    overdue: [],
    due_today: tasks.filter(
        (task) =>
            !task.is_virtual_occurrence &&
            !task.habit_mode &&
            !isTaskDone(task.status) &&
            task.due_date?.slice(0, 10) === day
    ),
    suggested: [],
    inbox: [],
    inbox_count: 0,
    ranked: [],
});

const feedToCalendarEvent = (
    event: CalendarEvent,
    day: string
): CalendarBlock => {
    const at = (minute: number | null) => {
        const [year, month, date] = day.split('-').map(Number);
        return new Date(year, month - 1, date, 0, minute ?? 0);
    };
    return {
        id: `feed-${event.feed_uid}-${event.uid}-${event.start_minute ?? 'all-day'}`,
        title: event.title || event.feed_name,
        start: at(event.start_minute),
        end: event.all_day
            ? at(24 * 60)
            : at(event.end_minute ?? event.start_minute),
        type: 'event',
        color: event.color || '#6b7280',
        feedUid: event.feed_uid,
        allDay: !!event.all_day,
        readOnly: true,
    };
};

const addDays = (date: string, days: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Pointer position for drops; keyboard drags have none.
const pointerY = (event: Event | null): number | null => {
    if (!event) return null;
    if ('clientY' in event && typeof event.clientY === 'number') {
        return event.clientY;
    }
    if ('touches' in event) {
        const touch = (event as TouchEvent).touches[0];
        return touch ? touch.clientY : null;
    }
    return null;
};

const useIsNarrow = () => {
    const query = '(max-width: 767px)';
    const [narrow, setNarrow] = useState(
        () =>
            typeof window !== 'undefined' && window.matchMedia?.(query).matches
    );
    useEffect(() => {
        const media = window.matchMedia?.(query);
        if (!media) return;
        const update = () => setNarrow(media.matches);
        media.addEventListener?.('change', update);
        return () => media.removeEventListener?.('change', update);
    }, []);
    return !!narrow;
};

// Closes a small menu on a click outside it or on Escape.
const useDismiss = (open: boolean, close: () => void) => {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!open) return;
        const onPointer = (event: PointerEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                close();
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, close]);
    return ref;
};

const collisionDetection: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    return hits.length > 0 ? hits : closestCenter(args);
};

interface DayCalendarProps {
    date: string;
    events: CalendarBlock[];
    visibleHours: VisibleHours;
    onEventResize: (eventId: string, newEnd: Date) => void;
}

// The day's calendar. Its slots and blocks are dnd-kit drop targets and
// draggables of the page's DndContext.
const DayCalendar: React.FC<DayCalendarProps> = ({
    date,
    events,
    visibleHours,
    onEventResize,
}) => (
    <div className="rounded-lg" data-testid="day-calendar">
        <CalendarDayView
            currentDate={new Date(`${date}T12:00:00`)}
            events={events}
            onEventResize={onEventResize}
            visibleHours={visibleHours}
            dndKit
        />
    </div>
);

const TodayPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const focus = useFocus();
    const focusId = focusKey(focus);
    const [searchParams, setSearchParams] = useSearchParams();
    const { showErrorToast, showSuccessToast, showUndoToast } = useToast();
    const narrow = useIsNarrow();
    const quote = useDailyQuote(i18n.language);
    const setProgress = useDailyPlanProgress((s) => s.setProgress);

    const requestedParam = searchParams.get('date');
    const requestedDate =
        requestedParam && DATE_PARAM.test(requestedParam)
            ? requestedParam
            : null;

    const [date, setDate] = useState<string | null>(null);
    const [dayHours, setDayHours] = useState<DayHours | undefined>();
    const [visibleHours, setVisibleHours] = useState<VisibleHours>(WHOLE_DAY);
    // Planning timeline only: "Show all hours" in the more menu, or a click
    // on an earlier / later bar. Session state, not saved.
    const [showAllHours, setShowAllHours] = useState(false);

    useEffect(() => {
        fetchProfile()
            .then((profile) =>
                setVisibleHours(
                    readVisibleHours(
                        profile.ui_settings?.calendar?.visibleHours
                    )
                )
            )
            .catch(() => {});
    }, []);

    const changeVisibleHours = (next: VisibleHours) => {
        setVisibleHours(next);
        updateUiSettings({ calendar: { visibleHours: next } }).catch(() =>
            showErrorToast(
                t('calendar.options.saveError', 'Could not save view options')
            )
        );
    };
    const [started, setStarted] = useState(false);
    const [items, setItems] = useState<DailyPlanItem[]>([]);
    const [candidates, setCandidates] = useState<PlanCandidates | null>(null);
    const [dayTasks, setDayTasks] = useState<Task[]>([]);
    const [wrapUp, setWrapUp] = useState<AiWrapUp | null>(null);
    const [reloadToken, setReloadToken] = useState(0);
    // A task saved from the task pane may appear in or leave the candidate
    // list and the plan, so reload the day rather than patch each list.
    useTaskUpdatedEvent(() => setReloadToken((count) => count + 1));
    // How many suggestions the server was last asked for; null is the
    // Planning setting. "Show more" raises it and the whole list reloads,
    // so the first entries keep their order and refreshes never shrink it.
    const suggestedLimit = useRef<number | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [feedEvents, setFeedEvents] = useState<CalendarEvent[]>([]);
    const shownFeeds = useRef<Set<string>>(new Set());
    const [refreshingEvents, setRefreshingEvents] = useState(false);
    const [durations, setDurations] = useState<Record<string, number>>({});
    const [filter, setFilter] = useState<CandidateFilter>('all');
    const [preferredMode, setPreferredMode] = useState<Mode>(readMode);
    const [panelMode, setPanelMode] = useState<PanelMode>(readPanelMode);
    const [calendarOpen, setCalendarOpen] = useState(() =>
        readCalendarOpen(narrow)
    );
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>(
        'idle'
    );
    const [dragLabel, setDragLabel] = useState<string | null>(null);
    const [busyUid, setBusyUid] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [now, setNow] = useState(() =>
        minuteOfDay(new Date(), getUserTimezone())
    );
    const aiSwitch = useStore(
        (state) => state.userSettingsStore.aiAssistantEnabled
    );
    const aiAllowed = useAiAllowed();
    const aiLocked = useTrialLock('ai');
    const aiEnabled = aiSwitch && aiAllowed;
    const calendarEnabled = useStore(
        (state) => state.userSettingsStore.calendarEnabled
    );
    const [aiEstimates, setAiEstimates] = useState<Record<string, number>>({});
    const [aiDraft, setAiDraft] = useState<{
        summary: string;
        skipped: { task_uid: string; name: string; reason: string }[];
        previous: DailyPlanItem[];
        reasons: Record<string, string>;
    } | null>(null);
    const [drafting, setDrafting] = useState(false);
    const [draftChoiceOpen, setDraftChoiceOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    // Minimal "Completed" section at the foot of the candidate list: the
    // tasks completed today, reloaded when the day's tasks change.
    const isMinimal = useIsMinimal();
    const [completedToday] = useCompletedTasks(
        isMinimal,
        () =>
            fetchTasks('?type=today').then(
                (result) => result.tasks_completed_today ?? []
            ),
        `${reloadToken}|${items.map((item) => item.task_uid).join(',')}|${dayTasks
            .map((task) => `${task.uid}:${task.status}`)
            .join(',')}`
    );
    const draftMenuRef = useDismiss(
        draftChoiceOpen,
        useCallback(() => setDraftChoiceOpen(false), [])
    );
    const moreMenuRef = useDismiss(
        moreOpen,
        useCallback(() => setMoreOpen(false), [])
    );

    const mode: Mode = narrow ? 'list' : preferredMode;
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pending = useRef<DailyPlanItem[] | null>(null);
    const startRequested = useRef(false);

    const isToday = !!date && date === todayString();

    useEffect(() => {
        const timer = setInterval(
            () => setNow(minuteOfDay(new Date(), getUserTimezone())),
            60 * 1000
        );
        return () => clearInterval(timer);
    }, []);

    // The day comes from ?date=; without it, today. Candidates exist for
    // today only, so another day lists its own open due tasks instead.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const scope = focusScopeParams(focus);
                const planResponse = await fetchDailyPlan(
                    requestedDate ?? undefined,
                    scope
                );
                const day = planResponse.date;
                const [dueTasks, candidateList] = await Promise.all([
                    fetchCalendarTasks(day, day).catch(() => [] as Task[]),
                    day === todayString()
                        ? fetchPlanCandidates(undefined, scope)
                        : Promise.resolve(null),
                ]);
                if (cancelled) return;
                setDate(day);
                setDayHours(planResponse.day_hours);
                setStarted(!!planResponse.plan?.started_at);
                setItems(planResponse.plan?.items ?? []);
                setWrapUp(planResponse.plan?.ai_wrap_up ?? null);
                setDayTasks(dueTasks);
                setCandidates(candidateList ?? dayCandidates(dueTasks, day));
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : t('dailyPlan.loadError', 'Could not load today.')
                    );
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [t, focusId, requestedDate, reloadToken]);

    // Calendar feeds belong to the Calendar feature; with it off the day is
    // planned without events, and calendars hidden from Calendar stay out.
    useEffect(() => {
        if (!date || !calendarEnabled) {
            shownFeeds.current = new Set();
            setFeedEvents([]);
            return;
        }
        let cancelled = false;
        (async () => {
            const feeds = await fetchCalendarFeeds().catch(() => []);
            const shown = new Set(
                feeds.filter((feed) => feed.show_on_calendar).map((f) => f.uid)
            );
            shownFeeds.current = shown;
            if (cancelled || shown.size === 0) {
                if (!cancelled) setFeedEvents([]);
                return;
            }
            const day = await fetchCalendarEvents(date).catch(() => null);
            if (!cancelled && day) {
                setFeedEvents(day.events.filter((e) => shown.has(e.feed_uid)));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [date, calendarEnabled]);

    useEffect(() => {
        setProgress(
            isToday && items.length > 0
                ? {
                      done: items.filter(isItemDone).length,
                      total: items.length,
                  }
                : null
        );
    }, [isToday, items, setProgress]);

    // Priorities or due dates changed in another tab or on the task page
    // should reorder the list as soon as the page is back in view.
    useEffect(() => {
        const refresh = () => {
            if (document.visibilityState !== 'visible' || !isToday) return;
            fetchPlanCandidates(suggestedLimit.current, focusScopeParams(focus))
                .then(setCandidates)
                .catch(() => undefined);
        };
        document.addEventListener('visibilitychange', refresh);
        return () => document.removeEventListener('visibilitychange', refresh);
    }, [focusId, isToday]);

    const replaceEvents = useCallback(
        (list: CalendarEvent[]) =>
            setFeedEvents(
                list.filter((e) => shownFeeds.current.has(e.feed_uid))
            ),
        []
    );

    // The server keeps each feed for a while; this asks it to fetch again.
    const refreshEvents = useCallback(async () => {
        if (!date) return;
        setRefreshingEvents(true);
        try {
            const day = await fetchCalendarEvents(date, { refresh: true });
            replaceEvents(day.events);
            if (day.errors.length > 0) {
                showErrorToast(day.errors[0].message);
            }
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t(
                          'dailyPlan.refreshCalendarError',
                          'Could not refresh the calendar.'
                      )
            );
        } finally {
            setRefreshingEvents(false);
        }
    }, [date, replaceEvents, showErrorToast, t]);

    // The save currently on its way to the server, if any: true once saved.
    const inFlight = useRef<Promise<boolean> | null>(null);

    const flush = useCallback(async (): Promise<boolean> => {
        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
            saveTimer.current = null;
        }
        // A save already on its way must land before the caller goes on
        // (starting the day reads the saved plan).
        if (inFlight.current && !(await inFlight.current)) return false;
        const next = pending.current;
        if (!next || !date) return true;
        pending.current = null;
        setSaveState('saving');
        const save = (async () => {
            try {
                await saveDailyPlanItems(date, toPlanItemInputs(next));
                setSaveState('idle');
                return true;
            } catch (err) {
                setSaveState('error');
                showErrorToast(
                    err instanceof Error
                        ? err.message
                        : t('dailyPlan.saveError', 'Could not save the plan.')
                );
                return false;
            }
        })();
        inFlight.current = save;
        const saved = await save;
        if (inFlight.current === save) inFlight.current = null;
        return saved;
    }, [date, showErrorToast, t]);

    // The first placed task starts today, once the plan that holds it has
    // been saved (starting reads the saved plan on the server).
    const startDay = useCallback(async () => {
        if (startRequested.current || !date) return;
        startRequested.current = true;
        try {
            if (!(await flush())) {
                startRequested.current = false;
                return;
            }
            await startDailyPlan(date);
            setStarted(true);
        } catch (err) {
            startRequested.current = false;
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t('dailyPlan.saveError', 'Could not save the plan.')
            );
        }
    }, [date, flush, showErrorToast, t]);

    // Every change saves itself shortly after the last edit.
    const persist = useCallback(
        (next: DailyPlanItem[]) => {
            setItems(next);
            pending.current = next;
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => {
                flush();
            }, SAVE_DELAY_MS);
            if (next.length > 0 && !started && isToday) {
                void startDay();
            }
        },
        [flush, isToday, started, startDay]
    );

    useEffect(
        () => () => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
        },
        []
    );

    // One AI call for rough lengths of the tasks that have none yet.
    const estimatesRequested = useRef(false);
    useEffect(() => {
        if (!aiEnabled || !candidates || estimatesRequested.current) return;
        estimatesRequested.current = true;
        const uids = [
            ...(candidates.tagged_today ?? []),
            ...candidates.overdue,
            ...candidates.due_today,
            ...candidates.in_progress,
            ...candidates.suggested,
        ]
            .filter((task) => task.uid && !task.estimated_minutes)
            .map((task) => task.uid as string)
            .slice(0, 40);
        if (uids.length === 0) return;
        let cancelled = false;
        estimateWithAi(uids)
            .then((estimates) => {
                if (!cancelled) setAiEstimates(estimates);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [aiEnabled, candidates]);

    const calendarEvents = useMemo<CalendarBlock[]>(
        () => [
            ...dayTasks.flatMap((task) =>
                taskToEvents(task as unknown as CalendarTask)
            ),
            ...feedEvents.map((event) =>
                feedToCalendarEvent(event, date ?? '')
            ),
        ],
        [dayTasks, feedEvents, date]
    );
    const range = useMemo(
        () =>
            showAllHours
                ? dayRange(items, feedEvents, { start: 0, end: 24 * 60 })
                : dayRange(
                      items,
                      feedEvents,
                      clampDayHours(
                          dayHours ?? {
                              start: DEFAULT_DAY_START,
                              end: DEFAULT_DAY_END,
                          },
                          visibleHours
                      )
                  ),
        [items, feedEvents, dayHours, visibleHours, showAllHours]
    );
    const freeMinutes = Math.max(
        0,
        range.end - range.start - busyMinutes(feedEvents, range)
    );
    const planned = plannedMinutes(items);
    const plannedMap = useMemo(
        () => new Map(items.map((item) => [item.task_uid, item])),
        [items]
    );
    // Open timed tasks that are not in the plan, outside the visible hours.
    const hiddenHours = useMemo(() => {
        const unplanned = dayTasks
            .filter(
                (task) =>
                    !plannedMap.has(task.uid as string) &&
                    !isTaskDone(task.status)
            )
            .flatMap((task) => taskToEvents(task as unknown as CalendarTask));
        return countOutside(
            unplanned,
            date ? parseISO(date) : new Date(),
            visibleHours
        );
    }, [dayTasks, plannedMap, date, visibleHours]);
    const restrictedHours = visibleHours.start > 0 || visibleHours.end < 24;

    const setMode = (next: Mode) => {
        setPreferredMode(next);
        try {
            localStorage.setItem(MODE_KEY, next);
        } catch {
            // Remembering the mode is a convenience only.
        }
    };

    const choosePanel = (next: PanelMode) => {
        setPanelMode(next);
        writePanelMode(next);
    };

    const toggleCalendar = () => {
        const next = !calendarOpen;
        setCalendarOpen(next);
        writeCalendarOpen(next);
    };

    const goToDay = (days: number) => {
        if (!date) return;
        setSearchParams({ date: addDays(date, days) });
    };

    const goToToday = () => setSearchParams({});

    const durationFor = (task: Task) =>
        (task.uid && durations[task.uid]) ||
        taskLength(task) ||
        (task.uid && aiEstimates[task.uid]) ||
        DEFAULT_DURATION;

    // Several at once (e.g. lines saved together in the Add box) each take
    // the next free slot after the ones before them.
    const addTasks = useCallback(
        (tasks: Task[], startMinute?: number | null, index?: number) => {
            const next = [...items];
            let insertAt = index ?? next.length;
            let noSlot = false;
            for (const task of tasks) {
                if (
                    !task.uid ||
                    next.some((item) => item.task_uid === task.uid)
                ) {
                    continue;
                }
                const duration = durationFor(task);
                let start = startMinute ?? null;
                if (startMinute === undefined && mode === 'timeline') {
                    start = findFreeSlot(
                        next,
                        feedEvents,
                        duration,
                        range,
                        Math.max(now, range.start)
                    );
                    if (start === null) noSlot = true;
                }
                next.splice(insertAt, 0, {
                    task_uid: task.uid,
                    position: next.length,
                    start_minute: start,
                    duration_minutes: duration,
                    task,
                });
                insertAt += 1;

                // The chosen length becomes the task's rough estimate.
                if (task.estimated_minutes !== duration) {
                    updateTask(task.uid, { estimated_minutes: duration }).catch(
                        () => undefined
                    );
                }
            }
            if (next.length === items.length) return;
            if (noSlot) {
                showSuccessToast(
                    t(
                        'dailyPlan.noFreeSlot',
                        'No free slot left today, so it was added without a time.'
                    )
                );
            }
            persist(next);
        },
        [
            items,
            feedEvents,
            range,
            now,
            mode,
            durations,
            aiEstimates,
            persist,
            showSuccessToast,
            t,
        ]
    );

    const addTask = useCallback(
        (task: Task, startMinute?: number | null, index?: number) =>
            addTasks([task], startMinute, index),
        [addTasks]
    );

    const removeItem = (taskUid: string) =>
        persist(items.filter((item) => item.task_uid !== taskUid));

    const updateItem = (taskUid: string, changes: Partial<DailyPlanItem>) =>
        persist(
            items.map((item) =>
                item.task_uid === taskUid ? { ...item, ...changes } : item
            )
        );

    const placeItem = (
        taskUid: string,
        start: number | null,
        duration?: number
    ) => {
        const item = plannedMap.get(taskUid);
        if (!item) return;
        const length = duration ?? item.duration_minutes;
        if (start !== null && overlapsItems(items, start, length, taskUid)) {
            showErrorToast(
                t('dailyPlan.slotTaken', 'That time overlaps another task.')
            );
            return;
        }
        updateItem(taskUid, { start_minute: start, duration_minutes: length });
    };

    const replaceCandidate = useCallback(
        (uid: string | undefined, updated: Task | null) =>
            setCandidates((current) => {
                if (!current || !uid) return current;
                const apply = (tasks: Task[]) =>
                    updated
                        ? tasks.map((task) =>
                              task.uid === uid ? { ...task, ...updated } : task
                          )
                        : tasks.filter((task) => task.uid !== uid);
                return {
                    ...current,
                    tagged_today: current.tagged_today
                        ? apply(current.tagged_today)
                        : current.tagged_today,
                    overdue: apply(current.overdue),
                    due_today: apply(current.due_today),
                    in_progress: apply(current.in_progress),
                    suggested: apply(current.suggested),
                };
            }),
        []
    );

    const removeCandidate = (taskUid: string) =>
        setCandidates((current) =>
            current
                ? {
                      ...current,
                      in_progress: current.in_progress.filter(
                          (x) => x.uid !== taskUid
                      ),
                      overdue: current.overdue.filter((x) => x.uid !== taskUid),
                      due_today: current.due_today.filter(
                          (x) => x.uid !== taskUid
                      ),
                      suggested: current.suggested.filter(
                          (x) => x.uid !== taskUid
                      ),
                      suggested_total: countSuggested(
                          current,
                          current.suggested.some((x) => x.uid === taskUid)
                              ? -1
                              : 0
                      ),
                  }
                : current
        );

    // A round check completes the task, it leaves the list, and Undo puts
    // it back by reopening it and reloading the day.
    const completeCandidate = async (task: Task) => {
        if (!task.uid) return;
        const previousStatus = task.status;
        try {
            await toggleTaskCompletion(task.uid, task);
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t('errors.generic', 'Something went wrong')
            );
            return;
        }
        replaceCandidate(task.uid, null);
        setDayTasks((current) =>
            current.filter((item) => item.uid !== task.uid)
        );
        showUndoToast(
            t('dailyPlan.completed', "'{{name}}' completed.", {
                name: task.name,
            }),
            async () => {
                try {
                    await updateTask(
                        task.uid as string,
                        {
                            status: previousStatus,
                            completed_at: null,
                        } as Partial<Task>
                    );
                    setReloadToken((count) => count + 1);
                } catch (err) {
                    showErrorToast(
                        err instanceof Error
                            ? err.message
                            : t('errors.generic', 'Something went wrong')
                    );
                }
            }
        );
    };

    // Marks a planned block done from the Now card. Recurring tasks reopen,
    // so the plan records the day's occurrence as done itself.
    const completePlanned = async (item: DailyPlanItem) => {
        setBusyUid(item.task_uid);
        try {
            const updated = await toggleTaskCompletion(
                item.task_uid,
                item.task
            );
            const day = date ?? '';
            setItems((current) =>
                current.map((i) =>
                    i.task_uid === item.task_uid
                        ? {
                              ...i,
                              task: { ...i.task, ...updated },
                              occurrence_done: occurrenceDone(updated, day),
                          }
                        : i
                )
            );
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t('dailyPlan.saveError', 'Could not save the plan.')
            );
        } finally {
            setBusyUid(null);
        }
    };

    // Pushing a block later clears its time and sends it to the end.
    const pushLater = (item: DailyPlanItem) => {
        const rest = items.filter((i) => i.task_uid !== item.task_uid);
        persist([...rest, { ...item, start_minute: null }]);
    };

    // Saves a task change from the calendar at once and keeps the server's
    // copy; a failed save reloads the day.
    const saveTaskChange = async (
        task: Task,
        update: Record<string, unknown>
    ) => {
        setDayTasks((current) =>
            current.map((t) =>
                t.uid === task.uid ? ({ ...t, ...update } as Task) : t
            )
        );
        try {
            await updateTask(task.uid as string, update as Partial<Task>);
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t('dailyPlan.saveError', 'Could not save the plan.')
            );
            setReloadToken((count) => count + 1);
        }
    };

    const findDayTask = (eventId: string) =>
        dayTasks.find((task) => String(task.id) === taskIdOf(eventId));

    // A list task or calendar block dropped on a slot or the all-day row of
    // the day calendar: its due date and time follow the drop.
    const dropOnCalendar = async (
        task: Task,
        overId: string,
        block?: CalendarBlock
    ) => {
        if (!date) return;
        const update = dropToDueUpdate(
            task as unknown as CalendarTask,
            overId,
            date,
            block
        );
        if (!update) return;
        await saveTaskChange(task, update);
        setReloadToken((count) => count + 1);
    };

    // The saved length is the task's own length in Calendar mode, so the
    // list row follows it and an unsaved chip choice no longer overrides it.
    const handleCalendarResize = (eventId: string, newEnd: Date) => {
        const task = findDayTask(eventId);
        const event = calendarEvents.find((e) => e.id === eventId);
        if (!task?.uid || !event || event.readOnly) return;
        const update = resizeUpdate(event, newEnd) as Partial<Task>;
        void saveTaskChange(task, update);
        replaceCandidate(task.uid, { ...task, ...update } as Task);
        setDurations((current) =>
            Object.fromEntries(
                Object.entries(current).filter(([uid]) => uid !== task.uid)
            )
        );
    };

    // A candidate dropped on an hour of the calendar becomes due then.
    // The next page of suggestions: everything loaded so far plus one more
    // page, until the server has nothing left.
    const loadMoreCandidates = useCallback(async () => {
        if (!candidates || loadingMore || !isToday) return;
        const total = candidates.suggested_total ?? candidates.suggested.length;
        if (candidates.suggested.length >= total) return;
        const next = Math.min(
            total,
            candidates.suggested.length + SUGGESTIONS_PAGE
        );
        setLoadingMore(true);
        try {
            const list = await fetchPlanCandidates(
                next,
                focusScopeParams(focus)
            );
            suggestedLimit.current = next;
            setCandidates(list);
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t('errors.generic', 'Something went wrong')
            );
        } finally {
            setLoadingMore(false);
        }
    }, [candidates, focus, isToday, loadingMore, showErrorToast, t]);

    const handleReschedule = async (
        task: Task,
        when: 'tomorrow' | 'next_week'
    ) => {
        if (!task.uid || !date) return;
        try {
            await updateTask(task.uid, {
                due_date: addDays(date, when === 'tomorrow' ? 1 : 7),
            });
            removeCandidate(task.uid);
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t('errors.generic', 'Something went wrong')
            );
        }
    };

    const handleDrop = async (task: Task) => {
        if (!task.uid) return;
        try {
            await updateTask(task.uid, { status: TASK_STATUS.CANCELLED });
            removeCandidate(task.uid);
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t('errors.generic', 'Something went wrong')
            );
        }
    };

    // Minimal "+ Add task" field on the candidate list: the task is due on the
    // day being planned (today, unless another day is open).
    const handleInlineCreate = async (name: string) => {
        await createTask({
            name,
            due_date: date ?? todayString(),
            status: TASK_STATUS.NOT_STARTED,
            completed_at: null,
        } as unknown as Task);
        setReloadToken((n) => n + 1);
    };

    const handleAddInbox = async (entry: InboxCandidate) => {
        try {
            const task = await createTask({
                name: (entry.title || entry.content).trim(),
                status: TASK_STATUS.NOT_STARTED,
                completed_at: null,
            });
            await processInboxItem(
                entry.uid,
                task.uid ? { task_uid: task.uid } : undefined
            );
            setCandidates((current) =>
                current
                    ? {
                          ...current,
                          inbox: current.inbox.filter(
                              (i) => i.uid !== entry.uid
                          ),
                          inbox_count: Math.max(0, current.inbox_count - 1),
                          suggested: [task, ...current.suggested],
                          suggested_total: countSuggested(current, 1),
                      }
                    : current
            );
            addTask(task);
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t('errors.generic', 'Something went wrong')
            );
        }
    };

    // Tasks saved from the Add box opened with "Add task" go straight onto
    // today's plan, and Undo there takes them off again.
    const captureHandlers = useRef({ addTasks, persist, items });
    captureHandlers.current = { addTasks, persist, items };
    useEffect(
        () =>
            onCaptureSaved(({ scope, items: captured, undone }) => {
                if (scope !== 'today') return;
                const uids = captured
                    .filter((item) => item.target === 'task' && item.uid)
                    .map((item) => item.uid as string);
                if (uids.length === 0) return;
                if (undone) {
                    const { persist: save, items: current } =
                        captureHandlers.current;
                    save(
                        current.filter((item) => !uids.includes(item.task_uid))
                    );
                    setCandidates((list) =>
                        list
                            ? {
                                  ...list,
                                  suggested: list.suggested.filter(
                                      (task) => !uids.includes(task.uid ?? '')
                                  ),
                                  suggested_total: countSuggested(
                                      list,
                                      -list.suggested.filter((task) =>
                                          uids.includes(task.uid ?? '')
                                      ).length
                                  ),
                              }
                            : list
                    );
                    return;
                }
                Promise.all(uids.map((uid) => fetchTaskByUid(uid)))
                    .then((tasks) => {
                        setCandidates((list) =>
                            list
                                ? {
                                      ...list,
                                      suggested: [...tasks, ...list.suggested],
                                      suggested_total: countSuggested(
                                          list,
                                          tasks.length
                                      ),
                                  }
                                : list
                        );
                        captureHandlers.current.addTasks(tasks);
                    })
                    .catch((err) =>
                        showErrorToast(
                            err instanceof Error
                                ? err.message
                                : t('errors.generic', 'Something went wrong')
                        )
                    );
            }),
        [showErrorToast, t]
    );

    const runDraft = async (draftMode: 'fill' | 'replace') => {
        if (!date) return;
        setDraftChoiceOpen(false);
        setDrafting(true);
        try {
            const draft = await draftDayWithAi(date, draftMode);
            if (draft.items.length === 0) {
                showSuccessToast(
                    t(
                        'dailyPlan.ai.nothingToAdd',
                        'Nothing to add: there is no free time or no task to plan.'
                    )
                );
                return;
            }
            const previous = items;
            const drafted: DailyPlanItem[] = draft.items.map((item, i) => ({
                task_uid: item.task_uid,
                position: i,
                start_minute: item.start_minute,
                duration_minutes: item.duration_minutes,
                task: item.task,
            }));
            persist(draftMode === 'fill' ? [...items, ...drafted] : drafted);
            setAiDraft({
                summary: draft.summary,
                skipped: draft.skipped,
                previous,
                reasons: Object.fromEntries(
                    draft.items.map((item) => [item.task_uid, item.reason])
                ),
            });
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t('dailyPlan.ai.draftError', 'Could not draft the day.')
            );
        } finally {
            setDrafting(false);
        }
    };

    const startDraft = () => {
        if (items.length === 0) {
            void runDraft('replace');
        } else {
            setDraftChoiceOpen((open) => !open);
        }
    };

    const undoDraft = () => {
        if (!aiDraft) return;
        persist(aiDraft.previous);
        setAiDraft(null);
    };

    const allCandidates = useMemo(
        () =>
            candidates
                ? [
                      ...(candidates.tagged_today ?? []),
                      ...candidates.overdue,
                      ...candidates.due_today,
                      ...candidates.in_progress,
                      ...candidates.suggested,
                  ]
                : [],
        [candidates]
    );

    const tips =
        aiEnabled && isToday
            ? buildTips({
                  items,
                  events: feedEvents,
                  candidates: allCandidates,
                  range,
                  now,
                  durationFor,
              })
            : [];

    // The wrap-up is offered once the last timed block is over, or when
    // everything is done.
    const lastEnd = items
        .filter((item) => item.start_minute !== null)
        .reduce((max, item) => Math.max(max, itemEnd(item)), 0);
    const dayIsOver =
        items.length > 0 &&
        (items.every(isItemDone) || (lastEnd > 0 && now >= lastEnd));

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        const data = event.active.data.current as
            | { type: 'candidate'; task: Task }
            | { type: 'item'; item: DailyPlanItem }
            | { type: 'calendar-block'; event: CalendarBlock }
            | undefined;
        if (!data) return;
        // Timeline blocks and list rows move themselves; only cards leaving
        // the left column and untimed tray items need a floating preview.
        if (data.type === 'candidate') {
            setDragLabel(data.task.name);
        } else if (
            data.type === 'item' &&
            mode === 'timeline' &&
            data.item.start_minute === null
        ) {
            setDragLabel(data.item.task.name);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setDragLabel(null);
        const { active, over, delta, activatorEvent } = event;
        const data = active.data.current as
            | { type: 'candidate'; task: Task; duration: number }
            | { type: 'item'; item: DailyPlanItem }
            | { type: 'calendar-block'; event: CalendarBlock }
            | undefined;
        if (!data || !over) return;
        const overId = String(over.id);

        if (overId === 'candidates') {
            if (data.type === 'item') removeItem(data.item.task_uid);
            return;
        }

        if (overId.startsWith('cal-')) {
            if (data.type === 'candidate') {
                void dropOnCalendar(data.task, overId);
            } else if (data.type === 'calendar-block' && !data.event.readOnly) {
                const task = findDayTask(data.event.id);
                if (task) void dropOnCalendar(task, overId, data.event);
            }
            return;
        }
        if (data.type === 'calendar-block') return;

        if (overId === 'timeline') {
            const duration =
                data.type === 'candidate'
                    ? durationFor(data.task)
                    : data.item.duration_minutes;
            let start: number;
            if (data.type === 'item' && data.item.start_minute !== null) {
                start = data.item.start_minute + delta.y / PX_PER_MINUTE;
            } else {
                const y = pointerY(activatorEvent);
                if (y === null) {
                    if (data.type === 'candidate') addTask(data.task);
                    return;
                }
                start =
                    range.start + (y + delta.y - over.rect.top) / PX_PER_MINUTE;
            }
            start = Math.round(start / SLOT_MINUTES) * SLOT_MINUTES;
            start = Math.max(
                range.start,
                Math.min(range.end - duration, start)
            );

            if (data.type === 'candidate') {
                if (overlapsItems(items, start, duration)) {
                    showErrorToast(
                        t(
                            'dailyPlan.slotTaken',
                            'That time overlaps another task.'
                        )
                    );
                    return;
                }
                addTask(data.task, start);
            } else {
                placeItem(data.item.task_uid, start);
            }
            return;
        }

        // List mode: reorder, or insert a candidate where it was dropped.
        const overIndex = overId.startsWith('item:')
            ? items.findIndex((item) => `item:${item.task_uid}` === overId)
            : items.length;
        if (data.type === 'candidate') {
            addTask(data.task, null, overIndex < 0 ? items.length : overIndex);
            return;
        }
        const fromIndex = items.findIndex(
            (item) => item.task_uid === data.item.task_uid
        );
        if (fromIndex >= 0 && overIndex >= 0 && fromIndex !== overIndex) {
            persist(
                arrayMove(
                    items,
                    fromIndex,
                    Math.min(overIndex, items.length - 1)
                )
            );
        }
    };

    const dateLabel = date
        ? new Intl.DateTimeFormat(intlLocale(i18n.language), {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
          }).format(new Date(`${date}T12:00:00`))
        : '';
    const overBooked = planned > freeMinutes;
    const doneCount = items.filter(isItemDone).length;
    const minutesLeft = items
        .filter((item) => !isItemDone(item))
        .reduce((sum, item) => sum + item.duration_minutes, 0);

    if (error) {
        return (
            <div className="flex items-center justify-center p-6">
                <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
        );
    }

    const panelSwitchClass = (active: boolean) =>
        `min-h-[30px] rounded-md px-3 text-xs font-medium ${
            active
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
        }`;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDragLabel(null)}
        >
            <div className="flex h-full w-full flex-col gap-4 px-4 pb-4 pt-4 sm:px-6 lg:px-8">
                <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
                    <div className="flex min-w-[16rem] flex-1 flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => goToDay(-1)}
                            disabled={!date}
                            aria-label={t(
                                'dailyPlan.previousDay',
                                'Previous day'
                            )}
                            className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
                            data-testid="day-prev"
                        >
                            <ChevronLeftIcon className="h-5 w-5" />
                        </button>
                        <h2
                            className="text-2xl font-light"
                            data-testid="day-label"
                        >
                            {dateLabel}
                        </h2>
                        <button
                            type="button"
                            onClick={() => goToDay(1)}
                            disabled={!date}
                            aria-label={t('dailyPlan.nextDay', 'Next day')}
                            className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
                            data-testid="day-next"
                        >
                            <ChevronRightIcon className="h-5 w-5" />
                        </button>
                        {date && !isToday && (
                            <button
                                type="button"
                                onClick={goToToday}
                                className="min-h-[34px] rounded-lg px-3 text-sm font-medium bg-gray-100 text-gray-900 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                                data-testid="day-today"
                            >
                                {t('tasks.today', 'Today')}
                            </button>
                        )}
                    </div>

                    {items.length > 0 && (
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                            {t(
                                'dailyPlan.progress',
                                '{{done}} of {{total}} done',
                                {
                                    done: doneCount,
                                    total: items.length,
                                }
                            )}
                            {minutesLeft > 0 &&
                                ` · ${t('dailyPlan.timeLeft', '{{time}} left', {
                                    time: formatDuration(minutesLeft),
                                })}`}
                        </span>
                    )}

                    {candidates && isToday && (
                        <div
                            className="flex flex-col items-end gap-1 text-[13px]"
                            data-testid="capacity"
                        >
                            <span
                                className={
                                    overBooked
                                        ? 'font-medium text-red-700 dark:text-red-400'
                                        : 'text-gray-600 dark:text-gray-400'
                                }
                            >
                                {t('dailyPlan.planned', '{{time}} planned', {
                                    time: formatDuration(planned),
                                })}{' '}
                                <span className="text-gray-400 dark:text-gray-500">
                                    {t('dailyPlan.ofFree', 'of {{time}} free', {
                                        time: formatDuration(freeMinutes),
                                    })}
                                </span>
                            </span>
                            {overBooked && (
                                <div className="h-1 w-40 rounded-full bg-red-100 dark:bg-red-900/40">
                                    <div className="h-1 w-full rounded-full bg-red-500" />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        {saveState === 'saving' && (
                            <span className="text-xs text-gray-500">
                                {t('dailyPlan.saving', 'Saving…')}
                            </span>
                        )}
                        {refreshingEvents && (
                            <span className="text-xs text-gray-500">
                                {t(
                                    'dailyPlan.refreshingCalendar',
                                    'Refreshing calendar…'
                                )}
                            </span>
                        )}
                        <div className="relative" ref={moreMenuRef}>
                            <button
                                type="button"
                                onClick={() => setMoreOpen((open) => !open)}
                                aria-expanded={moreOpen}
                                aria-label={t('dailyPlan.more', 'More options')}
                                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                                data-testid="plan-more"
                            >
                                <EllipsisHorizontalIcon className="h-5 w-5" />
                            </button>
                            {moreOpen && (
                                <div className="absolute right-0 z-[45] mt-1 flex w-48 flex-col rounded-lg bg-white p-1 text-sm shadow-lg dark:bg-gray-800 dark:bg-gray-900">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMoreOpen(false);
                                            openCapture('task', 'today');
                                        }}
                                        disabled={!date}
                                        className="rounded-md px-3 py-2 text-left hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
                                        data-testid="plan-add-task"
                                    >
                                        {t('dailyPlan.addTask', 'Add task')}
                                    </button>
                                    {calendarEnabled && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMoreOpen(false);
                                                void refreshEvents();
                                            }}
                                            disabled={refreshingEvents || !date}
                                            className="rounded-md px-3 py-2 text-left hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
                                            data-testid="plan-refresh-calendar"
                                        >
                                            {t(
                                                'dailyPlan.refreshCalendar',
                                                'Refresh calendar'
                                            )}
                                        </button>
                                    )}
                                    {mode === 'timeline' &&
                                        (restrictedHours || showAllHours) && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setMoreOpen(false);
                                                    setShowAllHours(
                                                        (current) => !current
                                                    );
                                                }}
                                                className="rounded-md px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                                                data-testid="plan-show-all-hours"
                                            >
                                                {showAllHours
                                                    ? t(
                                                          'calendar.hiddenHours.hide',
                                                          'Hide early and late hours'
                                                      )
                                                    : t(
                                                          'calendar.hiddenHours.show',
                                                          'Show all hours'
                                                      )}
                                            </button>
                                        )}
                                    {!narrow && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMode(
                                                    mode === 'timeline'
                                                        ? 'list'
                                                        : 'timeline'
                                                );
                                                setMoreOpen(false);
                                            }}
                                            className="rounded-md px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                                        >
                                            {mode === 'timeline'
                                                ? t(
                                                      'dailyPlan.switchToList',
                                                      'Switch to list'
                                                  )
                                                : t(
                                                      'dailyPlan.switchToTimeline',
                                                      'Switch to timeline'
                                                  )}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        {aiSwitch && aiLocked && isToday && (
                            <Link
                                to="/subscription/new?feature=ai"
                                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-blue-50 px-3.5 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50"
                                title={t(
                                    'subscription.trialLock.ai',
                                    'The AI assistant is not part of the free trial. Subscribe to turn it on.'
                                )}
                                data-testid="ai-draft-locked"
                            >
                                <LockClosedIcon className="h-4 w-4" />
                                {t('dailyPlan.ai.draft', 'Draft with AI')}
                            </Link>
                        )}
                        {aiEnabled && isToday && (
                            <div className="relative" ref={draftMenuRef}>
                                <button
                                    type="button"
                                    onClick={startDraft}
                                    disabled={drafting || !date}
                                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-violet-100 px-3.5 text-sm font-medium text-violet-700 hover:bg-violet-200 disabled:opacity-60 dark:bg-violet-500/20 dark:text-violet-200 dark:hover:bg-violet-500/30"
                                    data-testid="ai-draft-button"
                                >
                                    <SparklesIcon
                                        className={`h-4 w-4 ${drafting ? 'animate-pulse' : ''}`}
                                    />
                                    {drafting
                                        ? t(
                                              'dailyPlan.ai.drafting',
                                              'Drafting…'
                                          )
                                        : t(
                                              'dailyPlan.ai.draft',
                                              'Draft with AI'
                                          )}
                                </button>
                                {draftChoiceOpen && (
                                    <div className="absolute right-0 z-[45] mt-1 flex w-56 flex-col rounded-lg bg-white p-1 shadow-lg ring-0 dark:bg-gray-800 dark:bg-gray-900">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void runDraft('fill')
                                            }
                                            className="rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                                        >
                                            <span className="block font-medium">
                                                {t(
                                                    'dailyPlan.ai.fill',
                                                    'Fill free time'
                                                )}
                                            </span>
                                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                                                {t(
                                                    'dailyPlan.ai.fillHint',
                                                    'Keep what is planned, add around it'
                                                )}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void runDraft('replace')
                                            }
                                            className="rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                                        >
                                            <span className="block font-medium">
                                                {t(
                                                    'dailyPlan.ai.replace',
                                                    'Start over'
                                                )}
                                            </span>
                                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                                                {t(
                                                    'dailyPlan.ai.replaceHint',
                                                    'Draft the whole day again (you can undo)'
                                                )}
                                            </span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        <button
                            type="button"
                            aria-pressed={calendarOpen}
                            title={
                                calendarOpen
                                    ? t(
                                          'dailyPlan.hideCalendar',
                                          'Hide calendar'
                                      )
                                    : t(
                                          'dailyPlan.showCalendar',
                                          'Show calendar'
                                      )
                            }
                            onClick={toggleCalendar}
                            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium ${
                                calendarOpen
                                    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50'
                                    : 'bg-gray-100 text-gray-900 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800'
                            }`}
                        >
                            <CalendarDaysIcon
                                className="h-4 w-4"
                                aria-hidden="true"
                            />
                            {t('dailyPlan.calendar', 'Calendar')}
                        </button>
                    </div>
                </header>

                {quote && (
                    <p className="-mt-2 font-light text-gray-400 dark:text-gray-500">
                        {quote}
                    </p>
                )}

                {!candidates ? (
                    <p className="p-8 text-gray-500 dark:text-gray-400">
                        {t('common.loading', 'Loading...')}
                    </p>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto md:flex-row md:overflow-hidden">
                        <aside
                            className={`shrink-0 rounded-xl bg-white px-4 py-5 sm:px-5 md:max-h-full md:self-start md:overflow-y-auto dark:bg-gray-900 ${
                                calendarOpen ? 'md:w-[400px]' : 'md:w-full'
                            }`}
                        >
                            {isMinimal && (
                                <div className="mb-4">
                                    <NewTask
                                        onTaskCreate={handleInlineCreate}
                                        placeholder={t(
                                            'tasks.addTaskInline',
                                            '+ Add task'
                                        )}
                                    />
                                </div>
                            )}
                            <CandidateList
                                candidates={candidates}
                                planned={plannedMap}
                                filter={filter}
                                onFilterChange={setFilter}
                                durations={durations}
                                aiEstimates={aiEnabled ? aiEstimates : {}}
                                onDurationChange={(uid, minutes) =>
                                    setDurations((d) => ({
                                        ...d,
                                        [uid]: minutes,
                                    }))
                                }
                                onAdd={(task) => addTask(task)}
                                onComplete={completeCandidate}
                                onRemove={removeItem}
                                onReschedule={handleReschedule}
                                onDrop={handleDrop}
                                onAddInbox={handleAddInbox}
                                onLoadMore={
                                    isToday ? loadMoreCandidates : undefined
                                }
                                loadingMore={loadingMore}
                                today={date ?? ''}
                            />
                            {isMinimal && (
                                <CompletedTasksSection
                                    list="today"
                                    count={completedToday.length}
                                >
                                    <TaskList
                                        tasks={completedToday}
                                        onTaskUpdate={async (task) => {
                                            if (task.uid) {
                                                await updateTask(
                                                    task.uid,
                                                    task
                                                );
                                            }
                                            setReloadToken((n) => n + 1);
                                        }}
                                        onTaskCompletionToggle={() =>
                                            setReloadToken((n) => n + 1)
                                        }
                                        onTaskDelete={async (uid) => {
                                            await deleteTask(uid);
                                            setReloadToken((n) => n + 1);
                                        }}
                                        projects={[]}
                                        hideProjectName
                                        onToggleToday={undefined}
                                        showCompletedTasks
                                    />
                                </CompletedTasksSection>
                            )}
                        </aside>
                        {calendarOpen && date && (
                            <section className="isolate min-w-0 flex-1 rounded-xl bg-white px-4 py-5 sm:px-6 md:max-h-full md:overflow-y-auto dark:bg-gray-900">
                                <div className="mb-4 flex items-center justify-between gap-2">
                                    <div
                                        role="group"
                                        aria-label={t(
                                            'dailyPlan.panelMode',
                                            'Right panel'
                                        )}
                                        className="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800"
                                        data-testid="panel-switch"
                                    >
                                        <button
                                            type="button"
                                            aria-pressed={
                                                panelMode === 'planning'
                                            }
                                            onClick={() =>
                                                choosePanel('planning')
                                            }
                                            className={panelSwitchClass(
                                                panelMode === 'planning'
                                            )}
                                            data-testid="panel-planning"
                                        >
                                            {t(
                                                'dailyPlan.planning',
                                                'Planning'
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            aria-pressed={
                                                panelMode === 'calendar'
                                            }
                                            onClick={() =>
                                                choosePanel('calendar')
                                            }
                                            className={panelSwitchClass(
                                                panelMode === 'calendar'
                                            )}
                                            data-testid="panel-calendar"
                                        >
                                            {t(
                                                'dailyPlan.calendar',
                                                'Calendar'
                                            )}
                                        </button>
                                    </div>
                                    {panelMode === 'calendar' && (
                                        <CalendarHoursMenu
                                            value={visibleHours}
                                            onChange={changeVisibleHours}
                                        />
                                    )}
                                </div>

                                {panelMode === 'calendar' ? (
                                    <DayCalendar
                                        date={date}
                                        events={calendarEvents}
                                        visibleHours={visibleHours}
                                        onEventResize={handleCalendarResize}
                                    />
                                ) : (
                                    <>
                                        {isToday &&
                                            aiEnabled &&
                                            (dayIsOver || !!wrapUp) && (
                                                <WrapUpCard
                                                    date={date}
                                                    wrapUp={wrapUp}
                                                    onGenerated={setWrapUp}
                                                />
                                            )}

                                        {items.length > 0 && (
                                            <div className="mb-3">
                                                <NowCard
                                                    items={items}
                                                    events={feedEvents}
                                                    now={now}
                                                    onDone={completePlanned}
                                                    onPushLater={pushLater}
                                                    busyUid={busyUid}
                                                />
                                            </div>
                                        )}

                                        {aiDraft && (
                                            <section
                                                className="mb-3 flex flex-col gap-2.5 rounded-xl bg-violet-50/70 px-4 py-3 dark:bg-violet-900/15"
                                                data-testid="ai-draft-banner"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <SparklesIcon className="h-4 w-4 shrink-0 text-violet-700 dark:text-violet-300" />
                                                    <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-violet-800 dark:text-violet-300">
                                                        {t(
                                                            'dailyPlan.ai.draftTitle',
                                                            'AI draft'
                                                        )}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={undoDraft}
                                                        className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-800"
                                                        data-testid="ai-draft-undo"
                                                    >
                                                        {t(
                                                            'dailyPlan.ai.undo',
                                                            'Undo'
                                                        )}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setAiDraft(null)
                                                        }
                                                        className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700"
                                                    >
                                                        {t(
                                                            'dailyPlan.ai.keep',
                                                            'Keep'
                                                        )}
                                                    </button>
                                                </div>

                                                <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                                                    {aiDraft.summary ||
                                                        t(
                                                            'dailyPlan.ai.drafted',
                                                            'Here is a draft for your day.'
                                                        )}
                                                </p>

                                                {aiDraft.skipped.length > 0 && (
                                                    <details className="group rounded-lg bg-white/70 px-3 py-2 dark:bg-gray-900/40">
                                                        <summary className="cursor-pointer select-none text-xs font-medium text-gray-700 dark:text-gray-300">
                                                            {t(
                                                                'dailyPlan.ai.skippedCount',
                                                                'Left out ({{count}})',
                                                                {
                                                                    count: aiDraft
                                                                        .skipped
                                                                        .length,
                                                                }
                                                            )}
                                                        </summary>
                                                        <ul className="mt-2 flex flex-col gap-1.5">
                                                            {aiDraft.skipped.map(
                                                                (s) => (
                                                                    <li
                                                                        key={
                                                                            s.task_uid
                                                                        }
                                                                        className="flex flex-col text-sm sm:flex-row sm:gap-2"
                                                                    >
                                                                        <span className="font-medium text-gray-900 dark:text-gray-100 sm:w-64 sm:shrink-0 sm:truncate">
                                                                            {
                                                                                s.name
                                                                            }
                                                                        </span>
                                                                        <span className="text-gray-600 dark:text-gray-400">
                                                                            {
                                                                                s.reason
                                                                            }
                                                                        </span>
                                                                    </li>
                                                                )
                                                            )}
                                                        </ul>
                                                    </details>
                                                )}
                                            </section>
                                        )}

                                        {tips.length > 0 && (
                                            // Sticky above the timeline's own layers; the
                                            // section is isolated so this never rises
                                            // above the navbar and its menu.
                                            <div className="sticky -top-5 z-40 -mx-1 -mt-5 mb-3 bg-white px-1 pb-1 pt-5 dark:bg-gray-900">
                                                <PlanTips
                                                    tips={tips}
                                                    onMoveMissed={() =>
                                                        persist(
                                                            rescheduleMissed(
                                                                items,
                                                                feedEvents,
                                                                range,
                                                                now
                                                            )
                                                        )
                                                    }
                                                    onPlace={(tip) =>
                                                        addTask(
                                                            tip.task,
                                                            tip.start
                                                        )
                                                    }
                                                />
                                            </div>
                                        )}

                                        {mode === 'timeline' ? (
                                            <DayTimeline
                                                aiReasons={aiDraft?.reasons}
                                                items={items}
                                                events={feedEvents}
                                                range={range}
                                                now={now}
                                                onResize={(uid, duration) =>
                                                    placeItem(
                                                        uid,
                                                        plannedMap.get(uid)
                                                            ?.start_minute ??
                                                            null,
                                                        duration
                                                    )
                                                }
                                                onRemove={removeItem}
                                                hiddenEarlier={
                                                    showAllHours
                                                        ? []
                                                        : hiddenHours.before
                                                }
                                                hiddenLater={
                                                    showAllHours
                                                        ? []
                                                        : hiddenHours.after
                                                }
                                                onShowAllHours={() =>
                                                    setShowAllHours(true)
                                                }
                                            />
                                        ) : (
                                            <PlanList
                                                aiReasons={aiDraft?.reasons}
                                                items={items}
                                                onDurationChange={(
                                                    uid,
                                                    duration
                                                ) => {
                                                    const item =
                                                        plannedMap.get(uid);
                                                    placeItem(
                                                        uid,
                                                        item?.start_minute ??
                                                            null,
                                                        duration
                                                    );
                                                }}
                                                onTimeChange={(uid, start) =>
                                                    placeItem(uid, start)
                                                }
                                                onRemove={removeItem}
                                            />
                                        )}
                                    </>
                                )}
                            </section>
                        )}
                    </div>
                )}
            </div>

            <DragOverlay dropAnimation={null}>
                {dragLabel ? (
                    <div className="pointer-events-none max-w-xs truncate rounded-md bg-blue-100 px-3 py-2 text-[13px] font-medium text-blue-950 shadow-lg dark:bg-blue-900 dark:text-blue-50">
                        {dragLabel}
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

export default TodayPage;
