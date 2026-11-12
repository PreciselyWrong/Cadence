import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Task } from '../../entities/Task';
import { DayLine, lineFromDue } from '../Today/dayModel';
import TaskCard, { cardId } from './TaskCard';
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
    tasks: Task[] | null;
    today: string;
    openTaskUid: string | null;
    onOpen(line: DayLine): void;
    onToggle(line: DayLine): void;
    onToggleSubtask(subtask: Task): void;
}

/**
 * One horizon of the Plan page (This week, This month, Next month, Someday):
 * its open tasks as cards, a drop target that commits a task to it.
 */
const HorizonColumn: React.FC<HorizonColumnProps> = ({
    horizon,
    title,
    tasks,
    today,
    openTaskUid,
    onOpen,
    onToggle,
    onToggleSubtask,
}) => {
    const { t } = useTranslation();
    const date = horizonCardDate(horizon);
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
            className={`flex min-h-0 min-w-[260px] flex-1 flex-col gap-2 rounded-2xl p-2 transition-colors duration-150 ${
                isOver ? 'bg-primary-container/40' : ''
            }`}
        >
            <header className="flex items-baseline gap-2 px-2.5 py-2">
                <h2 className="text-body font-semibold text-surface-on">
                    {title}
                </h2>
                {tasks && tasks.length > 0 && (
                    <span className="text-xs tabular-nums text-surface-on-variant">
                        {tasks.length}
                    </span>
                )}
            </header>
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
                {tasks && tasks.length === 0 && (
                    <p className="px-2.5 pt-1 text-body-m text-surface-on-variant">
                        {t('upcoming.horizonsEmpty', 'Nothing here yet.')}
                    </p>
                )}
            </div>
        </section>
    );
};

export default HorizonColumn;
