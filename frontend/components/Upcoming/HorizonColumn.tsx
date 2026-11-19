import React, { useRef, useState } from 'react';
import { parseISO } from 'date-fns';
import { ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Task } from '../../entities/Task';
import { intlLocale } from '../DailyPlan/planUtils';
import { DayLine, lineFromDue } from '../Today/dayModel';
import TaskCard, { cardId } from './TaskCard';
import { IconButton } from '../Shared/ui/Button';
import { FIELD_CLASS } from '../Shared/ui/controlSizes';
import type { HorizonKey } from './horizons';

export interface HorizonDropData {
    kind: 'horizon';
    key: HorizonKey;
}

// The pseudo-day a horizon card carries in its drag data.
export const horizonCardDate = (key: HorizonKey): string => `horizon:${key}`;

export const horizonFromCardDate = (date: string): HorizonKey | null =>
    date.startsWith('horizon:') ? (date.slice(8) as HorizonKey) : null;

interface HorizonColumnProps {
    horizon: HorizonKey;
    title: string;
    // One line under the title: what the horizon means.
    hint?: string;
    tasks: Task[] | null;
    // This week only: open tasks planned on one of its days.
    plannedOnDays?: { task: Task; date: string }[];
    today: string;
    openTaskUid: string | null;
    onOpen(line: DayLine): void;
    onToggle(line: DayLine): void;
    onToggleSubtask(subtask: Task): void;
    onAdd?(name: string): void;
    // Fills its grid row and scrolls its own cards (horizons side by side);
    // false: as tall as its cards (wrapped rows).
    fill?: boolean;
    // A section of the Days layout's left column: its title folds it (kept
    // per browser), folded from the start when `defaultCollapsed`.
    collapsible?: boolean;
    defaultCollapsed?: boolean;
    // After the count in the header (This week: the week's load).
    headerExtra?: React.ReactNode;
}

const collapsedKey = (horizon: HorizonKey) =>
    `upcoming.leftCollapsed.${horizon}`;

const readCollapsed = (horizon: HorizonKey, fallback: boolean): boolean => {
    try {
        const stored = localStorage.getItem(collapsedKey(horizon));
        return stored === null ? fallback : stored === '1';
    } catch {
        return fallback;
    }
};

/**
 * One horizon of the Plan page (This week, This month, Next month, Someday):
 * its open tasks as cards, a drop target that commits a task to it, and
 * "+ Add a task" at the end. This week also lists the tasks planned on one
 * of its days, collapsed unless nothing else is in the column.
 */
