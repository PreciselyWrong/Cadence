import { Task } from '../../entities/Task';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import {
    ChevronDownIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline';
import Button, { IconButton } from '../Shared/ui/Button';
import Menu, { MenuEntry } from '../Shared/ui/Menu';
import EmptyState from '../Shared/ui/EmptyState';
import { PAGE_TITLE_CLASS } from '../Shared/ui/PageHeader';
import { PAGE_GUTTER } from '../Shared/ui/PageShell';
import TaskLine from './TaskLine';
import { DayLine, DayLines, visibleLines } from './dayModel';
import {
    buildTodayTimeline,
    fillFreeSlot,
    TimelineFree,
    TodayTimeline,
} from './todayTimeline';
import { formatDuration, formatMinute } from '../DailyPlan/planUtils';
import type { CalendarEvent } from '../../utils/calendarFeedsService';

const SECTIONS_KEY = 'today.sections';

type SectionKey = 'overdue' | 'habits' | 'tomorrow' | 'suggestions' | 'done';

// How the sections start; only the day's habits start open.
const CLOSED: Record<SectionKey, boolean> = {
    overdue: false,
    habits: true,
    tomorrow: false,
    suggestions: false,
    done: false,
};

// Remembers which collapsible sections are open; storage can be blocked.
const readSections = (): Record<SectionKey, boolean> => {
    try {
        const raw = window.localStorage.getItem(SECTIONS_KEY);
        const stored = raw ? JSON.parse(raw) : null;
        return stored && typeof stored === 'object'
            ? { ...CLOSED, ...stored }
            : CLOSED;
    } catch {
        return CLOSED;
    }
};

const writeSections = (value: Record<SectionKey, boolean>) => {
    try {
        window.localStorage.setItem(SECTIONS_KEY, JSON.stringify(value));
    } catch {
        // Not remembered: the sections simply start closed next time.
    }
};

export interface DayListProps {
    title: string;
    subtitle: string;
    summaryText: string;
    overloaded: boolean;
    summaryTitle?: string;
    isToday: boolean;
    onPrev(): void;
    onNext(): void;
    onToday(): void;
    headerMenu: MenuEntry[];
    // Completed lines are hidden from the list and the calendar.
    hideCompleted: boolean;
    onHideCompletedChange(hide: boolean): void;
    organize?: { label: string; onClick(): void } | null;
    // Buttons beside Organize (e.g. show the calendar again).
    extraActions?: React.ReactNode;
    // Rows show their description and subtasks.
    expanded?: boolean;
    onToggleSubtask?(subtask: Task): void;
    // The day arrows; the calendar carries them when it is shown.
    showDayNav?: boolean;
    addField: React.ReactNode;
    slip?: {
        title: string;
        actions: { label: string; onClick(): void }[];
    } | null;
    lines: DayLines;
    dateOfDay: string;
    currentUid?: string | null;
    selectedUid?: string | null;
    lineMenu(line: DayLine): MenuEntry[];
    onToggle(line: DayLine): void;
    onOpen(line: DayLine): void;
    overdue: {
        count: number;
        content: React.ReactNode;
        action?: { label: string; onClick(): void };
    } | null;
    tomorrow?: { count: number; content: React.ReactNode } | null;
    suggestions: { count: number; content: React.ReactNode } | null;
    // The day's habits (open count, rows); absent when none is due.
    habits?: { count: number; content: React.ReactNode } | null;
    timeline?: TodayTimeline | null;
    onPlaceHere?(free: TimelineFree): void;
    onOpenEvent?(event: CalendarEvent): void;
    emptyText: string;
    // The day has not answered yet: no summary and no empty state.
    loading?: boolean;
}

interface SectionHeadProps {
    label: string;
    open: boolean;
    onToggle(): void;
    action?: { label: string; onClick(): void };
}

const SectionHead: React.FC<SectionHeadProps> = ({
    label,
    open,
    onToggle,
    action,
}) => (
    <div className="flex items-center gap-1 px-4">
        <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg text-left text-xs font-medium text-surface-on-variant outline-none hover:text-surface-on focus-visible:ring-2 focus-visible:ring-primary/60"
        >
            {open ? (
                <ChevronDownIcon
                    className="h-3 w-3 shrink-0"
                    aria-hidden="true"
                />
            ) : (
                <ChevronRightIcon
                    className="h-3 w-3 shrink-0"
                    aria-hidden="true"
                />
            )}
            <span className="truncate">{label}</span>
        </button>
        {action && (
            <Button variant="ghost" size="sm" onClick={action.onClick}>
                {action.label}
            </Button>
        )}
    </div>
);

/**
 * The left pane: the day as a list. Timed lines first (by time), then the
 * anytime lines in plan order; both are sortable. The body is a drop target
 * for blocks dragged from the calendar.
 */
const DayList: React.FC<DayListProps> = ({
    title,
    subtitle,
    summaryText,
    overloaded,
    summaryTitle,
    isToday,
    onPrev,
    onNext,
    onToday,
    headerMenu,
    hideCompleted,
    onHideCompletedChange,
    organize,
    extraActions,
    expanded = false,
    onToggleSubtask,
    showDayNav = true,
    addField,
    slip,
    lines: allLines,
    dateOfDay,
    currentUid,
    selectedUid,
    lineMenu,
    onToggle,
    onOpen,
    overdue,
    tomorrow = null,
    suggestions,
    habits = null,
    timeline: timelineProp = null,
    onPlaceHere,
    onOpenEvent,
    emptyText,
    loading = false,
}) => {
    const { t } = useTranslation();
    const lines = visibleLines(allLines, hideCompleted);
    const menu: MenuEntry[] = [
        ...headerMenu,
        'separator',
        {
            key: 'hideCompleted',
            label: hideCompleted
                ? t('today.showCompletedTasks', 'Show completed')
                : t('today.hideCompleted', 'Hide completed'),
            onSelect: () => onHideCompletedChange(!hideCompleted),
        },
    ];
    const [sections, setSections] = useState(readSections);
    const toggle = (key: SectionKey) =>
        setSections((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            writeSections(next);
            return next;
        });

    const { setNodeRef: setDropRef, isOver } = useDroppable({
        id: 'list',
        data: { kind: 'list' },
    });

    const timeline = timelineProp ?? buildTodayTimeline(lines, [], null);
    const toPlaceIds = timeline.toPlace.map((item) => `line:${item.line.uid}`);
    const timelineTaskIds = timeline.entries
        .filter((entry) => entry.kind === 'task')
        .map((entry) => `line:${entry.line.uid}`);
    const hasOpen = timeline.toPlace.length > 0 || timelineTaskIds.length > 0;

    const row = (
        line: DayLine,
        extra: {
            missedAt?: number | null;
            past?: boolean;
            next?: boolean;
            overlaps?: boolean;
        } = {}
    ) => (
        <TaskLine
            key={line.uid}
            line={line}
            dateOfDay={dateOfDay}
            current={line.uid === currentUid}
            selected={line.uid === selectedUid}
            onToggle={onToggle}
            onOpen={onOpen}
            menu={lineMenu(line)}
            expanded={expanded}
            onToggleSubtask={onToggleSubtask}
            missedAt={extra.missedAt}
            past={extra.past}
            next={extra.next}
            overlaps={extra.overlaps}
        />
    );

    return (
        <section
            aria-label={title}
            className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface"
        >
            <header
                className={`sticky top-0 z-10 bg-surface ${PAGE_GUTTER} pb-3 pt-6`}
            >
                <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-2">
                    {/* With the day arrows, the title keeps the width of the
                        longest day name so the arrows stay under the pointer. */}
                    <h1
                        className={`mr-1 flex min-w-0 max-w-full items-baseline gap-2 ${
                            showDayNav ? 'sm:min-w-[19.5rem]' : ''
                        }`}
                    >
                        <span className={`shrink-0 ${PAGE_TITLE_CLASS}`}>
                            {title}
                        </span>
                        <span className="min-w-0 truncate text-title font-medium text-surface-on-variant">
                            {subtitle}
                        </span>
                    </h1>
                    {showDayNav && (
                        <>
                            <IconButton
                                label={t('today.previousDay', 'Previous day')}
                                onClick={onPrev}
                            >
                                <ChevronLeftIcon />
                            </IconButton>
                            <IconButton
                                label={t('today.nextDay', 'Next day')}
                                onClick={onNext}
                            >
                                <ChevronRightIcon />
                            </IconButton>
                        </>
                    )}
                    {/* Always there, so the header does not jump on a day change. */}
                    {showDayNav && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onToday}
                            disabled={isToday}
                        >
                            {t('today.goToToday', 'Today')}
                        </Button>
                    )}
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                        {extraActions}
                        {organize && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={organize.onClick}
                            >
                                {organize.label}
                            </Button>
                        )}
                        <Menu
                            entries={menu}
                            trigger={(triggerProps) => (
                                <IconButton
                                    {...triggerProps}
                                    label={t(
                                        'today.moreActions',
                                        'More actions'
                                    )}
                                >
                                    <EllipsisHorizontalIcon />
                                </IconButton>
                            )}
                        />
                    </div>
                </div>
                <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 text-body-m text-surface-on-variant tabular-nums">
                    <span
                        className={`truncate ${overloaded ? 'text-warning' : ''}`}
                        title={summaryTitle}
                    >
                        {loading ? '\u00a0' : summaryText}
                    </span>
                </div>
            </header>

            <div className="px-4 pb-1">{addField}</div>

            <div
                ref={setDropRef}
                data-testid="day-list-body"
                className={`flex min-h-0 flex-1 flex-col pb-6 transition-colors duration-150 ${
                    isOver ? 'bg-surface-low' : ''
                }`}
            >
                {overdue && overdue.count > 0 && (
                    <div className="py-1">
                        <SectionHead
                            label={t('today.overdueCount', 'Overdue · {{n}}', {
                                n: overdue.count,
                            })}
                            open={sections.overdue}
                            onToggle={() => toggle('overdue')}
                            action={overdue.action}
                        />
                        {sections.overdue && (
                            <div className="px-2">{overdue.content}</div>
                        )}
                    </div>
                )}

                {slip && (
                    <div
                        role="status"
                        className="mx-4 my-1 flex items-center gap-2 rounded-lg bg-warning-container/60 py-1 pl-3 pr-1 text-body-m text-warning dark:bg-warning/10"
                    >
                        <span className="min-w-0 flex-1 truncate">
                            <b className="font-medium text-surface-on">
                                {slip.title}
                            </b>{' '}
                            {t('today.slipPassed', 'has passed its slot')}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                            {slip.actions.map((action) => (
                                <Button
                                    key={action.label}
                                    variant="ghost"
                                    size="sm"
                                    onClick={action.onClick}
                                >
                                    {action.label}
                                </Button>
                            ))}
                        </span>
                    </div>
                )}

                {timeline.toPlace.length > 0 && (
                    <div className="py-1" data-testid="timeline-to-place">
                        <div className="px-4 py-1 text-xs font-medium text-surface-on-variant">
                            {t('today.toPlaceCount', 'To place · {{n}}', {
                                n: timeline.toPlace.length,
                            })}
                        </div>
                        <div role="list" className="px-2">
                            <SortableContext
                                items={toPlaceIds}
                                strategy={verticalListSortingStrategy}
                            >
                                {timeline.toPlace.map((item) =>
                                    row(item.line, { missedAt: item.missedAt })
                                )}
                            </SortableContext>
                        </div>
                    </div>
                )}

                {timeline.entries.length > 0 && (
                    <div className="py-1" data-testid="timeline-my-day">
                        <div className="px-4 py-1 text-xs font-medium text-surface-on-variant">
                            {t('today.myDay', 'My day')}
                        </div>
                        <div role="list" className="px-2">
                            <SortableContext
                                items={timelineTaskIds}
                                strategy={verticalListSortingStrategy}
                            >
                                {timeline.entries.map((entry, idx) => {
                                    if (entry.kind === 'task') {
                                        return row(entry.line, {
                                            past: entry.past,
                                            next: entry.next,
                                            overlaps: entry.overlaps,
                                        });
                                    }
                                    if (entry.kind === 'event') {
                                        return (
                                            <button
                                                key={`ev-${entry.event.uid}-${idx}`}
                                                type="button"
                                                onClick={() =>
                                                    onOpenEvent?.(entry.event)
                                                }
                                                className={`grid w-full grid-cols-[52px_auto_minmax(0,1fr)] items-center gap-x-3 rounded-xl px-2 py-1.5 text-left hover:bg-surface-high/60 ${
                                                    entry.past
                                                        ? 'opacity-55'
                                                        : ''
                                                } ${
                                                    entry.next
                                                        ? 'bg-primary-container/30 ring-1 ring-primary/30'
                                                        : ''
                                                }`}
                                            >
                                                <span className="text-right text-xs font-medium tabular-nums text-surface-on-variant">
                                                    {entry.start !== null
                                                        ? formatMinute(
                                                              entry.start
                                                          )
                                                        : t(
                                                              'today.allDay',
                                                              'All day'
                                                          )}
                                                </span>
                                                <span
                                                    aria-hidden="true"
                                                    className="h-2.5 w-2.5 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            entry.event.color ||
                                                            'var(--color-primary, #6366f1)',
                                                    }}
                                                />
                                                <span className="truncate text-body-m text-surface-on">
                                                    {entry.event.title}
                                                </span>
                                            </button>
                                        );
                                    }
                                    if (entry.kind === 'now') {
                                        return (
                                            <div
                                                key="timeline-now"
                                                data-testid="timeline-now"
                                                className="my-1 flex items-center gap-2 px-2"
                                            >
                                                <span className="w-[52px] text-right text-xs font-semibold tabular-nums text-primary">
                                                    {formatMinute(entry.minute)}
                                                </span>
                                                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                                                <span className="h-px flex-1 bg-primary/70" />
                                                <span className="text-[11px] font-medium text-primary">
                                                    {t('today.now', 'Now')}
                                                </span>
                                            </div>
                                        );
                                    }
                                    const placements = fillFreeSlot(
                                        timeline.toPlace,
                                        entry
                                    );
                                    return (
                                        <div
                                            key={`free-${entry.startMinute}`}
                                            data-testid="timeline-free"
                                            className="mx-2 my-1 flex items-center justify-between gap-2 rounded-lg border border-dashed border-outline-variant/60 px-3 py-1.5 text-xs text-surface-on-variant"
                                        >
                                            <span>
                                                {formatDuration(entry.minutes)}{' '}
                                                {t('today.freeSlot', 'free')}
                                            </span>
                                            {placements.length > 0 &&
                                                onPlaceHere && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() =>
                                                            onPlaceHere(entry)
                                                        }
                                                    >
                                                        {t(
                                                            'today.placeHere',
                                                            'Place {{count}} here',
                                                            {
                                                                count: placements.length,
                                                            }
                                                        )}
                                                    </Button>
                                                )}
                                        </div>
                                    );
                                })}
                            </SortableContext>
                        </div>
                    </div>
                )}

                {!hasOpen && !loading && <EmptyState title={emptyText} />}

                {habits && (
                    <div className="py-1">
                        <SectionHead
                            label={t('today.habitsCount', 'Habits · {{n}}', {
                                n: habits.count,
                            })}
                            open={sections.habits}
                            onToggle={() => toggle('habits')}
                        />
                        {sections.habits && (
                            <div className="px-2">{habits.content}</div>
                        )}
                    </div>
                )}

                {tomorrow && tomorrow.count > 0 && (
                    <div className="py-1">
                        <SectionHead
                            label={t(
                                'today.tomorrowCount',
                                'Tomorrow · {{n}}',
                                {
                                    n: tomorrow.count,
                                }
                            )}
                            open={sections.tomorrow}
                            onToggle={() => toggle('tomorrow')}
                        />
                        {sections.tomorrow && (
                            <div className="px-2">{tomorrow.content}</div>
                        )}
                    </div>
                )}

                {suggestions && (
                    <div className="py-1">
                        <SectionHead
                            label={t(
                                'today.suggestionsCount',
                                'Suggestions · {{n}}',
                                {
                                    n: suggestions.count,
                                }
                            )}
                            open={sections.suggestions}
                            onToggle={() => toggle('suggestions')}
                        />
                        {sections.suggestions && (
                            <div className="px-2">{suggestions.content}</div>
                        )}
                    </div>
                )}

                {lines.done.length > 0 && (
                    <div className="py-1">
                        <SectionHead
                            label={t('today.doneCount', 'Done · {{n}}', {
                                n: lines.done.length,
                            })}
                            open={sections.done}
                            onToggle={() => toggle('done')}
                        />
                        {sections.done && (
                            <div role="list" className="px-2">
                                {lines.done.map((line) => (
                                    <TaskLine
                                        key={line.uid}
                                        line={line}
                                        dateOfDay={dateOfDay}
                                        onToggle={onToggle}
                                        onOpen={onOpen}
                                        menu={lineMenu(line)}
                                        sortable={false}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
};

export default DayList;
