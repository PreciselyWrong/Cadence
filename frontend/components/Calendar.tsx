import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../entities/Task';
import { Project } from '../entities/Project';
import { updateTask } from '../utils/tasksService';
import {
    CalendarFeed,
    CalendarRangeEvent,
    fetchCalendarEventsRange,
    fetchCalendarFeeds,
    updateCalendarFeed,
} from '../utils/calendarFeedsService';
import CalendarFeedsManager from './CalendarFeeds/CalendarFeedsManager';
import {
    GoogleCalendar,
    GoogleEventInput,
    GoogleStatus,
    createGoogleEvent,
    deleteGoogleEvent,
    fetchGoogleStatus,
    updateGoogleCalendar,
    updateGoogleEvent,
} from '../utils/googleSyncService';
import GoogleEventModal, {
    GoogleEventDraft,
} from './Calendar/GoogleEventModal';
import { useToast } from './Shared/ToastContext';
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    XMarkIcon,
    Cog6ToothIcon,
    ArrowTopRightOnSquareIcon,
    CalendarDaysIcon,
    ClockIcon,
    FolderIcon,
    TagIcon,
    PrinterIcon,
} from '@heroicons/react/24/outline';
import {
    format,
    addWeeks,
    addDays,
    addMonths,
    startOfMonth,
    endOfMonth,
    subDays,
    startOfYear,
    endOfYear,
} from 'date-fns';
import { el, enUS, es, ja, uk, de } from 'date-fns/locale';
import CalendarMonthView from './Calendar/CalendarMonthView';
import CalendarWeekView from './Calendar/CalendarWeekView';
import CalendarDayView from './Calendar/CalendarDayView';
import CalendarAgendaView from './Calendar/CalendarAgendaView';
import CalendarYearView, { MonthGrid } from './Calendar/CalendarYearView';
import { getApiPath } from '../config/paths';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
    CalendarEvent,
    moveUpdate,
    resizeUpdate,
    taskIdOf,
    taskToEvents,
} from './Calendar/taskEvents';
import { parseDateString } from '../utils/dateUtils';
import { Holiday, fetchHolidays } from '../utils/holidaysService';
import {
    FocusSession,
    fetchFocusSessions,
} from '../utils/focusSessionsService';
import ArrangePanel, { ARRANGE_DRAG_PREFIX } from './Calendar/ArrangePanel';
import ViewOptions, {
    CalendarOptions,
    DEFAULT_CALENDAR_OPTIONS,
    isWeekend,
    readCalendarOptions,
    visibleTasks,
} from './Calendar/ViewOptions';
import {
    fetchProfile,
    getFirstDayOfWeek,
    getLocaleFirstDayOfWeek,
    updateUiSettings,
} from '../utils/profileService';

const getLocale = (language: string) => {
    switch (language) {
        case 'el':
            return el;
        case 'es':
            return es;
        case 'jp':
            return ja;
        case 'ua':
            return uk;
        case 'de':
            return de;
        default:
            return enUS;
    }
};

const localDate = (day: string, minute = 0) => {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date, 0, minute);
};

const feedEventToCalendarEvent = (event: CalendarRangeEvent): CalendarEvent => {
    const start = localDate(event.date, event.start_minute ?? 0);
    const end = event.all_day
        ? localDate(event.date, 24 * 60)
        : localDate(event.date, event.end_minute ?? event.start_minute ?? 0);
    const shown: CalendarEvent = {
        id: `feed-${event.feed_uid}-${event.uid}-${event.date}-${event.start_minute ?? 'all-day'}`,
        title: event.title || event.feed_name,
        start,
        end,
        type: 'event',
        color: event.color || '#6b7280',
        feedUid: event.feed_uid,
        allDay: !!event.all_day,
    };
    if (event.source !== 'google' || !event.calendar_uid || !event.event_id) {
        return shown;
    }
    // A piece drawn on another day than the event's start is not resized:
    // its bottom edge is not the event's end.
    const singleDay =
        !event.all_day &&
        format(new Date(event.start), 'yyyy-MM-dd') === event.date &&
        format(new Date(event.end), 'yyyy-MM-dd') === event.date;
    return {
        ...shown,
        id: `gevt-${event.calendar_uid}-${event.event_id}-${event.date}-${event.start_minute ?? 'all-day'}`,
        editable: !!event.editable,
        resize: event.editable && singleDay ? 'due' : undefined,
        google: {
            calendarUid: event.calendar_uid,
            eventId: event.event_id,
            allDay: !!event.all_day,
            start: event.start,
            end: event.end,
            recurring: !!event.recurring,
            htmlLink: event.html_link,
            location: event.location,
            description: event.description,
        },
    };
};

const dayOf = (value: string) => {
    const [year, month, date] = value.split('-').map(Number);
    return new Date(year, month - 1, date);
};

