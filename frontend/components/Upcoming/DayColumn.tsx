import React, { useRef, useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { addDays, getDay, getISOWeek, isTomorrow, parseISO } from 'date-fns';
import { Task } from '../../entities/Task';
import type { DayResponse } from '../../utils/dayService';
import { formatDuration, intlLocale } from '../DailyPlan/planUtils';
import { DayLine, dayLines } from '../Today/dayModel';
import TaskCard, { cardId } from './TaskCard';
import { progressOf } from './planOps';
import { IconButton } from '../Shared/ui/Button';
import EmptyState from '../Shared/ui/EmptyState';
import { FIELD_CLASS } from '../Shared/ui/controlSizes';
import { weekdayTitle } from './dayLabel';
import { cardTaskKeys, dayLoad, groupCards, sortCards } from './groupCards';
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
    // Minutes the viewer has free that day; the header shows the load against it.
    availableMinutes?: number;
    // First day of the week, 0 (Sunday) to 6; the ISO week is labelled above it.
    weekStartsOn?: number;
    onSelect(date: string): void;
    // Resolving to false (or rejecting) keeps the typed text for a retry;
    // void or true clears it.
    onAdd(date: string, name: string): Promise<boolean> | boolean | void;
    onOpen(line: DayLine): void;
    onToggle(line: DayLine): void;
    onToggleSubtask(subtask: Task): void;
}

