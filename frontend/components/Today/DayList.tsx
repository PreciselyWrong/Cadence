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
import TaskLine from './TaskLine';
import { DayLine, DayLines } from './dayModel';

const SECTIONS_KEY = 'today.sections';

type SectionKey = 'overdue' | 'suggestions' | 'done';

const CLOSED: Record<SectionKey, boolean> = {
    overdue: false,
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
    suggestions: { count: number; content: React.ReactNode } | null;
    emptyText: string;
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
    organize,
    extraActions,
    expanded = false,
    onToggleSubtask,
    showDayNav = true,
    addField,
    slip,
    lines,
    dateOfDay,
    currentUid,
    selectedUid,
    lineMenu,
    onToggle,
    onOpen,
    overdue,
    suggestions,
    emptyText,
}) => {
    const { t } = useTranslation();
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

    const timedIds = lines.timed.map((line) => `line:${line.uid}`);
    const anytimeIds = lines.anytime.map((line) => `line:${line.uid}`);
    const hasOpen = lines.timed.length > 0 || lines.anytime.length > 0;

    const row = (line: DayLine) => (
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
        />
    );

    return (
        <section
            aria-label={title}
            className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface"
        >
            <header className="sticky top-0 z-10 bg-surface px-6 pb-3 pt-6 max-sm:px-4">
                <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-2">
                    <h1 className="mr-1 flex min-w-0 max-w-full items-baseline gap-2">
                        <span className="shrink-0 text-headline font-extrabold tracking-tight text-surface-on">
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
                    {showDayNav && !isToday && (
                        <Button variant="ghost" size="sm" onClick={onToday}>
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
                            entries={headerMenu}
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
                        {summaryText}
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

                <div role="list" className="px-2">
                    <SortableContext
                        items={timedIds}
                        strategy={verticalListSortingStrategy}
                    >
                        {lines.timed.map(row)}
                    </SortableContext>
                </div>

                {lines.timed.length > 0 && lines.anytime.length > 0 && (
                    <div className="mx-4 my-1.5 h-px bg-outline-variant/60" />
                )}

                <div role="list" className="px-2">
                    <SortableContext
                        items={anytimeIds}
                        strategy={verticalListSortingStrategy}
                    >
                        {lines.anytime.map(row)}
                    </SortableContext>
                </div>

                {!hasOpen && (
                    <p className="px-6 py-6 text-body-m text-surface-on-variant">
                        {emptyText}
                    </p>
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