// Where a whole Google event lands when the piece drawn on one day is
// dropped at `newStart`.
const shiftGoogleEvent = (
    event: CalendarEvent,
    newStart: Date
): GoogleEventInput => {
    const google = event.google!;
    if (google.allDay) {
        const days = Math.round(
            (newStart.getTime() -
                localDate(format(event.start, 'yyyy-MM-dd')).getTime()) /
                86400000
        );
        return {
            all_day: true,
            start_date: format(
                addDays(dayOf(google.start), days),
                'yyyy-MM-dd'
            ),
            end_date: format(addDays(dayOf(google.end), days), 'yyyy-MM-dd'),
        };
    }
    const delta = newStart.getTime() - event.start.getTime();
    return {
        all_day: false,
        start: new Date(new Date(google.start).getTime() + delta).toISOString(),
        end: new Date(new Date(google.end).getTime() + delta).toISOString(),
    };
};

const focusToEvent = (session: FocusSession, label: string): CalendarEvent => ({
    id: `focus-${session.uid}`,
    title: session.task ? `${label}: ${session.task.name}` : label,
    start: new Date(session.started_at),
    end: new Date(session.ended_at),
    type: 'event',
    color: '#f97316',
    readOnly: true,
});

const holidayToEvent = (holiday: Holiday): CalendarEvent => {
    const start = localDate(holiday.date);
    return {
        id: `holiday-${holiday.date}`,
        title: holiday.name,
        start,
        end: addDays(start, 1),
        type: 'event',
        color: '#ef4444',
        allDay: true,
        readOnly: true,
    };
};