/**
 * One day of the board: a header with the day name, card count, planned load
 * and a progress bar, then the open cards, optionally in sub-groups, and a
 * "+ Add task" button at the end. Done cards sit last, under a "Done" toggle
 * that is collapsed by default (hidden when showCompleted is off). The column
 * is a drop target for cards of other days.
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
    availableMinutes,
    weekStartsOn = 1,
    onSelect,
    onAdd,
    onOpen,
    onToggle,
    onToggleSubtask,
}) => {
    const { t, i18n } = useTranslation();
    const [draft, setDraft] = useState('');
    const [adding, setAdding] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    // The header's "+": opens the add field at the end, or focuses it.
    const openAdd = () => {
        setAdding(true);
        inputRef.current?.focus();
    };
    const [doneOpen, setDoneOpen] = useState(false);
    const locale = intlLocale(i18n.language);
    const at = parseISO(date);
    const lines = day ? dayLines(day.plan?.items ?? [], day.due, date) : null;
    const open = lines
        ? sortCards([...lines.timed, ...lines.anytime], sortBy)
        : [];
    const done = lines && showCompleted ? lines.done : [];
    const groups = groupCards(open, groupBy, (key, fallback) =>
        t(key, fallback)
    );
    // A subtask with a card of its own in this column is not listed again.
    const ownCardKeys = cardTaskKeys([...open, ...done]);
    const load = dayLoad(open);
    const overLoad = availableMinutes !== undefined && load > availableMinutes;
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

    // Clears the draft only when the add was not refused: a refusal (false)
    // keeps the text, and so does a rejected promise. Text typed while an
    // async add was pending is kept too.
    const settle = (name: string, added: boolean | void) => {
        if (added === false) return;
        setDraft((current) => (current.trim() === name ? '' : current));
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const name = draft.trim();
        if (!name) return;
        const result = onAdd(date, name);
        if (result instanceof Promise) {
            try {
                settle(name, await result);
            } catch {
                // The add failed: the draft stays for another try.
            }
            return;
        }
        settle(name, result);
    };

    const closeAdd = () => {
        setDraft('');
        setAdding(false);
    };

    const relative = isToday
        ? t('today.title', 'Today')
        : isTomorrow(at)
          ? t('upcoming.tomorrow', 'Tomorrow')
          : null;
    // Line 1 names the day; line 2 dates it, with the weekday too when line 1
    // is a relative name (line 1 "Today", line 2 "jeu. 12 nov." in French).
    const label = relative ?? weekdayTitle(at, locale);
    const dateText = new Intl.DateTimeFormat(
        locale,
        relative
            ? { weekday: 'short', day: 'numeric', month: 'short' }
            : { day: 'numeric', month: 'short' }
    ).format(at);
    const weekend = getDay(at) === 0 || getDay(at) === 6;
    // ISO weeks count from Monday; the Wednesday-to-Thursday day of a week
    // (three days after its first day) always falls in the week it names.
    const startsWeek = getDay(at) === weekStartsOn;
    const weekNumber = getISOWeek(addDays(at, 3));

    const renderCard = (line: DayLine) => (
        <TaskCard
            key={line.uid}
            line={line}
            date={date}
            selected={openTaskUid === line.uid}
            ownCardKeys={ownCardKeys}
            onToggle={onToggle}
            onOpen={onOpen}
            onToggleSubtask={onToggleSubtask}
        />
    );

    return (
        <section
            ref={setNodeRef}
            data-testid="upcoming-column"
            data-date={date}
            aria-label={`${label} · ${dateText}`}
            onFocus={() => onSelect(date)}
            onClick={() => onSelect(date)}
            className={`flex min-h-0 min-w-[260px] flex-1 flex-col gap-2 rounded-2xl p-2 transition-colors duration-150 ${
                isOver
                    ? 'bg-primary-container/40'
                    : selected
                      ? 'bg-primary/5 ring-1 ring-inset ring-primary/40'
                      : ''
            }`}
        >
            {startsWeek && (
                <p className="px-2.5 text-xs font-semibold uppercase tracking-wide text-surface-on-variant">
                    {t('upcoming.week', 'Week {{number}}', {
                        number: weekNumber,
                    })}
                </p>
            )}
            <header
                data-weekend={weekend}
                className={`flex flex-col gap-1.5 rounded-xl px-2.5 py-2 ${
                    isToday
                        ? 'bg-primary-container/50'
                        : weekend
                          ? 'bg-surface-high/60'
                          : ''
                }`}
            >
                <div className="flex h-7 items-center gap-2">
                    <h2
                        className={`whitespace-nowrap text-body font-semibold ${
                            isToday ? 'text-primary' : 'text-surface-on'
                        }`}
                    >
                        {label}
                    </h2>
                    <span className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap text-xs tabular-nums text-surface-on-variant">
                        <span>{progress.total}</span>
                        {(availableMinutes !== undefined || load > 0) && (
                            <span
                                data-testid="upcoming-load"
                                data-over={overLoad}
                                className={`whitespace-nowrap tabular-nums ${
                                    overLoad
                                        ? 'rounded-md bg-danger-container px-1.5 py-0.5 font-semibold text-danger-on-container'
                                        : ''
                                }`}
                            >
                                {availableMinutes === undefined
                                    ? formatDuration(load)
                                    : t(
                                          'upcoming.load',
                                          '{{planned}} / {{available}}',
                                          {
                                              planned: formatDuration(load),
                                              available:
                                                  formatDuration(
                                                      availableMinutes
                                                  ),
                                          }
                                      )}
                            </span>
                        )}
                    </span>
                    <IconButton
                        label={t(
                            'upcoming.addTaskIn',
                            'Add a task to {{name}}',
                            {
                                name: label,
                            }
                        )}
                        onClick={openAdd}
                        className="-mr-1.5"
                    >
                        <PlusIcon />
                    </IconButton>
                </div>
                <p className="h-4 whitespace-nowrap text-xs tabular-nums text-surface-on-variant">
                    <time dateTime={date}>{dateText}</time>
                </p>
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

            {adding && (
                <form onSubmit={submit}>
                    <input
                        ref={inputRef}
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
                        className={FIELD_CLASS}
                    />
                </form>
            )}
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
                                {group.cards.map(renderCard)}
                            </div>
                        </div>
                    ))}
                    {done.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                aria-expanded={doneOpen}
                                onClick={() => setDoneOpen((value) => !value)}
                                className="flex h-8 items-center gap-1.5 rounded-lg px-1 text-left text-xs font-semibold uppercase tracking-wide text-surface-on-variant hover:bg-surface-high hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                            >
                                <span aria-hidden="true">
                                    {doneOpen ? '▾' : '▸'}
                                </span>
                                {t('upcoming.done', 'Done ({{n}})', {
                                    n: done.length,
                                })}
                            </button>
                            {doneOpen && (
                                <div
                                    role="list"
                                    className="flex flex-col gap-2"
                                >
                                    {done.map(renderCard)}
                                </div>
                            )}
                        </div>
                    )}
                </SortableContext>
                {lines && progress.total === 0 && (
                    <EmptyState
                        className="py-6"
                        title={t('upcoming.empty', 'Nothing planned.')}
                    />
                )}
            </div>
        </section>
    );
};

export default DayColumn;
