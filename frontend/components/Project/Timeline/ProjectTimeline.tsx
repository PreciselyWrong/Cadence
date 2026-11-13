import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TFunction } from 'i18next';
import { Task } from '../../../entities/Task';
import { Project } from '../../../entities/Project';
import {
    TaskLink,
    TimelineDates,
    TimelineItem,
    buildItems,
    buildRange,
    dateOf,
    findPath,
    fromDay,
    lastDayOfMonth,
    linkTarget,
    monthLabelFits,
    shiftDates,
    spareDays,
    summarizeItems,
    toDay,
    todayDay,
    weekdayOf,
} from './timelineLayout';
import { taskColor } from '../../Calendar/taskEvents';
import { toIntlLocale } from '../../../utils/intlLocale';

type Zoom = 'days' | 'weeks' | 'months';

const DAY_WIDTH: Record<Zoom, number> = { days: 36, weeks: 16, months: 6 };
const ROW_HEIGHT = 40;
const BAR_HEIGHT = 20;
const HEADER_HEIGHT = 48;
const ZOOM_KEY = 'project_timeline_zoom';
// Hatching marks a bar that stands for a week or a month, not exact dates.
const HORIZON_HATCH =
    'repeating-linear-gradient(135deg, rgba(255,255,255,0.45) 0 5px, transparent 5px 10px)';
const PATH_KEY = 'project_timeline_path';
const COLOR_KEY = 'project_timeline_color';

type TimelineColorBy = 'status' | 'priority' | 'tag';

const readSetting = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

const writeSetting = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Settings are a convenience; the timeline works without them
    }
};

interface DragState {
    uid: string;
    edge: 'move' | 'start' | 'end';
    originX: number;
    delta: number;
}

// A "blocks" link being drawn from a bar's handle, in body coordinates.
interface LinkDraft {
    fromUid: string;
    x0: number;
    y0: number;
    x: number;
    y: number;
}

interface ProjectTimelineProps {
    project: Project;
    tasks: Task[];
    links: TaskLink[];
    onDatesChange: (task: Task, dates: TimelineDates) => Promise<void>;
    onOpenTask: (task: Task) => void;
    // Drawing from a bar's handle to another bar: `from` blocks `to`.
    onLink?: (from: Task, to: Task) => Promise<void>;
    onUnlink?: (link: TaskLink) => Promise<void>;
    readOnly?: boolean;
    // 0 (Sunday) to 6: where a week bar starts.
    firstDayOfWeek?: number;
    t: TFunction;
    // The app language, for month and day labels.
    language?: string;
}