const HorizonColumn: React.FC<HorizonColumnProps> = ({
    horizon,
    title,
    hint,
    tasks,
    plannedOnDays = [],
    today,
    openTaskUid,
    onOpen,
    onToggle,
    onToggleSubtask,
    onAdd,
    fill = true,
    collapsible = false,
    defaultCollapsed = false,
    headerExtra,
}) => {
    const { t, i18n } = useTranslation();
    const [folded, setFolded] = useState(() =>
        collapsible ? readCollapsed(horizon, defaultCollapsed) : false
    );
    const toggleFolded = () => {
        const next = !folded;
        setFolded(next);
        try {
            localStorage.setItem(collapsedKey(horizon), next ? '1' : '0');
        } catch {
            // Folding still works for this visit.
        }
    };
    const [draft, setDraft] = useState('');
    const [adding, setAdding] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const openAdd = () => {
        setAdding(true);
        inputRef.current?.focus();
    };
    // null until toggled: open while nothing else is in the column, so the
    // week does not look empty when all its tasks have a day.
    const [plannedChoice, setPlannedChoice] = useState<boolean | null>(null);
    const nothingElse = tasks !== null && tasks.length === 0;
    const showPlanned = plannedChoice ?? nothingElse;
    const date = horizonCardDate(horizon);
    const dayLabel = new Intl.DateTimeFormat(intlLocale(i18n.language), {
        weekday: 'short',
        day: 'numeric',
    });
    const addLabel = t('upcoming.addTask', 'Add a task');
    const closeAdd = () => {
        setDraft('');
        setAdding(false);
    };
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const name = draft.trim();
        if (!name || !onAdd) return;
        setDraft('');
        onAdd(name);
    };
    const { setNodeRef, isOver } = useDroppable({
        id: `horizon:${horizon}`,
        data: { kind: 'horizon', key: horizon } satisfies HorizonDropData,
    });
    const lines = (tasks ?? []).map((task) => lineFromDue(task, today));

    return (
        <section
            ref={setNodeRef}
            data-testid="horizon-column"
            data-horizon={horizon}
            aria-label={title}
            className={`flex min-w-0 flex-col gap-2 rounded-2xl p-2 transition-colors duration-150 ${
                fill ? 'min-h-0' : ''
            } ${
                isOver
                    ? 'bg-primary-container/40 ring-1 ring-primary/40'
                    : 'bg-surface-high/50 ring-1 ring-outline-variant/40'
            }`}
        >
            <header className="px-2.5 py-2">
                <div className="flex items-baseline gap-2">
                    {/* What the horizon means is a tooltip, not a line read
                        every time. */}
                    <h2
                        title={hint}
                        className="min-w-0 text-body font-semibold text-surface-on"
                    >
                        {collapsible ? (
                            <button
                                type="button"
                                aria-expanded={!folded}
                                aria-label={t(
                                    'upcoming.sectionToggle',
                                    'Show or hide {{name}}',
                                    { name: title }
                                )}
                                onClick={toggleFolded}
                                className="-ml-1 flex items-center gap-1 rounded-md px-1 text-left hover:bg-surface-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                                <ChevronRightIcon
                                    aria-hidden="true"
                                    className={`h-3.5 w-3.5 shrink-0 text-surface-on-variant transition-transform duration-150 ${
                                        folded ? '' : 'rotate-90'
                                    }`}
                                />
                                {title}
                            </button>
                        ) : (
                            title
                        )}
                        {hint && <span className="sr-only">. {hint}</span>}
                    </h2>
                    {tasks && tasks.length > 0 && (
                        <span className="text-xs tabular-nums text-surface-on-variant">
                            {tasks.length}
                        </span>
                    )}
                    {headerExtra}
                    {onAdd && (
                        <IconButton
                            label={t(
                                'upcoming.addTaskIn',
                                'Add a task to {{name}}',
                                { name: title }
                            )}
                            onClick={openAdd}
                            className="-mr-1.5 ml-auto self-center"
                        >
                            <PlusIcon />
                        </IconButton>
                    )}
                </div>
            </header>
            {onAdd && adding && !folded && (
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
            {!folded && (
                <div
                    role="list"
                    className={`flex flex-col gap-2 px-0.5 pb-1 ${
                        fill ? 'min-h-0 flex-1 overflow-y-auto' : ''
                    }`}
                >
                    <SortableContext
                        items={lines.map((line) => cardId(date, line.uid))}
                        strategy={verticalListSortingStrategy}
                    >
                        {lines.map((line) => (
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
                    </SortableContext>
                    {nothingElse && (
                        <>
                            <p className="sr-only">
                                {t('upcoming.empty', 'Nothing planned.')}
                            </p>
                            {plannedOnDays.length > 0 && (
                                <p className="px-2.5 py-2 text-xs text-surface-on-variant">
                                    {t(
                                        'upcoming.plannedOnDayHint',
                                        '{{count}} planned on a day',
                                        { count: plannedOnDays.length }
                                    )}
                                </p>
                            )}
                        </>
                    )}
                    {plannedOnDays.length > 0 && (
                        <div className="flex flex-col gap-2 pt-1">
                            <button
                                type="button"
                                aria-expanded={showPlanned}
                                onClick={() => setPlannedChoice(!showPlanned)}
                                className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-left text-xs font-semibold uppercase tracking-wide text-surface-on-variant hover:bg-surface-high focus-visible:outline-2 focus-visible:outline-primary"
                            >
                                <ChevronRightIcon
                                    aria-hidden="true"
                                    className={`h-3.5 w-3.5 transition-transform duration-150 ${
                                        showPlanned ? 'rotate-90' : ''
                                    }`}
                                />
                                {t(
                                    'upcoming.plannedOnDay',
                                    'Planned on a day ({{count}})',
                                    { count: plannedOnDays.length }
                                )}
                            </button>
                            {showPlanned && (
                                <div
                                    role="list"
                                    className="flex flex-col gap-2"
                                >
                                    <SortableContext
                                        items={plannedOnDays.map(
                                            ({ task, date: on }) =>
                                                cardId(on, task.uid as string)
                                        )}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        {plannedOnDays.map(
                                            ({ task, date: on }) => (
                                                <div
                                                    key={task.uid}
                                                    data-card-date={on}
                                                    className="flex flex-col gap-0.5"
                                                >
                                                    <span className="px-1 text-xs text-surface-on-variant">
                                                        {dayLabel.format(
                                                            parseISO(on)
                                                        )}
                                                    </span>
                                                    <TaskCard
                                                        line={{
                                                            ...lineFromDue(
                                                                task,
                                                                on
                                                            ),
                                                            planned: true,
                                                        }}
                                                        date={on}
                                                        selected={
                                                            openTaskUid ===
                                                            task.uid
                                                        }
                                                        onToggle={onToggle}
                                                        onOpen={onOpen}
                                                        onToggleSubtask={
                                                            onToggleSubtask
                                                        }
                                                    />
                                                </div>
                                            )
                                        )}
                                    </SortableContext>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};

export default HorizonColumn;
