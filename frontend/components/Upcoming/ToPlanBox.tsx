import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
    CalendarDaysIcon,
    ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import { DayLine, lineFromDue } from '../Today/dayModel';
import TaskCard, { cardId } from './TaskCard';
import type { ToPlanBox as Box } from './horizons';

// The pseudo-day of a card of the box: planned nowhere, so a drop on a day
// plans it (like an inbox card), and its menu commits it to a horizon.
export const TO_PLAN_CARD_DATE = 'toplan';

export type ToPlanGroup = keyof Box;

const GROUPS: ToPlanGroup[] = ['replan', 'week', 'month'];

export const toPlanCount = (box: Box | null): number =>
    box ? box.replan.length + box.week.length + box.month.length : 0;

const COLLAPSED_KEY = 'upcoming.toPlanCollapsed';

export const loadToPlanCollapsed = (): boolean => {
    try {
        return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
        return false;
    }
};

export const saveToPlanCollapsed = (collapsed: boolean): void => {
    try {
        localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
        // Private mode: the choice lasts until reload.
    }
};

export interface ToPlanBoxProps {
    box: Box;
    today: string;
    openTaskUid?: string | null;
    collapsed: boolean;
    onCollapsedChange(collapsed: boolean): void;
    // Under a collapsed inbox: a 44 px bar with the count; `onExpand` opens
    // the column and the box.
    thin?: boolean;
    onExpand?(): void;
    onOpenTask(line: DayLine): void;
    onToggleTask(line: DayLine): void;
    onToggleSubtask(subtask: Task): void;
}

/**
 * « À planifier », under the inbox of the Days layout: tasks whose week or
 * month has passed (« À replanifier », first, in red), then the ones
 * committed to this week and to this month (collapsed by default) that no
 * day of this week holds yet (toPlan in horizons.ts). Its cards are dragged
 * onto a day; their menu commits them to another horizon. Hidden when empty.
 */
const ToPlanBox: React.FC<ToPlanBoxProps> = ({
    box,
    today,
    openTaskUid = null,
    collapsed,
    onCollapsedChange,
    thin = false,
    onExpand,
    onOpenTask,
    onToggleTask,
    onToggleSubtask,
}) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState<Record<ToPlanGroup, boolean>>({
        replan: true,
        week: true,
        month: false,
    });
    const count = toPlanCount(box);
    if (count === 0) return null;
    const titles: Record<ToPlanGroup, string> = {
        replan: t('upcoming.replan', 'To replan'),
        week: t('upcoming.thisWeek', 'This week'),
        month: t('upcoming.thisMonth', 'This month'),
    };
    const title = t('upcoming.toPlan', 'To plan');

    if (thin) {
        return (
            <section
                aria-label={title}
                data-testid="to-plan-box"
                data-collapsed="true"
                className="flex w-11 shrink-0 flex-col items-center rounded-2xl bg-surface-high/50 py-2"
            >
                <button
                    type="button"
                    aria-expanded={false}
                    aria-label={t(
                        'upcoming.expandToPlan',
                        'Show what to plan ({{count}})',
                        { count }
                    )}
                    onClick={onExpand}
                    className={`flex w-9 flex-col items-center gap-1 rounded-lg py-2 hover:bg-surface-high focus-visible:outline-2 focus-visible:outline-primary ${
                        box.replan.length > 0
                            ? 'text-danger'
                            : 'text-surface-on-variant hover:text-surface-on'
                    }`}
                >
                    <CalendarDaysIcon aria-hidden="true" className="h-5 w-5" />
                    <span className="text-xs font-semibold tabular-nums">
                        {count}
                    </span>
                </button>
            </section>
        );
    }

    return (
        <section
            aria-label={title}
            data-testid="to-plan-box"
            className={`flex w-[260px] shrink-0 flex-col gap-1.5 overflow-y-auto rounded-2xl px-2 pb-2 ${
                collapsed ? '' : 'max-h-[45%]'
            }`}
        >
            <button
                type="button"
                aria-expanded={!collapsed}
                onClick={() => onCollapsedChange(!collapsed)}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-body font-semibold text-surface-on hover:bg-surface-high/60 focus-visible:outline-2 focus-visible:outline-primary"
            >
                <ChevronRightIcon
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 transition-transform duration-150 ${
                        collapsed ? '' : 'rotate-90'
                    }`}
                />
                <span className="min-w-0 flex-1 truncate text-left">
                    {title}
                </span>
                <span className="text-xs font-semibold tabular-nums text-surface-on-variant">
                    {count}
                </span>
            </button>
            {!collapsed &&
                GROUPS.map((group) => {
                    const tasks = box[group];
                    if (tasks.length === 0) return null;
                    const lines = tasks.map((task) => lineFromDue(task, today));
                    const replan = group === 'replan';
                    return (
                        <div
                            key={group}
                            data-testid={`to-plan-${group}`}
                            className={`flex flex-col gap-2 rounded-xl p-1.5 ${
                                replan
                                    ? 'border border-danger/30 bg-danger/5'
                                    : ''
                            }`}
                        >
                            <button
                                type="button"
                                aria-expanded={open[group]}
                                onClick={() =>
                                    setOpen((current) => ({
                                        ...current,
                                        [group]: !current[group],
                                    }))
                                }
                                className={`flex h-7 items-center gap-1.5 rounded-lg px-1.5 text-body-m font-semibold hover:bg-surface-high/60 focus-visible:outline-2 focus-visible:outline-primary ${
                                    replan ? 'text-danger' : 'text-surface-on'
                                }`}
                            >
                                <ChevronRightIcon
                                    aria-hidden="true"
                                    className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${
                                        open[group] ? 'rotate-90' : ''
                                    }`}
                                />
                                <span className="min-w-0 flex-1 truncate text-left">
                                    {titles[group]}
                                </span>
                                <span className="text-xs tabular-nums text-surface-on-variant">
                                    {tasks.length}
                                </span>
                            </button>
                            {open[group] && (
                                <div
                                    role="list"
                                    data-card-date={TO_PLAN_CARD_DATE}
                                    className="flex flex-col gap-2"
                                >
                                    <SortableContext
                                        items={lines.map((line) =>
                                            cardId(TO_PLAN_CARD_DATE, line.uid)
                                        )}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        {lines.map((line) => (
                                            <TaskCard
                                                key={line.uid}
                                                line={line}
                                                date={TO_PLAN_CARD_DATE}
                                                selected={
                                                    openTaskUid === line.uid
                                                }
                                                onToggle={onToggleTask}
                                                onOpen={onOpenTask}
                                                onToggleSubtask={
                                                    onToggleSubtask
                                                }
                                            />
                                        ))}
                                    </SortableContext>
                                </div>
                            )}
                        </div>
                    );
                })}
        </section>
    );
};

export default ToPlanBox;
