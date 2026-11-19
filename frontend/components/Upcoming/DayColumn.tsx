import React, { useRef, useState } from 'react';
import { CalendarIcon, PlusIcon } from '@heroicons/react/24/outline';
import { AgendaEvent, dayAgenda } from './dayAgenda';
import type { CalendarEvent } from '../../utils/calendarFeedsService';
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
import { FIELD_CLASS } from '../Shared/ui/controlSizes';
import { weekdayTitle } from './dayLabel';
import { cardTaskKeys, dayLoad, groupCards, sortCards } from './groupCards';
import type { GroupBy, SortBy } from './viewOptions';
import { PreviewCard, useWeekPreviewContext } from './WeekPreview';

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
    // The agenda's events of the day, shown at the top of the column when
    // the calendar is merged into the days.
    events?: {
        title: string;
        start?: string;
        end?: string;
        all_day: boolean;
        // The agenda's event, opened in its detail on a click.
        source?: CalendarEvent;
    }[];
    onOpenEvent?(event: CalendarEvent, date: string): void;
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
    events: dayEvents = [],
    weekStartsOn = 1,
    onSelect,
    onAdd,
    onOpen,
    onToggle,
    onToggleSubtask,
    onOpenEvent,
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
    // The AI's week previewed: cards arriving here, cards leaving, the day's
    // events, and the load before → after.
    const preview = useWeekPreviewContext();
    const previewing = !!preview?.state.ready;
    const shownUids = new Set(
        (lines ? [...open, ...done] : []).map((l) => l.uid)
    );
    const arriving = previewing
        ? preview!.state.moves.filter(
              (move) =>
                  move.to.kind === 'day' &&
                  move.to.date === date &&
                  !shownUids.has(move.uid)
          )
        : [];
    const leavingMinutes = previewing
        ? open
              .filter((line) => {
                  const move = preview!.state.moves.find(
                      (m) => m.uid === line.uid
                  );
                  return (
                      move && !(move.to.kind === 'day' && move.to.date === date)
                  );
              })
              .reduce((sum, line) => sum + line.duration, 0)
        : 0;
    const events = previewing
        ? (preview!.state.detail?.days?.find((d) => d.date === date)?.events ??
          [])
        : dayEvents;
    const loadBefore = dayLoad(open);
    const load =
        loadBefore -
        leavingMinutes +
        arriving.reduce((sum, move) => sum + move.minutes, 0);
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

    // Merged calendar: the events sit between the cards in time order,
    // unless the cards are grouped or sorted by something else than time.
    const interleave =
        groupBy === 'none' && (sortBy === 'plan' || sortBy === 'time');
    const renderEvent = (
        event: AgendaEvent & { source?: CalendarEvent },
        i?: number
    ) => {
        const source = event.source;
        // A card like the tasks', with a calendar in the calendar's colour
        // where a task has its check (as on Android).
        const body = (
            <span className="flex items-start gap-2.5">
                <CalendarIcon
                    aria-hidden="true"
                    data-testid="event-mark"
                    style={{ color: source?.color || undefined }}
                    className="mt-px h-[18px] w-[18px] shrink-0 text-primary"
                />
                <span className="min-w-0 flex-1">
                    <span className="block break-words text-body-m font-medium leading-5 text-surface-on">
                        {event.title}
                    </span>
                    <span className="mt-1 block text-xs tabular-nums text-surface-on-variant">
                        {event.all_day
                            ? t('upcoming.preview.allDay', 'All day')
                            : `${event.start}–${event.end}`}
                    </span>
                </span>
            </span>
        );
        const tone =
            'block w-full rounded-lg border border-outline-variant/50 bg-surface p-3 text-left';
        return (
            <div
                key={`event-${event.title}-${event.start ?? 'day'}-${i ?? ''}`}
                role="listitem"
                data-testid="day-event"
            >
                {source && onOpenEvent ? (
                    <button
                        type="button"
                        onClick={() => onOpenEvent(source, date)}
                        className={`${tone} transition-colors duration-150 hover:border-outline-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60`}
                    >
                        {body}
                    </button>
                ) : (
                    <div className={tone}>{body}</div>
                )}
            </div>
        );
    };
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
                        {progress.total > 0 && (
                            <span data-testid="upcoming-count">
                                {progress.total}
                            </span>
                        )}
                        {(load > 0 || loadBefore > 0) && (
                            <span
                                data-testid="upcoming-load"
                                data-over={overLoad}
                                className={`whitespace-nowrap tabular-nums ${
                                    overLoad
                                        ? 'rounded-md bg-danger-container px-1.5 py-0.5 font-semibold text-danger-on-container'
                                        : ''
                                }`}
                            >
                                {previewing && loadBefore !== load && (
                                    <span className="text-surface-on-variant">
                                        {formatDuration(loadBefore)} →{' '}
                                    </span>
                                )}
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
                {/* An empty day keeps the row, so headers stay aligned. */}
                {progress.total === 0 ? (
                    <div aria-hidden="true" className="h-1" />
                ) : (
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
                )}
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
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto -mx-1.5 px-2 pb-2 pt-1.5">
                {(!interleave || open.length === 0) && events.length > 0 && (
                    <div className="flex flex-col gap-2">
                        {events.map(renderEvent)}
                    </div>
                )}
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
                                {interleave
                                    ? dayAgenda(group.cards, events).map(
                                          (row, i) =>
                                              row.kind === 'card'
                                                  ? renderCard(row.card)
                                                  : renderEvent(row.event, i)
                                      )
                                    : group.cards.map(renderCard)}
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
                {/* An empty day stays blank: the cards are what the eye
                    should meet. */}
                {arriving.length > 0 && (
                    <div className="flex flex-col gap-2">
                        {arriving.map((move) => (
                            <PreviewCard key={move.uid} move={move} />
                        ))}
                    </div>
                )}
                {lines && progress.total === 0 && arriving.length === 0 && (
                    <p className="sr-only">
                        {t('upcoming.empty', 'Nothing planned.')}
                    </p>
                )}
            </div>
        </section>
    );
};

export default DayColumn;
