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
}

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
}) => {
    const { t, i18n } = useTranslation();
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
            className={`flex min-h-0 min-w-0 flex-col gap-2 rounded-2xl p-2 transition-colors duration-150 ${
                isOver ? 'bg-primary-container/40' : ''
            }`}
        >
            <header className="px-2.5 py-2">
                <div className="flex items-baseline gap-2">
                    <h2 className="text-body font-semibold text-surface-on">
                        {title}
                    </h2>
                    {tasks && tasks.length > 0 && (
                        <span className="text-xs tabular-nums text-surface-on-variant">
                            {tasks.length}
                        </span>
                    )}
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
                {hint && (
                    <p className="text-xs text-surface-on-variant">{hint}</p>
                )}
            </header>
            {onAdd && adding && (
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
                        className="h-9 w-full rounded-lg bg-surface px-3 text-body-m text-surface-on placeholder:text-surface-on-variant ring-1 ring-inset ring-outline-variant/60 focus:outline-none focus:ring-2 focus:ring-primary/60"
                    />
                </form>
            )}
            <div
                role="list"
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-0.5 pb-1"
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
                    <p className="px-2.5 pt-1 text-body-m text-surface-on-variant">
                        {plannedOnDays.length > 0
                            ? t(
                                  'upcoming.thisWeekOnlyPlanned',
                                  'Nothing without a fixed day · {{count}} planned on a day',
                                  { count: plannedOnDays.length }
                              )
                            : t('upcoming.horizonsEmpty', 'Nothing here yet.')}
                    </p>
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
                            <div role="list" className="flex flex-col gap-2">
                                <SortableContext
                                    items={plannedOnDays.map(
                                        ({ task, date: on }) =>
                                            cardId(on, task.uid as string)
                                    )}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {plannedOnDays.map(({ task, date: on }) => (
                                        <div
                                            key={task.uid}
                                            data-card-date={on}
                                            className="flex flex-col gap-0.5"
                                        >
                                            <span className="px-1 text-xs text-surface-on-variant">
                                                {dayLabel.format(parseISO(on))}
                                            </span>
                                            <TaskCard
                                                line={{
                                                    ...lineFromDue(task, on),
                                                    planned: true,
                                                }}
                                                date={on}
                                                selected={
                                                    openTaskUid === task.uid
                                                }
                                                onToggle={onToggle}
                                                onOpen={onOpen}
                                                onToggleSubtask={
                                                    onToggleSubtask
                                                }
                                            />
                                        </div>
                                    ))}
                                </SortableContext>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
};

export default HorizonColumn;
