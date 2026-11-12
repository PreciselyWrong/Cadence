import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { parseISO } from 'date-fns';
import { Task } from '../../entities/Task';
import type { DayResponse } from '../../utils/dayService';
import { intlLocale } from '../DailyPlan/planUtils';
import { DayLine, dayLines } from '../Today/dayModel';
import TaskCard, { cardId } from './TaskCard';
import { progressOf } from './planOps';
import { groupCards, sortCards } from './groupCards';
import type { GroupBy, SortBy } from './viewOptions';

export interface ColumnDropData {
    kind: 'column';
    date: string;
}

export interface DayColumnProps {
    date: string;
    isToday: boolean;
    day: DayResponse | undefined;
    // The day the calendar shows.
    selected: boolean;
    openTaskUid: string | null;
    // Display options of the Plan view menu.
    groupBy?: GroupBy;
    sortBy?: SortBy;
    showCompleted?: boolean;
    onSelect(date: string): void;
    onAdd(date: string, name: string): void;
    onOpen(line: DayLine): void;
    onToggle(line: DayLine): void;
    onToggleSubtask(subtask: Task): void;
}

/**
 * One day of the board: weekday, date and card count, a progress bar, then
 * the day's cards, optionally in sub-groups, and a "+ Add task" button at the
 * end. Open cards come first, done ones after them (hidden when showCompleted
 * is off). The column is a drop target for cards of other days.
 */
const DayColumn: React.FC<DayColumnProps> = ({
    date,
    isToday,
    day,
    selected,
    openTaskUid,
    groupBy = 'none',
    sortBy = 'plan',
    showCompleted = true,
    onSelect,
    onAdd,
    onOpen,
    onToggle,
    onToggleSubtask,
}) => {
    const { t, i18n } = useTranslation();
    const [draft, setDraft] = useState('');
    const [adding, setAdding] = useState(false);
    const locale = intlLocale(i18n.language);
    const at = parseISO(date);
    const lines = day ? dayLines(day.plan?.items ?? [], day.due, date) : null;
    const open = lines
        ? sortCards([...lines.timed, ...lines.anytime], sortBy)
        : [];
    const done = lines && showCompleted ? sortCards(lines.done, sortBy) : [];
    const groups = groupCards([...open, ...done], groupBy, (key, fallback) =>
        t(key, fallback)
    );
    const progress = lines ? progressOf(lines) : { done: 0, total: 0 };
    const percent =
        progress.total === 0
            ? 0
            : Math.round((progress.done / progress.total) * 100);
    const { setNodeRef, isOver } = useDroppable({
        id: `column:${date}`,
        data: { kind: 'column', date } satisfies ColumnDropData,
    });

    const addLabel = t('upcoming.addTask', 'Add a task');

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const name = draft.trim();
        if (!name) return;
        setDraft('');
        onAdd(date, name);
    };

    const closeAdd = () => {
        setDraft('');
        setAdding(false);
    };

    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(
        at
    );
    const dayLabel = new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
    }).format(at);

    return (
        <section
            ref={setNodeRef}
            data-testid="upcoming-column"
            data-date={date}
            aria-label={`${weekday} ${dayLabel}`}
            onFocus={() => onSelect(date)}
            onClick={() => onSelect(date)}
            className={`flex min-h-0 min-w-[260px] flex-1 flex-col gap-2 rounded-2xl p-2 transition-colors duration-150 ${
                isOver
                    ? 'bg-primary-container/40'
                    : selected
                      ? 'bg-surface-high/40'
                      : ''
            }`}
        >
            <header
                className={`flex flex-col gap-1.5 rounded-xl px-2.5 py-2 ${
                    isToday ? 'bg-primary-container/50' : ''
                }`}
            >
                <div className="flex items-baseline gap-2">
                    <h2 className="text-body font-semibold text-surface-on">
                        {weekday}
                    </h2>
                    {isToday && (
                        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                            {t('today.title', 'Today')}
                        </span>
                    )}
                    <span
                        className={`text-body-m ${
                            isToday
                                ? 'font-semibold text-primary'
                                : 'text-surface-on-variant'
                        }`}
                    >
                        {dayLabel}
                    </span>
                    <span className="ml-auto text-xs tabular-nums text-surface-on-variant">
                        {progress.total}
                    </span>
                </div>
                <div
                    role="progressbar"
                    aria-label={t(
                        'upcoming.progress',
                        '{{done}} of {{total}} done',
                        {
                            done: progress.done,
                            total: progress.total,
                        }
                    )}
                    aria-valuemin={0}
                    aria-valuemax={progress.total}
                    aria-valuenow={progress.done}
                    className="h-1 overflow-hidden rounded-full bg-surface-highest"
                >
                    <div
                        className="h-full rounded-full bg-primary transition-[width] duration-150"
                        style={{ width: `${percent}%` }}
                    />
                </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-0.5 pb-1">
                <SortableContext
                    items={open.map((line) => cardId(date, line.uid))}
                    strategy={verticalListSortingStrategy}
                >
                    {groups.map((group) => (
                        <div
                            key={group.key}
                            role="group"
                            aria-label={group.label || undefined}
                            className="flex flex-col gap-2"
                        >
                            {groupBy !== 'none' && (
                                <h3 className="flex items-baseline gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-surface-on-variant">
                                    <span>{group.label}</span>
                                    <span className="tabular-nums">
                                        {group.cards.length}
                                    </span>
                                </h3>
                            )}
                            <div role="list" className="flex flex-col gap-2">
                                {group.cards.map((line) => (
                                    <TaskCard
                                        key={line.uid}
                                        line={line}
                                        date={date}
                                        selected={openTaskUid === line.uid}
                                        onToggle={onToggle}
                                        onOpen={onOpen}
                                        onToggleSubtask={onToggleSubtask}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </SortableContext>
                {lines && progress.total === 0 && (
                    <p className="px-1 pt-2 text-body-m text-surface-on-variant">
                        {t('upcoming.empty', 'Nothing planned.')}
                    </p>
                )}
            </div>

            {adding ? (
                <form onSubmit={submit}>
                    <input
                        type="text"
                        autoFocus
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={() => {
                            if (!draft.trim()) closeAdd();
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') closeAdd();
                        }}
                        placeholder={addLabel}
                        aria-label={addLabel}
                        className="h-9 w-full rounded-lg bg-surface px-3 text-body-m text-surface-on placeholder:text-surface-on-variant ring-1 ring-inset ring-outline-variant/60 focus:outline-none focus:ring-2 focus:ring-primary/60"
                    />
                </form>
            ) : (
                <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="flex h-9 w-full items-center gap-1.5 rounded-lg px-2.5 text-left text-body-m text-surface-on-variant hover:bg-surface-high hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                >
                    <span aria-hidden="true" className="text-base leading-none">
                        +
                    </span>
                    {addLabel}
                </button>
            )}
        </section>
    );
};

export default DayColumn;