const ProjectTimeline: React.FC<ProjectTimelineProps> = ({
    project,
    tasks,
    links,
    onDatesChange,
    onOpenTask,
    onLink,
    onUnlink,
    readOnly = false,
    firstDayOfWeek = 1,
    t,
    language,
}) => {
    const dateLabel = (options: Intl.DateTimeFormatOptions) => {
        const formatter = new Intl.DateTimeFormat(
            toIntlLocale(language),
            options
        );
        return (date: Date) => formatter.format(date);
    };
    const monthYear = dateLabel({ month: 'short', year: 'numeric' });
    const month = dateLabel({ month: 'short' });
    const dayMonth = dateLabel({ day: 'numeric', month: 'short' });
    const scrollRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState<Zoom>(() => {
        const saved = readSetting(ZOOM_KEY);
        return saved === 'weeks' || saved === 'months' ? saved : 'days';
    });
    const [showPath, setShowPath] = useState(
        () => readSetting(PATH_KEY) === 'true'
    );
    const [colorBy, setColorBy] = useState<TimelineColorBy>(() => {
        const saved = readSetting(COLOR_KEY);
        return saved === 'priority' || saved === 'tag' ? saved : 'status';
    });
    const [drag, setDrag] = useState<DragState | null>(null);
    const [dropDay, setDropDay] = useState<number | null>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
    const [pickedLink, setPickedLink] = useState<{
        link: TaskLink;
        x: number;
        y: number;
    } | null>(null);
    const canLink = !readOnly && !!onLink;

    // Escape drops a link being drawn or the open link menu
    useEffect(() => {
        if (!linkDraft && !pickedLink) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            setLinkDraft(null);
            setPickedLink(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [linkDraft, pickedLink]);

    const dayW = DAY_WIDTH[zoom];
    const today = todayDay();
    const projectStart = toDay(project.start_date);
    const projectDue = toDay(project.due_date_at);
    const goal = project.Goal ?? project.goal ?? null;
    const goalDay = toDay(goal?.target_date);

    const { items, undated } = useMemo(() => buildItems(tasks), [tasks]);
    const { first, last } = useMemo(
        () =>
            buildRange(
                items,
                [projectStart, projectDue, goalDay],
                today,
                zoom === 'months' ? 120 : 35
            ),
        [items, projectStart, projectDue, goalDay, today, zoom]
    );
    const summary = useMemo(() => summarizeItems(items), [items]);
    const hasSummaryRow = summary !== null || goalDay !== null;
    // The path follows "blocks" links, so it needs at least one between
    // two tasks on the chart
    const hasLinks = useMemo(() => {
        const uids = new Set(items.map((item) => item.task.uid));
        return links.some(
            (link) => uids.has(link.from_uid) && uids.has(link.to_uid)
        );
    }, [items, links]);
    const path = useMemo(
        () => (showPath ? findPath(items, links) : new Set<string>()),
        [items, links, showPath]
    );
    const spare = useMemo(
        () =>
            showPath
                ? spareDays(items, links, path, projectDue)
                : new Map<string, number>(),
        [items, links, path, projectDue, showPath]
    );

    const totalDays = last - first + 1;
    const width = totalDays * dayW;
    const x = (day: number) => (day - first) * dayW;
    const rowIndex = new Map(items.map((item, i) => [item.task.uid, i]));

    const scrollToToday = () => {
        const el = scrollRef.current;
        if (el) el.scrollLeft = Math.max(0, x(today) - 3 * dayW);
    };

    useEffect(() => {
        scrollToToday();
        // Re-centre when the scale changes, not on every data change
    }, [zoom]);

    const changeZoom = (next: Zoom) => {
        setZoom(next);
        writeSetting(ZOOM_KEY, next);
    };

    const changeColorBy = (next: TimelineColorBy) => {
        setColorBy(next);
        writeSetting(COLOR_KEY, next);
    };

    const togglePath = () => {
        setShowPath((prev) => {
            writeSetting(PATH_KEY, String(!prev));
            return !prev;
        });
    };

    // Header: month labels on top, then day numbers or week starts
    const months: { x: number; label: string }[] = [];
    const ticks: { x: number; label: string; strong: boolean }[] = [];
    const weekends: number[] = [];
    for (let day = first; day <= last; day += 1) {
        const date = dateOf(day);
        if (day === first || date.getDate() === 1) {
            months.push({
                x: x(day),
                label: day === first ? monthYear(date) : month(date),
            });
        }
        const weekday = weekdayOf(day);
        if (weekday === 0 || weekday === 6) weekends.push(day);
        if (zoom === 'days') {
            ticks.push({
                x: x(day),
                label: String(date.getDate()),
                strong: day === today,
            });
        } else if (zoom === 'weeks' && weekday === 1) {
            ticks.push({
                x: x(day),
                label: dayMonth(date),
                strong: false,
            });
        }
    }

    const previewDates = (item: TimelineItem) => {
        if (!drag || drag.uid !== item.task.uid || drag.delta === 0) {
            return { from: item.from, to: item.to };
        }
        const next = shiftDates(item, drag.delta, drag.edge, firstDayOfWeek);
        if (item.kind === 'week') {
            const from = toDay(next.week_of) as number;
            return { from, to: from + 6 };
        }
        if (item.kind === 'month') {
            const from = toDay(next.month_of) as number;
            return { from, to: lastDayOfMonth(from) };
        }
        const start = toDay(next.start_date ?? fromDay(item.start ?? 0));
        const due = toDay(next.due_date ?? fromDay(item.due ?? 0));
        if (item.kind === 'due') return { from: due!, to: due! };
        if (item.kind === 'start') return { from: start!, to: start! };
        return {
            from: Math.min(start!, due!),
            to: Math.max(start!, due!),
        };
    };

    const handlePointerDown = (
        e: React.PointerEvent,
        item: TimelineItem,
        edge: DragState['edge']
    ) => {
        if (e.button !== 0 || !item.task.uid) return;
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDrag({ uid: item.task.uid, edge, originX: e.clientX, delta: 0 });
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!drag) return;
        const delta = Math.round((e.clientX - drag.originX) / dayW);
        if (delta !== drag.delta) setDrag({ ...drag, delta });
    };

    const handlePointerUp = async (item: TimelineItem) => {
        if (!drag) return;
        const { delta, edge } = drag;
        setDrag(null);
        if (delta === 0) {
            if (edge === 'move') onOpenTask(item.task);
            return;
        }
        await onDatesChange(
            item.task,
            shiftDates(item, delta, edge, firstDayOfWeek)
        );
    };

    const bodyPoint = (e: React.PointerEvent) => {
        const rect = bodyRef.current?.getBoundingClientRect();
        return rect
            ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
            : { x: 0, y: 0 };
    };

    const startLink = (e: React.PointerEvent, item: TimelineItem) => {
        if (e.button !== 0 || !item.task.uid) return;
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const at = bodyPoint(e);
        setPickedLink(null);
        setLinkDraft({ fromUid: item.task.uid, x0: at.x, y0: at.y, ...at });
    };

    const moveLink = (e: React.PointerEvent) => {
        if (!linkDraft) return;
        setLinkDraft({ ...linkDraft, ...bodyPoint(e) });
    };

    const linkDropTarget = linkDraft
        ? linkTarget(
              items,
              linkDraft.fromUid,
              Math.floor(linkDraft.y / ROW_HEIGHT)
          )
        : null;

    const endLink = async () => {
        const draft = linkDraft;
        const target = linkDropTarget;
        setLinkDraft(null);
        if (!draft || !target || !onLink) return;
        const from = items.find((item) => item.task.uid === draft.fromUid);
        if (from) await onLink(from.task, target.task);
    };

    const dayAt = (clientX: number) => {
        const el = scrollRef.current;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return first + Math.floor((clientX - rect.left + el.scrollLeft) / dayW);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setDropDay(null);
        const uid = e.dataTransfer.getData('text/tududi-task');
        const task = undated.find((item) => item.uid === uid);
        const day = dayAt(e.clientX);
        if (!task || day === null) return;
        await onDatesChange(task, {
            start_date: fromDay(day),
            due_date: fromDay(day),
        });
    };

    const barColors = (item: TimelineItem) => {
        const uid = item.task.uid || '';
        const overdue = !item.done && item.due !== null && item.due < today;
        if (item.done) return 'bg-gray-300 dark:bg-gray-600';
        if (showPath && path.size > 0) {
            return path.has(uid)
                ? overdue
                    ? 'bg-orange-500'
                    : 'bg-blue-700 dark:bg-blue-500'
                : 'bg-slate-300 dark:bg-slate-600';
        }
        if (overdue) return 'bg-orange-500';
        const status = item.task.status;
        if (status === 1 || status === 'in_progress')
            return 'bg-blue-600 dark:bg-blue-500';
        return 'bg-blue-300 dark:bg-blue-700';
    };

    // Colour by priority or tag replaces the status colours, except for
    // done tasks, overdue ones and the highlighted path.
    const customColor = (item: TimelineItem) => {
        if (colorBy === 'status' || item.done || (showPath && path.size > 0)) {
            return undefined;
        }
        if (item.due !== null && item.due < today) return undefined;
        return taskColor(item.task as any, colorBy);
    };

    // Dark text on the light bars, white on the strong ones
    const barText = (item: TimelineItem) =>
        customColor(item) !== undefined ||
        barColors(item).startsWith('bg-orange') ||
        /^bg-blue-(6|7)00/.test(barColors(item))
            ? 'text-white'
            : 'text-slate-800 dark:text-white';

    const formatDay = (day: number | null, time?: string | null) =>
        day === null ? '' : `${dayMonth(dateOf(day))}${time ? ` ${time}` : ''}`;

    const describe = (item: TimelineItem) => {
        const task = item.task;
        if (item.kind === 'range')
            return `${formatDay(item.start, task.start_time)} – ${formatDay(item.due, task.due_has_time ? task.due_time : null)}`;
        if (item.kind === 'due')
            return t('projectTimeline.dueOn', 'Due {{date}}', {
                date: formatDay(item.due),
            });
        if (item.kind === 'week')
            return t('projectTimeline.weekOf', 'Week of {{date}}', {
                date: formatDay(item.from),
            });
        if (item.kind === 'month') return monthYear(dateOf(item.from));
        return t('projectTimeline.startsOn', 'Starts {{date}}', {
            date: formatDay(item.start),
        });
    };

    // Elbow connectors from the end of a blocker to the start of what it blocks
    const arrows = links
        .map((link) => {
            const fromRow = rowIndex.get(link.from_uid);
            const toRow = rowIndex.get(link.to_uid);
            if (fromRow === undefined || toRow === undefined) return null;
            const a = previewDates(items[fromRow]);
            const b = previewDates(items[toRow]);
            const x1 = x(a.to + 1) - 2;
            const y1 = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
            const x2 = x(b.from) + 2;
            const y2 = toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
            const onPath = path.has(link.from_uid) && path.has(link.to_uid);
            let d: string;
            if (x2 - x1 >= 16) {
                const mid = x2 - 8;
                d = `M ${x1} ${y1} H ${mid} V ${y2} H ${x2 - 1}`;
            } else {
                const turnY =
                    y2 > y1 ? y2 - ROW_HEIGHT / 2 : y2 + ROW_HEIGHT / 2;
                d = `M ${x1} ${y1} h 8 V ${turnY} H ${x2 - 8} V ${y2} H ${x2 - 1}`;
            }
            return {
                key: `${link.from_uid}-${link.to_uid}`,
                d,
                onPath,
                link,
            };
        })
        .filter(
            (
                a
            ): a is {
                key: string;
                d: string;
                onPath: boolean;
                link: TaskLink;
            } => !!a
        );
    const canUnlink = !readOnly && !!onUnlink;

    const bodyHeight = Math.max(items.length, 1) * ROW_HEIGHT;

    const zoomLabels: Record<Zoom, string> = {
        days: t('projectTimeline.days', 'Days'),
        weeks: t('projectTimeline.weeks', 'Weeks'),
        months: t('projectTimeline.months', 'Months'),
    };

    return (
        <div className="space-y-4" data-testid="project-timeline">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <div
                        role="group"
                        aria-label={t('projectTimeline.scale', 'Scale')}
                        className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800"
                    >
                        {(['days', 'weeks', 'months'] as Zoom[]).map((z) => (
                            <button
                                key={z}
                                type="button"
                                aria-pressed={zoom === z}
                                onClick={() => changeZoom(z)}
                                className={`rounded-md px-3 py-1 text-sm transition-colors ${
                                    zoom === z
                                        ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                                        : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
                                }`}
                            >
                                {zoomLabels[z]}
                            </button>
                        ))}
                    </div>
                    <select
                        aria-label={t('projectTimeline.colorBy', 'Colour by')}
                        value={colorBy}
                        onChange={(e) =>
                            changeColorBy(e.target.value as TimelineColorBy)
                        }
                        className="rounded-lg border-0 bg-gray-100 px-2 py-1.5 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                    >
                        <option value="status">
                            {t(
                                'projectTimeline.colorByStatus',
                                'Colour: status'
                            )}
                        </option>
                        <option value="priority">
                            {t(
                                'projectTimeline.colorByPriority',
                                'Colour: priority'
                            )}
                        </option>
                        <option value="tag">
                            {t('projectTimeline.colorByTag', 'Colour: tag')}
                        </option>
                    </select>
                    <button
                        type="button"
                        onClick={scrollToToday}
                        className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                        {t('sidebar.today', 'Today')}
                    </button>
                </div>
                <label
                    title={
                        hasLinks
                            ? undefined
                            : t(
                                  'projectTimeline.noLinks',
                                  'Mark tasks as blocking other tasks to see the path to the finish'
                              )
                    }
                    className={`flex items-center gap-2 text-sm ${
                        hasLinks
                            ? 'text-gray-700 dark:text-gray-300'
                            : 'cursor-not-allowed text-gray-500 dark:text-gray-400'
                    }`}
                >
                    <input
                        type="checkbox"
                        checked={showPath && hasLinks}
                        disabled={!hasLinks}
                        onChange={togglePath}
                        className="h-4 w-4 rounded text-blue-600"
                    />
                    {t('projectTimeline.highlightPath', 'Highlight the path')}
                </label>
            </div>

            <div className="flex overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-900">
                <div className="w-40 flex-shrink-0 sm:w-64 shadow-[1px_0_0_rgba(0,0,0,0.06)] dark:shadow-[1px_0_0_rgba(255,255,255,0.06)]">
                    <div
                        className="flex items-end px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
                        style={{ height: HEADER_HEIGHT }}
                    >
                        {t('tasks.title', 'Tasks')}
                    </div>
                    {hasSummaryRow && (
                        <div
                            className="flex flex-col justify-center bg-gray-500/[0.06] px-3 dark:bg-white/[0.05]"
                            style={{ height: ROW_HEIGHT }}
                        >
                            <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                {t('roadmap.legendProject', 'Project summary')}
                            </span>
                            {summary && (
                                <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                                    {summary.from === summary.to
                                        ? formatDay(summary.from)
                                        : t(
                                              'roadmap.range',
                                              '{{start}} to {{end}}',
                                              {
                                                  start: formatDay(
                                                      summary.from
                                                  ),
                                                  end: formatDay(summary.to),
                                              }
                                          )}
                                </span>
                            )}
                        </div>
                    )}
                    {items.map((item, i) => (
                        <button
                            key={item.task.uid}
                            type="button"
                            onClick={() => onOpenTask(item.task)}
                            className={`flex w-full flex-col justify-center px-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 ${
                                i % 2 ? 'bg-gray-50/60 dark:bg-gray-800/40' : ''
                            }`}
                            style={{ height: ROW_HEIGHT }}
                        >
                            <span
                                className={`truncate text-sm ${
                                    item.done
                                        ? 'text-gray-500 line-through dark:text-gray-400'
                                        : path.has(item.task.uid || '')
                                          ? 'font-semibold text-gray-900 dark:text-gray-100'
                                          : 'text-gray-900 dark:text-gray-100'
                                }`}
                            >
                                {item.task.name}
                            </span>
                            <span className="truncate text-xs text-gray-600 dark:text-gray-300">
                                {describe(item)}
                            </span>
                        </button>
                    ))}
                    {items.length === 0 && (
                        <div
                            className="px-3 text-sm italic text-gray-600 dark:text-gray-300"
                            style={{ height: ROW_HEIGHT }}
                        >
                            {t(
                                'projectTimeline.empty',
                                'No tasks with dates yet'
                            )}
                        </div>
                    )}
                </div>

                <div
                    ref={scrollRef}
                    className="min-w-0 flex-1 overflow-x-auto"
                    onDragOver={(e) => {
                        if (!e.dataTransfer.types.includes('text/tududi-task'))
                            return;
                        e.preventDefault();
                        setDropDay(dayAt(e.clientX));
                    }}
                    onDragLeave={() => setDropDay(null)}
                    onDrop={handleDrop}
                >
                    <div className="relative" style={{ width }}>
                        <div
                            className="relative"
                            style={{ height: HEADER_HEIGHT }}
                        >
                            {months
                                .filter((m) =>
                                    monthLabelFits(m.x, m.label, width)
                                )
                                .map((m) => (
                                    <div
                                        key={`m-${m.x}`}
                                        className="absolute top-1 whitespace-nowrap pl-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300"
                                        style={{ left: m.x }}
                                    >
                                        {m.label}
                                    </div>
                                ))}
                            {ticks.map((tick) => (
                                <div
                                    key={`t-${tick.x}`}
                                    className={`absolute bottom-2 whitespace-nowrap text-center text-[12px] ${
                                        tick.strong
                                            ? 'font-bold text-blue-700 dark:text-blue-400'
                                            : 'text-gray-600 dark:text-gray-300'
                                    }`}
                                    style={{
                                        left: tick.x,
                                        width: zoom === 'days' ? dayW : 'auto',
                                        paddingLeft: zoom === 'days' ? 0 : 6,
                                    }}
                                >
                                    {tick.label}
                                </div>
                            ))}
                        </div>

                        {hasSummaryRow && (
                            <div
                                className="relative bg-gray-500/[0.06] dark:bg-white/[0.05]"
                                style={{ height: ROW_HEIGHT }}
                            >
                                <div
                                    className="absolute inset-y-0 w-0.5 bg-blue-600 dark:bg-blue-400"
                                    style={{ left: x(today) + dayW / 2 - 1 }}
                                />
                                {summary && (
                                    <div
                                        data-testid="project-timeline-summary"
                                        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-sm bg-gray-400"
                                        style={{
                                            left: x(summary.from),
                                            width: Math.max(
                                                (summary.to -
                                                    summary.from +
                                                    1) *
                                                    dayW,
                                                4
                                            ),
                                        }}
                                    />
                                )}
                                {goal && goalDay !== null && (
                                    <div
                                        data-testid="project-timeline-goal"
                                        title={`${goal.title}, ${formatDay(goalDay)}`}
                                        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-sm bg-violet-500 dark:bg-violet-300"
                                        style={{ left: x(goalDay) + dayW / 2 }}
                                    />
                                )}
                            </div>
                        )}
                        <div
                            ref={bodyRef}
                            className="group/chart relative"
                            style={{ height: bodyHeight }}
                            onPointerMove={(e) => {
                                handlePointerMove(e);
                                moveLink(e);
                            }}
                        >
                            {items.map((item, i) => (
                                <div
                                    key={`row-${item.task.uid}`}
                                    className={`absolute inset-x-0 ${
                                        i % 2
                                            ? 'bg-gray-50/60 dark:bg-gray-800/40'
                                            : ''
                                    }`}
                                    style={{
                                        top: i * ROW_HEIGHT,
                                        height: ROW_HEIGHT,
                                    }}
                                />
                            ))}
                            {dayW >= 12 &&
                                weekends.map((day) => (
                                    <div
                                        key={`w-${day}`}
                                        className="absolute inset-y-0 bg-gray-500/[0.06] dark:bg-white/[0.04]"
                                        style={{ left: x(day), width: dayW }}
                                    />
                                ))}
                            {dropDay !== null && (
                                <div
                                    className="absolute inset-y-0 bg-blue-500/15"
                                    style={{ left: x(dropDay), width: dayW }}
                                />
                            )}
                            {projectStart !== null &&
                                projectStart >= first &&
                                projectStart <= last && (
                                    <div
                                        className="absolute inset-y-0 border-l-2 border-dashed border-gray-400 dark:border-gray-500"
                                        style={{ left: x(projectStart) }}
                                        title={t(
                                            'projectTimeline.projectStart',
                                            'Project start'
                                        )}
                                    />
                                )}
                            {projectDue !== null &&
                                projectDue >= first &&
                                projectDue <= last && (
                                    <div
                                        className="absolute inset-y-0 border-l-2 border-dashed border-orange-600 dark:border-orange-400"
                                        style={{ left: x(projectDue + 1) }}
                                        title={t(
                                            'projectTimeline.projectDue',
                                            'Project due'
                                        )}
                                    />
                                )}
                            <div
                                className="absolute inset-y-0 w-0.5 bg-blue-600 dark:bg-blue-400"
                                style={{ left: x(today) + dayW / 2 - 1 }}
                            />

                            {showPath &&
                                items.map((item, i) => {
                                    const days = spare.get(item.task.uid || '');
                                    if (!days) return null;
                                    return (
                                        <div
                                            key={`s-${item.task.uid}`}
                                            className="absolute flex items-center overflow-hidden whitespace-nowrap rounded px-1.5 text-[12px] font-medium text-gray-600 dark:text-gray-300"
                                            style={{
                                                left: x(item.to + 1) + 2,
                                                width: days * dayW - 4,
                                                top:
                                                    i * ROW_HEIGHT +
                                                    (ROW_HEIGHT - BAR_HEIGHT) /
                                                        2,
                                                height: BAR_HEIGHT,
                                                background:
                                                    'repeating-linear-gradient(135deg, rgba(148,163,184,0.35) 0 4px, transparent 4px 8px)',
                                            }}
                                        >
                                            {dayW * days > 70 &&
                                                t(
                                                    'projectTimeline.spareDays',
                                                    '{{count}} days spare',
                                                    { count: days }
                                                )}
                                        </div>
                                    );
                                })}

                            <svg
                                className="pointer-events-none absolute inset-0"
                                width={width}
                                height={bodyHeight}
                                aria-hidden="true"
                            >
                                <defs>
                                    <marker
                                        id="timeline-arrow"
                                        viewBox="0 0 6 8"
                                        refX="5"
                                        refY="4"
                                        markerWidth="6"
                                        markerHeight="8"
                                        orient="auto"
                                    >
                                        <path
                                            d="M0 0 L6 4 L0 8 z"
                                            fill="#94a3b8"
                                        />
                                    </marker>
                                    <marker
                                        id="timeline-arrow-path"
                                        viewBox="0 0 6 8"
                                        refX="5"
                                        refY="4"
                                        markerWidth="6"
                                        markerHeight="8"
                                        orient="auto"
                                    >
                                        <path
                                            d="M0 0 L6 4 L0 8 z"
                                            fill="#1d4ed8"
                                        />
                                    </marker>
                                </defs>
                                {canUnlink &&
                                    arrows.map((arrow) => (
                                        <path
                                            key={`hit-${arrow.key}`}
                                            data-testid="timeline-link"
                                            d={arrow.d}
                                            fill="none"
                                            stroke="transparent"
                                            strokeWidth={10}
                                            className="cursor-pointer"
                                            style={{ pointerEvents: 'stroke' }}
                                            onClick={(e) => {
                                                const rect =
                                                    bodyRef.current?.getBoundingClientRect();
                                                if (!rect) return;
                                                setPickedLink({
                                                    link: arrow.link,
                                                    x: e.clientX - rect.left,
                                                    y: e.clientY - rect.top,
                                                });
                                            }}
                                        />
                                    ))}
                                {linkDraft && (
                                    <line
                                        x1={linkDraft.x0}
                                        y1={linkDraft.y0}
                                        x2={linkDraft.x}
                                        y2={linkDraft.y}
                                        stroke="#2563eb"
                                        strokeWidth={1.5}
                                        strokeDasharray="4 3"
                                        markerEnd="url(#timeline-arrow-path)"
                                    />
                                )}
                                {arrows.map((arrow) => (
                                    <path
                                        key={arrow.key}
                                        d={arrow.d}
                                        fill="none"
                                        stroke={
                                            arrow.onPath ? '#1d4ed8' : '#94a3b8'
                                        }
                                        strokeWidth={arrow.onPath ? 2 : 1.5}
                                        markerEnd={`url(#${
                                            arrow.onPath
                                                ? 'timeline-arrow-path'
                                                : 'timeline-arrow'
                                        })`}
                                    />
                                ))}
                            </svg>

                            {items.map((item, i) => {
                                const { from, to } = previewDates(item);
                                const top =
                                    i * ROW_HEIGHT +
                                    (ROW_HEIGHT - BAR_HEIGHT) / 2;
                                const dragging = drag?.uid === item.task.uid;
                                const label = `${item.task.name}: ${describe(item)}`;
                                if (item.kind === 'due') {
                                    return (
                                        <button
                                            key={`b-${item.task.uid}`}
                                            type="button"
                                            aria-label={label}
                                            title={label}
                                            onPointerDown={(e) =>
                                                handlePointerDown(
                                                    e,
                                                    item,
                                                    'move'
                                                )
                                            }
                                            onPointerUp={() =>
                                                handlePointerUp(item)
                                            }
                                            className={`absolute h-3.5 w-3.5 rotate-45 cursor-grab touch-none rounded-sm ${barColors(item)} ${dragging ? 'cursor-grabbing ring-2 ring-blue-300' : ''} ${linkDropTarget?.task.uid === item.task.uid ? 'ring-2 ring-blue-600' : ''}`}
                                            style={{
                                                backgroundColor:
                                                    customColor(item),
                                                left: x(from) + dayW / 2 - 7,
                                                top: i * ROW_HEIGHT + 13,
                                            }}
                                        />
                                    );
                                }
                                return (
                                    <div
                                        key={`b-${item.task.uid}`}
                                        className={`absolute flex touch-none rounded-md ${barColors(item)} ${
                                            item.kind === 'start'
                                                ? 'opacity-70'
                                                : ''
                                        } ${dragging ? 'ring-2 ring-blue-300' : ''} ${
                                            linkDropTarget?.task.uid ===
                                            item.task.uid
                                                ? 'ring-2 ring-blue-600'
                                                : ''
                                        }`}
                                        data-kind={item.kind}
                                        style={{
                                            backgroundColor: customColor(item),
                                            backgroundImage:
                                                item.kind === 'week' ||
                                                item.kind === 'month'
                                                    ? HORIZON_HATCH
                                                    : undefined,
                                            left: x(from) + 2,
                                            width: Math.max(
                                                (to - from + 1) * dayW - 4,
                                                6
                                            ),
                                            top,
                                            height: BAR_HEIGHT,
                                        }}
                                    >
                                        {item.kind === 'range' && (
                                            <span
                                                aria-hidden="true"
                                                onPointerDown={(e) =>
                                                    handlePointerDown(
                                                        e,
                                                        item,
                                                        'start'
                                                    )
                                                }
                                                onPointerUp={() =>
                                                    handlePointerUp(item)
                                                }
                                                className="h-full w-2 flex-shrink-0 cursor-ew-resize"
                                            />
                                        )}
                                        <button
                                            type="button"
                                            aria-label={label}
                                            title={label}
                                            onPointerDown={(e) =>
                                                handlePointerDown(
                                                    e,
                                                    item,
                                                    'move'
                                                )
                                            }
                                            onPointerUp={() =>
                                                handlePointerUp(item)
                                            }
                                            className={`min-w-0 flex-1 truncate px-1 text-left text-[12px] font-medium ${barText(item)} ${
                                                dragging
                                                    ? 'cursor-grabbing'
                                                    : 'cursor-grab'
                                            }`}
                                        >
                                            {dayW * (to - from + 1) > 90
                                                ? item.task.name
                                                : ''}
                                        </button>
                                        {item.kind === 'range' && (
                                            <span
                                                aria-hidden="true"
                                                onPointerDown={(e) =>
                                                    handlePointerDown(
                                                        e,
                                                        item,
                                                        'end'
                                                    )
                                                }
                                                onPointerUp={() =>
                                                    handlePointerUp(item)
                                                }
                                                className="h-full w-2 flex-shrink-0 cursor-ew-resize"
                                            />
                                        )}
                                    </div>
                                );
                            })}

                            {canLink &&
                                items.map((item, i) => {
                                    if (!item.task.uid) return null;
                                    const { from, to } = previewDates(item);
                                    const left =
                                        item.kind === 'due'
                                            ? x(from) + dayW / 2 + 6
                                            : x(to + 1) + 1;
                                    return (
                                        <span
                                            key={`l-${item.task.uid}`}
                                            data-testid="timeline-link-handle"
                                            title={t(
                                                'projectTimeline.linkHandle',
                                                'Drag onto the task that must wait for this one'
                                            )}
                                            onPointerDown={(e) =>
                                                startLink(e, item)
                                            }
                                            onPointerUp={endLink}
                                            onPointerCancel={() =>
                                                setLinkDraft(null)
                                            }
                                            className={`absolute z-10 h-3 w-3 cursor-crosshair touch-none rounded-full border-2 border-blue-600 bg-white transition-opacity dark:bg-gray-900 ${
                                                linkDraft?.fromUid ===
                                                item.task.uid
                                                    ? 'opacity-100'
                                                    : 'opacity-0 group-hover/chart:opacity-100 [@media(hover:none)]:opacity-100'
                                            }`}
                                            style={{
                                                left,
                                                top:
                                                    i * ROW_HEIGHT +
                                                    ROW_HEIGHT / 2 -
                                                    6,
                                            }}
                                        />
                                    );
                                })}

                            {pickedLink && (
                                <>
                                    <div
                                        className="fixed inset-0 z-20"
                                        onClick={() => setPickedLink(null)}
                                    />
                                    <div
                                        className="absolute z-30 rounded-lg bg-white p-1 shadow-lg ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10"
                                        style={{
                                            left: pickedLink.x,
                                            top: pickedLink.y + 6,
                                        }}
                                    >
                                        <button
                                            type="button"
                                            autoFocus
                                            onClick={async () => {
                                                const { link } = pickedLink;
                                                setPickedLink(null);
                                                if (onUnlink)
                                                    await onUnlink(link);
                                            }}
                                            className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                                        >
                                            {t(
                                                'projectTimeline.removeLink',
                                                'Remove the link'
                                            )}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-4">
                {undated.length > 0 && (
                    <section className="min-w-0 flex-1 rounded-xl bg-white p-4 shadow-sm dark:bg-gray-900">
                        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {t('projectTimeline.noDates', 'No dates yet')} ·{' '}
                            {undated.length}{' '}
                            <span className="font-normal text-gray-600 dark:text-gray-300">
                                {t(
                                    'projectTimeline.dragHint',
                                    'Drag one onto the timeline to schedule it'
                                )}
                            </span>
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {undated.map((task) => (
                                <button
                                    key={task.uid}
                                    type="button"
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData(
                                            'text/tududi-task',
                                            task.uid || ''
                                        );
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onClick={() => onOpenTask(task)}
                                    className="cursor-grab rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                                >
                                    {task.name}
                                </button>
                            ))}
                        </div>
                    </section>
                )}
                <div className="flex flex-wrap gap-4 px-1 py-3 text-xs text-gray-600 dark:text-gray-300">
                    <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-6 rounded bg-blue-300 dark:bg-blue-700" />
                        {t('projectTimeline.legendRange', 'Start → Due')}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rotate-45 rounded-sm bg-blue-300 dark:bg-blue-700" />
                        {t('projectTimeline.legendDue', 'Due date only')}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span
                            className="h-2.5 w-6 rounded bg-blue-300 dark:bg-blue-700"
                            style={{ backgroundImage: HORIZON_HATCH }}
                        />
                        {t('projectTimeline.legendHorizon', 'Week or month')}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-0.5 w-6 bg-slate-400" />
                        {t('projectTimeline.legendBlocks', 'Blocks')}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-6 rounded bg-orange-500" />
                        {t('projectTimeline.legendOverdue', 'Overdue')}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ProjectTimeline;