const Calendar: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { showErrorToast, showSuccessToast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState<
        'year' | 'month' | 'week' | 'multi' | 'day' | 'agenda'
    >('month');
    const [firstDayOfWeek, setFirstDayOfWeek] = useState(1);
    const [miniMonth, setMiniMonth] = useState(new Date());
    const [isLoadingTasks, setIsLoadingTasks] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [allTasks, setAllTasks] = useState<any[]>([]);
    const [, setProjects] = useState<Project[]>([]);
    const [isEventDetailModalOpen, setIsEventDetailModalOpen] = useState(false);
    const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
    const [feedsLoading, setFeedsLoading] = useState(true);
    const [feedEvents, setFeedEvents] = useState<CalendarRangeEvent[]>([]);
    const [feedErrors, setFeedErrors] = useState<string[]>([]);
    const [isManagerOpen, setIsManagerOpen] = useState(false);
    const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
    const [googleDraft, setGoogleDraft] = useState<GoogleEventDraft | null>(
        null
    );
    // Bumped to reload calendar events after a change.
    const [feedsVersion, setFeedsVersion] = useState(0);
    const [isArrangeOpen, setIsArrangeOpen] = useState(false);
    const [options, setOptions] = useState<CalendarOptions>(
        DEFAULT_CALENDAR_OPTIONS
    );

    const locale = getLocale(i18n.language);

    useEffect(() => {
        loadProjects();
    }, []);

    useEffect(() => {
        fetchCalendarFeeds()
            .then(setFeeds)
            .catch(() =>
                showErrorToast(
                    t('profile.calendars.loadError', 'Could not load calendars')
                )
            )
            .finally(() => setFeedsLoading(false));
    }, []);

    // Google: load the connection; after Google sends the browser back
    // here, say how it went and pick up the first sync once it is done.
    useEffect(() => {
        const loadGoogle = () =>
            fetchGoogleStatus()
                .then((status) => {
                    setGoogleStatus(status);
                    setFeedsVersion((v) => v + 1);
                })
                .catch(() => {});
        loadGoogle();
        const params = new URLSearchParams(location.search);
        const result = params.get('google');
        if (!result) return;
        if (result === 'connected') {
            showSuccessToast(
                t('calendar.google.connected', 'Google connected')
            );
        } else {
            showErrorToast(
                params.get('message') ||
                    t(
                        'calendar.google.connectError',
                        'Google was not connected'
                    )
            );
        }
        navigate(location.pathname, { replace: true });
        if (result === 'connected') {
            const timer = setTimeout(loadGoogle, 8000);
            return () => clearTimeout(timer);
        }
    }, []);

    const googleCalendars: GoogleCalendar[] = googleStatus?.sync_events
        ? (googleStatus.calendars || []).filter(
              (calendar) => !calendar.is_tududi
          )
        : [];
    const writableGoogle = googleCalendars.filter((c) => c.writable);

    // Month, week and day views all draw from one month-sized window (padded
    // a week each side), so paging within a month never refetches.
    const visibleMonth = format(currentDate, 'yyyy-MM');
    const feedUidsKey = [
        ...feeds.map((feed) => feed.uid),
        ...googleCalendars.map((calendar) => calendar.feed_uid),
    ].join(',');
    const windowStart = format(
        subDays(startOfMonth(currentDate), 7),
        'yyyy-MM-dd'
    );
    const windowEnd = format(addDays(endOfMonth(currentDate), 7), 'yyyy-MM-dd');

    // Recurring tasks add their later occurrences up to the window's end.
    useEffect(() => {
        loadTasks();
    }, [visibleMonth]);

    useEffect(() => {
        if (!feedUidsKey) {
            setFeedEvents([]);
            setFeedErrors([]);
            return;
        }
        let cancelled = false;
        const monthStart = startOfMonth(currentDate);
        fetchCalendarEventsRange(
            format(subDays(monthStart, 7), 'yyyy-MM-dd'),
            format(addDays(endOfMonth(monthStart), 7), 'yyyy-MM-dd')
        )
            .then((data) => {
                if (cancelled) return;
                setFeedEvents(data.events);
                setFeedErrors(data.errors.map((error) => error.feed_uid));
            })
            .catch(() => {
                if (cancelled) return;
                setFeedEvents([]);
                setFeedErrors(feedUidsKey.split(','));
            });
        return () => {
            cancelled = true;
        };
    }, [visibleMonth, feedUidsKey, feedsVersion]);

    useEffect(() => {
        getFirstDayOfWeek()
            .then(setFirstDayOfWeek)
            .catch(() =>
                setFirstDayOfWeek(getLocaleFirstDayOfWeek(navigator.language))
            );
    }, []);

    // The mini calendar follows the shown date.
    useEffect(() => {
        setMiniMonth(currentDate);
    }, [visibleMonth]);

    useEffect(() => {
        fetchProfile()
            .then((profile) =>
                setOptions(readCalendarOptions(profile.ui_settings?.calendar))
            )
            .catch(() => {});
    }, []);

    const changeOptions = (next: CalendarOptions) => {
        setOptions(next);
        updateUiSettings({ calendar: next }).catch(() =>
            showErrorToast(
                t('calendar.options.saveError', 'Could not save view options')
            )
        );
    };

    const events = useMemo(
        () =>
            visibleTasks(allTasks, options).flatMap((task) =>
                taskToEvents(task, options.colorBy)
            ),
        [allTasks, options]
    );

    // Finished focus sessions in the loaded window.
    const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
    useEffect(() => {
        if (!options.showFocus) {
            setFocusSessions([]);
            return;
        }
        let cancelled = false;
        fetchFocusSessions(windowStart, windowEnd)
            .then((list) => !cancelled && setFocusSessions(list || []))
            .catch(() => !cancelled && setFocusSessions([]));
        return () => {
            cancelled = true;
        };
    }, [options.showFocus, windowStart, windowEnd]);

    // Public holidays of the chosen country for the loaded window.
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    useEffect(() => {
        if (!options.holidayCountry) {
            setHolidays([]);
            return;
        }
        let cancelled = false;
        fetchHolidays(
            options.holidayCountry,
            options.holidayRegion,
            view === 'year'
                ? format(startOfYear(currentDate), 'yyyy-MM-dd')
                : windowStart,
            view === 'year'
                ? format(endOfYear(currentDate), 'yyyy-MM-dd')
                : windowEnd
        )
            .then((list) => !cancelled && setHolidays(list || []))
            .catch(() => !cancelled && setHolidays([]));
        return () => {
            cancelled = true;
        };
    }, [
        options.holidayCountry,
        options.holidayRegion,
        windowStart,
        windowEnd,
        view === 'year' ? currentDate.getFullYear() : 0,
    ]);

    const shownFeedUids = new Set([
        ...feeds
            .filter((feed) => feed.show_on_calendar)
            .map((feed) => feed.uid),
        ...googleCalendars
            .filter((calendar) => calendar.show_on_calendar)
            .map((calendar) => calendar.feed_uid),
    ]);
    const calendarEvents = [
        ...holidays.map(holidayToEvent),
        ...focusSessions.map((session) =>
            focusToEvent(session, t('calendar.focusSession', 'Focus'))
        ),
        ...events,
        ...feedEvents
            .filter((event) => shownFeedUids.has(event.feed_uid))
            .map(feedEventToCalendarEvent),
    ];
    const failedFeedNames = feeds
        .filter(
            (feed) => feed.show_on_calendar && feedErrors.includes(feed.uid)
        )
        .map((feed) => feed.name);

    const toggleFeed = async (feed: CalendarFeed) => {
        const apply = (value: boolean) =>
            setFeeds((current) =>
                current.map((f) =>
                    f.uid === feed.uid ? { ...f, show_on_calendar: value } : f
                )
            );
        const next = !feed.show_on_calendar;
        apply(next);
        try {
            await updateCalendarFeed(feed.uid, { show_on_calendar: next });
        } catch {
            apply(!next);
            showErrorToast(
                t(
                    'profile.calendars.toggleError',
                    'Could not update that calendar'
                )
            );
        }
    };

    const toggleGoogleCalendar = async (calendar: GoogleCalendar) => {
        const apply = (value: boolean) =>
            setGoogleStatus((current) =>
                current
                    ? {
                          ...current,
                          calendars: current.calendars.map((c) =>
                              c.uid === calendar.uid
                                  ? { ...c, show_on_calendar: value }
                                  : c
                          ),
                      }
                    : current
            );
        const next = !calendar.show_on_calendar;
        apply(next);
        try {
            await updateGoogleCalendar(calendar.uid, {
                show_on_calendar: next,
            });
        } catch {
            apply(!next);
            showErrorToast(
                t(
                    'profile.calendars.toggleError',
                    'Could not update that calendar'
                )
            );
        }
    };

    const saveGoogleChange = async (
        event: CalendarEvent,
        input: GoogleEventInput
    ) => {
        const google = event.google!;
        try {
            await updateGoogleEvent(google.calendarUid, google.eventId, input);
        } catch (error) {
            showErrorToast(
                error instanceof Error
                    ? error.message
                    : t('calendar.google.saveError', 'Could not save the event')
            );
        }
        setFeedsVersion((v) => v + 1);
    };

    const openGoogleDraft = (draft: GoogleEventDraft) => {
        if (!writableGoogle.length) return;
        setGoogleDraft(draft);
    };

    const loadTasks = async () => {
        setIsLoadingTasks(true);
        try {
            const response = await fetch(
                getApiPath(
                    `tasks?type=calendar&start=${windowStart}&end=${windowEnd}`
                ),
                {
                    credentials: 'include',
                }
            );
            if (response.ok) {
                const data = await response.json();
                let tasks;
                if (Array.isArray(data)) {
                    tasks = data;
                } else if (data && Array.isArray(data.tasks)) {
                    tasks = data.tasks;
                } else if (data && data.data && Array.isArray(data.data)) {
                    tasks = data.data;
                } else {
                    tasks = [];
                }
                setAllTasks(tasks);
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
        } finally {
            setIsLoadingTasks(false);
        }
    };

    const loadProjects = async () => {
        try {
            const response = await fetch(getApiPath('projects'), {
                credentials: 'include',
            });
            if (response.ok) {
                const projectsData = await response.json();
                setProjects(Array.isArray(projectsData) ? projectsData : []);
            }
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    };

    const navigateView = (direction: 'prev' | 'next') => {
        setCurrentDate((prev) => {
            if (view === 'year') {
                const newDate = new Date(prev);
                newDate.setFullYear(
                    prev.getFullYear() + (direction === 'prev' ? -1 : 1)
                );
                return newDate;
            }
            if (view === 'month' || view === 'agenda') {
                const newDate = new Date(prev);
                if (direction === 'prev') {
                    newDate.setMonth(prev.getMonth() - 1);
                } else {
                    newDate.setMonth(prev.getMonth() + 1);
                }
                return newDate;
            } else if (view === 'week') {
                return direction === 'prev'
                    ? addWeeks(prev, -1)
                    : addWeeks(prev, 1);
            } else if (view === 'multi') {
                return addDays(
                    prev,
                    (direction === 'prev' ? -1 : 1) * options.multiDayCount
                );
            } else {
                // Without weekends, the day view steps over them.
                let next = addDays(prev, direction === 'prev' ? -1 : 1);
                while (!options.showWeekends && isWeekend(next)) {
                    next = addDays(next, direction === 'prev' ? -1 : 1);
                }
                return next;
            }
        });
    };

    const goToToday = () => setCurrentDate(new Date());

    // Prints only the shown view (see the print rules in tailwind.css).
    const printCalendar = () => {
        document.body.classList.add('printing-calendar');
        const done = () => {
            document.body.classList.remove('printing-calendar');
            window.removeEventListener('afterprint', done);
        };
        window.addEventListener('afterprint', done);
        window.print();
    };

    // A day clicked: a new all-day event in Google.
    const handleDateClick = (date: Date) => {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        openGoogleDraft({
            title: '',
            allDay: true,
            start,
            end: addDays(start, 1),
        });
    };

    const handleEventClick = (event: CalendarEvent) => {
        if (event.google) {
            if (!event.editable) {
                if (event.google.htmlLink) {
                    window.open(event.google.htmlLink, '_blank', 'noopener');
                }
                return;
            }
            const google = event.google;
            setGoogleDraft({
                calendarUid: google.calendarUid,
                eventId: google.eventId,
                title: event.title,
                allDay: google.allDay,
                start: google.allDay
                    ? dayOf(google.start)
                    : new Date(google.start),
                end: google.allDay ? dayOf(google.end) : new Date(google.end),
                location: google.location,
                description: google.description,
                htmlLink: google.htmlLink,
                recurring: google.recurring,
            });
            return;
        }
        if (event.type === 'task') {
            const task = findTask(event.id);
            if (task) {
                const taskEntity: Task = {
                    ...task,
                    name:
                        task.original_name ||
                        task.name ||
                        task.title ||
                        `Task ${task.id}`,
                    priority: task.priority || 'low',
                    status: task.status || 'not_started',
                    tags: task.tags || [],
                    note: task.note || task.description || '',
                    due_date: task.due_date,
                    created_at: task.created_at,
                    completed_at: task.completed_at,
                    project_id: task.project_id,
                };
                setSelectedTask(taskEntity);
                setIsEventDetailModalOpen(true);
            }
        }
    };

    // An empty hour clicked: a new one-hour event in Google.
    const handleTimeSlotClick = (date: Date, hour: number) => {
        const start = new Date(date);
        start.setHours(hour, 0, 0, 0);
        openGoogleDraft({
            title: '',
            allDay: false,
            start,
            end: new Date(start.getTime() + 60 * 60 * 1000),
        });
    };

    const handleEditTask = () => {
        if (selectedTask?.uid) {
            setIsEventDetailModalOpen(false);
            const targetUid = selectedTask.uid;
            setSelectedTask(null);
            navigate(`/task/${targetUid}`, {
                state: { from: location.pathname + location.search },
            });
        }
    };

    const findTask = (eventId: string) => {
        const taskId = taskIdOf(eventId);
        return allTasks.find(
            (t) => t.id.toString() === taskId && !t.is_virtual_occurrence
        );
    };

    // Shows the change at once, saves it, then keeps what the server
    // returns (or reloads everything if the save fails).
    const saveTaskChange = async (
        task: any,
        update: Record<string, unknown>
    ) => {
        const replace = (next: any) =>
            setAllTasks((prev) =>
                prev.map((t) =>
                    t.id === task.id && !t.is_virtual_occurrence ? next : t
                )
            );
        replace({ ...task, ...update });
        try {
            const saved: any = await updateTask(
                task.uid,
                update as Partial<Task>
            );
            // A recurring task's later occurrences follow its new date.
            if (task.recurrence_type && task.recurrence_type !== 'none') {
                await loadTasks();
                return;
            }
            replace({ ...task, ...update, ...(saved || {}) });
        } catch (error) {
            console.error('Error updating task:', error);
            await loadTasks();
        }
    };

    const handleEventDrop = async (
        eventId: string,
        newDate: Date,
        newHour?: number
    ) => {
        if (eventId.startsWith(ARRANGE_DRAG_PREFIX)) {
            const task = findTask(eventId.slice(ARRANGE_DRAG_PREFIX.length));
            if (!task?.uid) return;
            const update: Record<string, unknown> = {
                due_date: format(newDate, 'yyyy-MM-dd'),
            };
            if (newHour !== undefined) {
                update.due_time = `${String(newHour).padStart(2, '0')}:00`;
            }
            await saveTaskChange(task, update);
            return;
        }

        const googleEvent = calendarEvents.find(
            (e) => e.id === eventId && e.google
        );
        if (googleEvent) {
            if (!googleEvent.editable) return;
            const newStart = new Date(newDate);
            if (newHour !== undefined && !googleEvent.allDay) {
                newStart.setHours(newHour, 0, 0, 0);
            } else if (googleEvent.allDay) {
                newStart.setHours(0, 0, 0, 0);
            } else {
                newStart.setHours(
                    googleEvent.start.getHours(),
                    googleEvent.start.getMinutes(),
                    0,
                    0
                );
            }
            await saveGoogleChange(
                googleEvent,
                shiftGoogleEvent(googleEvent, newStart)
            );
            return;
        }

        const task = findTask(eventId);
        const event = events.find((e) => e.id === eventId);
        if (!task?.uid || !event || event.readOnly) return;

        const newStart = new Date(newDate);
        if (newHour !== undefined && !event.allDay) {
            newStart.setHours(newHour, 0, 0, 0);
        } else {
            newStart.setHours(
                event.start.getHours(),
                event.start.getMinutes(),
                0,
                0
            );
        }

        await saveTaskChange(task, moveUpdate(task, event, newStart));
    };

    const handleEventResize = async (eventId: string, newEnd: Date) => {
        const googleEvent = calendarEvents.find(
            (e) => e.id === eventId && e.google
        );
        if (googleEvent) {
            if (!googleEvent.editable || googleEvent.google!.allDay) return;
            await saveGoogleChange(googleEvent, {
                all_day: false,
                start: googleEvent.google!.start,
                end: newEnd.toISOString(),
            });
            return;
        }
        const task = findTask(eventId);
        const event = events.find((e) => e.id === eventId);
        if (!task?.uid || !event?.resize) return;
        await saveTaskChange(task, resizeUpdate(event, newEnd));
    };

    return (
        <div className="h-full flex flex-col px-4 sm:px-6 lg:px-8 pt-4">
            <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col min-h-0">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                    <div>
                        <h2 className="text-2xl font-light dark:text-white">
                            {t('sidebar.calendar')}
                        </h2>
                        <span className="text-sm text-gray-400 dark:text-gray-500">
                            {format(
                                currentDate,
                                view === 'year' ? 'yyyy' : 'MMMM yyyy',
                                { locale }
                            )}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* View selector */}
                        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 border border-gray-200 dark:border-gray-600">
                            {(
                                [
                                    'year',
                                    'month',
                                    'week',
                                    'multi',
                                    'day',
                                    'agenda',
                                ] as const
                            ).map((viewType) => (
                                <button
                                    key={viewType}
                                    onClick={() => setView(viewType)}
                                    className={`px-3 py-1.5 text-sm font-medium capitalize rounded-md transition-all duration-150 ${
                                        view === viewType
                                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                >
                                    {viewType === 'multi'
                                        ? t('calendar.multiDay', {
                                              count: options.multiDayCount,
                                              defaultValue: '{{count}} days',
                                          })
                                        : t(`calendar.${viewType}`, viewType)}
                                </button>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={printCalendar}
                            aria-label={t('calendar.print', 'Print')}
                            title={t('calendar.print', 'Print')}
                            className="p-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-all"
                        >
                            <PrinterIcon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                        </button>

                        <ViewOptions
                            options={options}
                            onChange={changeOptions}
                        />

                        {/* Navigation */}
                        <button
                            onClick={() => navigateView('prev')}
                            className="p-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 hover:shadow-sm transition-all"
                        >
                            <ChevronLeftIcon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                        </button>

                        <button
                            onClick={goToToday}
                            className="px-3 py-1.5 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            {t('calendar.today')}
                        </button>

                        <button
                            onClick={() => navigateView('next')}
                            className="p-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 hover:shadow-sm transition-all"
                        >
                            <ChevronRightIcon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                        </button>
                    </div>
                </div>

                {/* Calendars: show or hide each connected calendar */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    {feeds.map((feed) => (
                        <button
                            key={feed.uid}
                            type="button"
                            role="switch"
                            aria-checked={feed.show_on_calendar}
                            onClick={() => void toggleFeed(feed)}
                            title={
                                feed.show_on_calendar
                                    ? t(
                                          'calendar.hideCalendar',
                                          'Hide {{name}}',
                                          {
                                              name: feed.name,
                                          }
                                      )
                                    : t(
                                          'calendar.showCalendar',
                                          'Show {{name}}',
                                          {
                                              name: feed.name,
                                          }
                                      )
                            }
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm transition-colors ${
                                feed.show_on_calendar
                                    ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                                    : 'bg-transparent text-gray-400 line-through hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-800'
                            }`}
                        >
                            <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{
                                    backgroundColor: feed.show_on_calendar
                                        ? feed.color || '#6b7280'
                                        : 'transparent',
                                    boxShadow: `inset 0 0 0 2px ${feed.color || '#6b7280'}`,
                                }}
                            />
                            {feed.name}
                        </button>
                    ))}
                    {googleCalendars.map((calendar) => (
                        <button
                            key={calendar.uid}
                            type="button"
                            role="switch"
                            aria-checked={calendar.show_on_calendar}
                            onClick={() => void toggleGoogleCalendar(calendar)}
                            title={
                                calendar.show_on_calendar
                                    ? t(
                                          'calendar.hideCalendar',
                                          'Hide {{name}}',
                                          {
                                              name: calendar.name,
                                          }
                                      )
                                    : t(
                                          'calendar.showCalendar',
                                          'Show {{name}}',
                                          {
                                              name: calendar.name,
                                          }
                                      )
                            }
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm transition-colors ${
                                calendar.show_on_calendar
                                    ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                                    : 'bg-transparent text-gray-400 line-through hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-800'
                            }`}
                        >
                            <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{
                                    backgroundColor: calendar.show_on_calendar
                                        ? calendar.color || '#6b7280'
                                        : 'transparent',
                                    boxShadow: `inset 0 0 0 2px ${calendar.color || '#6b7280'}`,
                                }}
                            />
                            {calendar.name}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setIsArrangeOpen((open) => !open)}
                        aria-pressed={isArrangeOpen}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors ${
                            isArrangeOpen
                                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                        }`}
                    >
                        <ClockIcon className="h-4 w-4" />
                        {t('calendar.arrange.title', 'Arrange tasks')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsManagerOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
                    >
                        <Cog6ToothIcon className="h-4 w-4" />
                        {t('calendar.manageCalendars', 'Calendars')}
                    </button>
                    {failedFeedNames.length > 0 && (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                            {t(
                                'calendar.feedError',
                                'Could not load: {{names}}',
                                { names: failedFeedNames.join(', ') }
                            )}
                        </span>
                    )}
                </div>

                {/* Loading indicator */}
                {isLoadingTasks && (
                    <div className="text-center py-3 px-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800 mb-3">
                        <span className="text-sm text-blue-600 dark:text-blue-400">
                            {t('calendar.loadingTasks')}
                        </span>
                    </div>
                )}

                {/* Calendar view */}
                <div className="flex-1 overflow-hidden min-h-0 flex gap-3">
                    {options.showMiniCalendar && (
                        <aside
                            aria-label={t(
                                'calendar.miniCalendar',
                                'Mini calendar'
                            )}
                            className="hidden lg:block w-56 shrink-0 self-start bg-white dark:bg-gray-700 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 p-3"
                        >
                            <div className="mb-2 flex items-center justify-between">
                                <button
                                    type="button"
                                    aria-label={t(
                                        'calendar.previousMonth',
                                        'Previous month'
                                    )}
                                    onClick={() =>
                                        setMiniMonth((m) => addMonths(m, -1))
                                    }
                                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
                                >
                                    <ChevronLeftIcon className="h-3.5 w-3.5 text-gray-500" />
                                </button>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    {format(miniMonth, 'MMMM yyyy', { locale })}
                                </span>
                                <button
                                    type="button"
                                    aria-label={t(
                                        'calendar.nextMonth',
                                        'Next month'
                                    )}
                                    onClick={() =>
                                        setMiniMonth((m) => addMonths(m, 1))
                                    }
                                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
                                >
                                    <ChevronRightIcon className="h-3.5 w-3.5 text-gray-500" />
                                </button>
                            </div>
                            <MonthGrid
                                month={miniMonth}
                                weekStartsOn={
                                    firstDayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6
                                }
                                selected={currentDate}
                                onDayClick={setCurrentDate}
                                compact
                            />
                        </aside>
                    )}
                    <div
                        className="flex-1 overflow-hidden min-h-0"
                        data-print-area
                    >
                        {view === 'year' && (
                            <CalendarYearView
                                currentDate={currentDate}
                                events={events}
                                weekStartsOn={
                                    firstDayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6
                                }
                                onDayClick={(day) => {
                                    setCurrentDate(day);
                                    setView('day');
                                }}
                            />
                        )}
                        {view === 'month' && (
                            <CalendarMonthView
                                currentDate={currentDate}
                                events={calendarEvents}
                                onDateClick={handleDateClick}
                                onEventClick={handleEventClick}
                                onEventDrop={handleEventDrop}
                                showWeekends={options.showWeekends}
                                showWeekNumbers={options.showWeekNumbers}
                            />
                        )}
                        {view === 'week' && (
                            <CalendarWeekView
                                currentDate={currentDate}
                                events={calendarEvents}
                                onDateClick={handleDateClick}
                                onEventClick={handleEventClick}
                                onTimeSlotClick={handleTimeSlotClick}
                                onEventDrop={handleEventDrop}
                                onEventResize={handleEventResize}
                                showWeekends={options.showWeekends}
                                showWeekNumbers={options.showWeekNumbers}
                                visibleHours={options.visibleHours}
                            />
                        )}
                        {view === 'multi' && (
                            <CalendarWeekView
                                currentDate={currentDate}
                                events={calendarEvents}
                                onEventClick={handleEventClick}
                                onTimeSlotClick={handleTimeSlotClick}
                                onEventDrop={handleEventDrop}
                                onEventResize={handleEventResize}
                                showWeekends={options.showWeekends}
                                showWeekNumbers={options.showWeekNumbers}
                                visibleHours={options.visibleHours}
                                dayCount={options.multiDayCount}
                            />
                        )}
                        {view === 'agenda' && (
                            <CalendarAgendaView
                                start={startOfMonth(currentDate)}
                                end={endOfMonth(currentDate)}
                                events={calendarEvents}
                                onEventClick={handleEventClick}
                                showWeekends={options.showWeekends}
                            />
                        )}
                        {view === 'day' && (
                            <CalendarDayView
                                currentDate={currentDate}
                                events={calendarEvents}
                                onEventClick={handleEventClick}
                                onTimeSlotClick={handleTimeSlotClick}
                                onEventDrop={handleEventDrop}
                                onEventResize={handleEventResize}
                                visibleHours={options.visibleHours}
                            />
                        )}
                    </div>

                    {isArrangeOpen && (
                        <ArrangePanel
                            tasks={allTasks}
                            onClose={() => setIsArrangeOpen(false)}
                        />
                    )}
                </div>

                {isManagerOpen && (
                    <CalendarsModal
                        feeds={feeds}
                        loading={feedsLoading}
                        onFeedsChange={(update) => setFeeds(update)}
                        googleStatus={googleStatus}
                        onGoogleStatusChange={(status) => {
                            setGoogleStatus(status);
                            setFeedsVersion((v) => v + 1);
                        }}
                        onClose={() => setIsManagerOpen(false)}
                    />
                )}

                {googleDraft && (
                    <GoogleEventModal
                        draft={googleDraft}
                        calendars={googleCalendars}
                        onClose={() => setGoogleDraft(null)}
                        onSave={async (calendarUid, input) => {
                            if (
                                googleDraft.eventId &&
                                googleDraft.calendarUid
                            ) {
                                await updateGoogleEvent(
                                    googleDraft.calendarUid,
                                    googleDraft.eventId,
                                    input
                                );
                            } else {
                                await createGoogleEvent({
                                    ...input,
                                    calendar_uid: calendarUid,
                                });
                            }
                            setFeedsVersion((v) => v + 1);
                        }}
                        onDelete={
                            googleDraft.eventId && googleDraft.calendarUid
                                ? async () => {
                                      await deleteGoogleEvent(
                                          googleDraft.calendarUid!,
                                          googleDraft.eventId!
                                      );
                                      setFeedsVersion((v) => v + 1);
                                  }
                                : undefined
                        }
                    />
                )}

                {selectedTask && (
                    <TaskEventModal
                        isOpen={isEventDetailModalOpen}
                        onClose={() => {
                            setIsEventDetailModalOpen(false);
                            setSelectedTask(null);
                        }}
                        task={selectedTask}
                        onEditTask={handleEditTask}
                    />
                )}
            </div>
        </div>
    );
};

interface CalendarsModalProps {
    feeds: CalendarFeed[];
    loading: boolean;
    onFeedsChange: (update: (feeds: CalendarFeed[]) => CalendarFeed[]) => void;
    googleStatus: GoogleStatus | null;
    onGoogleStatusChange: (status: GoogleStatus) => void;
    onClose: () => void;
}

const CalendarsModal: React.FC<CalendarsModalProps> = ({
    feeds,
    loading,
    onFeedsChange,
    googleStatus,
    onGoogleStatusChange,
    onClose,
}) => {
    const { t } = useTranslation();

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={t('calendar.manageCalendars', 'Calendars')}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between p-5 pb-2">
                    <div className="pr-3">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            {t('calendar.manageCalendars', 'Calendars')}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {t(
                                'calendar.manageDescription',
                                'Connect read-only calendars and choose which ones appear here. Tududi never changes them.'
                            )}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('calendar.close', 'Close')}
                        className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-5 pt-3">
                    <CalendarFeedsManager
                        feeds={feeds}
                        loading={loading}
                        onFeedsChange={onFeedsChange}
                        googleStatus={googleStatus}
                        onGoogleStatusChange={onGoogleStatusChange}
                    />
                </div>
            </div>
        </div>
    );
};

interface TaskEventModalProps {
    isOpen: boolean;
    task: Task;
    onClose: () => void;
    onEditTask: () => void;
}

const TaskEventModal: React.FC<TaskEventModalProps> = ({
    isOpen,
    task,
    onClose,
    onEditTask,
}) => {
    const { t, i18n } = useTranslation();
    const locale = getLocale(i18n.language);

    if (!isOpen) return null;

    const priorityConfig = {
        high: {
            label: t('calendar.high', 'High'),
            className:
                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
        },
        medium: {
            label: t('calendar.medium', 'Medium'),
            className:
                'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
        },
        low: {
            label: t('calendar.low', 'Low'),
            className:
                'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
        },
    };

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-sm max-h-[90vh] flex flex-col"
                onClick={(event) => event.stopPropagation()}
            >
                {/* Header */}
                <div className="shrink-0 flex items-start justify-between p-5 pb-4">
                    <div className="flex-1 min-w-0 pr-3">
                        <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500 mb-1.5">
                            {t('calendar.task', 'Task')}
                        </p>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-snug break-words line-clamp-4">
                            {task.name || `Task ${task.id}`}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>

                <div className="min-h-0 overflow-y-auto">
                    {/* Pills row */}
                    <div className="flex items-center gap-2 px-5 pb-4 flex-wrap">
                        <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                task.completed_at
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            }`}
                        >
                            {task.completed_at
                                ? t('calendar.completed', 'Completed')
                                : t('calendar.pending', 'Pending')}
                        </span>
                        {task.priority && task.priority in priorityConfig && (
                            <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${priorityConfig[task.priority as keyof typeof priorityConfig].className}`}
                            >
                                {
                                    priorityConfig[
                                        task.priority as keyof typeof priorityConfig
                                    ].label
                                }
                            </span>
                        )}
                    </div>

                    {/* Metadata */}
                    <div className="px-5 pb-4 space-y-3">
                        {task.due_date && parseDateString(task.due_date) && (
                            <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                                <CalendarDaysIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                                <span>
                                    {format(
                                        parseDateString(task.due_date) as Date,
                                        'PPP',
                                        { locale }
                                    )}
                                </span>
                            </div>
                        )}
                        {task.defer_until && (
                            <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                                <ClockIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                                <span>
                                    {format(new Date(task.defer_until), 'PPP', {
                                        locale,
                                    })}
                                </span>
                            </div>
                        )}
                        {task.Project?.name && (
                            <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                                <FolderIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                                <span>{task.Project.name}</span>
                            </div>
                        )}
                        {task.tags && task.tags.length > 0 && (
                            <div className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                                <TagIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" />
                                <span className="flex flex-wrap gap-1">
                                    {task.tags.map((tag: any) => (
                                        <span
                                            key={tag.id || tag.name}
                                            className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded"
                                        >
                                            {tag.name}
                                        </span>
                                    ))}
                                </span>
                            </div>
                        )}
                        {task.note && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 leading-relaxed whitespace-pre-wrap break-words">
                                {task.note}
                            </p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="shrink-0 flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-700">
                    <Link
                        to="/tasks"
                        className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                        {t('calendar.goToTasks', 'All tasks')}
                    </Link>
                    <button
                        onClick={onEditTask}
                        className="px-4 py-1.5 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                        {t('calendar.editTask', 'Open task')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Calendar;
