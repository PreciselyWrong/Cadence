import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FlagIcon } from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import { formatDuration, formatMinute } from '../DailyPlan/planUtils';
import { DayLine, lineAt } from '../Today/dayModel';
import { subtasksWithoutCard } from './groupCards';
import TaskCardBody, { taskCardClass } from '../Shared/task/TaskCardBody';
import { isPickClick, PickedCardsContext } from './pickedCards';
import { PushedBadge } from './PushedSection';
import { QuickPlaceContext } from './firstFreeDay';
import { CardMenuContext } from './cardMenu';

const QUICK_PLACES = [
    'inbox',
    'horizon:week',
    'horizon:next_week',
    'horizon:this_month',
];
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import {
    PreviewCard,
    PreviewTrace,
    useWeekPreviewContext,
} from './WeekPreview';

export const cardId = (date: string, uid: string): string =>
    `card:${date}:${uid}`;

// What a drop needs to know about the card, read back in the board's onDragEnd.
export interface CardData {
    kind: 'card';
    uid: string;
    date: string;
    planned: boolean;
    timed: boolean;
    duration: number;
}

export interface TaskCardProps {
    line: DayLine;
    date: string;
    // Its detail is open in the side pane.
    selected: boolean;
    // Keys of the tasks that have a card of their own in the column; such a
    // subtask is not listed under its parent.
    ownCardKeys?: ReadonlySet<string>;
    onToggle(line: DayLine): void;
    onOpen(line: DayLine): void;
    onToggleSubtask(subtask: Task): void;
}

/**
 * One task of a day as a card, Todoist-style: a round check and the title on
 * the first line; a subtask also names its parent; below, a meta line (time,
 * duration, then project and tag on the right). The first line of the note is
 * greyed. Nothing appears on hover. Enter opens; only the check toggles, and
 * open cards can be dragged (Space picks one up from the keyboard).
 */
const TaskCard: React.FC<TaskCardProps> = ({
    line,
    date,
    selected,
    ownCardKeys = new Set<string>(),
    onToggle,
    onOpen,
    onToggleSubtask,
}) => {
    const { task, uid } = line;
    const subtasks = subtasksWithoutCard(task.subtasks ?? [], ownCardKeys);
    const at = lineAt(line);
    const data: CardData = {
        kind: 'card',
        uid,
        date,
        planned: line.planned,
        timed: at !== null,
        duration: line.duration,
    };
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: cardId(date, uid),
        data,
        disabled: line.done,
    });
    const { onKeyDown: dragKeyDown, ...dragListeners } = listeners ?? {};
    const { t } = useTranslation();
    // Inbox, « This week », « Next week » and « This month » cards: a
    // button to the first day with room.
    const quick = useContext(QuickPlaceContext);
    const quickDate =
        quick && !line.done && QUICK_PLACES.includes(date)
            ? quick.suggest(task.estimated_minutes, date)
            : null;
    const pick = useContext(PickedCardsContext);
    const openMenu = useContext(CardMenuContext);
    const picked = !!pick?.picked.has(uid);
    // While the AI's week is previewed, a decided task shows as its proposal
    // here (its new day) or as a trace (it leaves this place).
    const preview = useWeekPreviewContext();
    const move = preview?.state.moves.find((m) => m.uid === uid);

    if (move) {
        return move.to.kind === 'day' && move.to.date === date ? (
            <PreviewCard move={move} />
        ) : (
            <PreviewTrace move={move} />
        );
    }

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            onOpen(line);
            return;
        }
        if (
            openMenu &&
            (event.key === 'ContextMenu' ||
                (event.key === 'F10' && event.shiftKey))
        ) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            openMenu(task, event.currentTarget, {
                x: rect.left + 16,
                y: rect.bottom,
            });
            return;
        }
        dragKeyDown?.(event);
    };

    return (
        <div
            ref={setNodeRef}
            role="listitem"
            tabIndex={0}
            data-testid="upcoming-card"
            data-task-row=""
            data-uid={uid}
            data-task-uid={uid}
            aria-selected={selected || picked}
            data-picked={picked || undefined}
            aria-label={task.name}
            style={{
                transform: CSS.Transform.toString(transform),
                transition: isDragging ? undefined : transition,
            }}
            {...attributes}
            {...dragListeners}
            onKeyDown={onKeyDown}
            onContextMenu={
                openMenu
                    ? (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openMenu(task, event.currentTarget, {
                              x: event.clientX,
                              y: event.clientY,
                          });
                      }
                    : undefined
            }
            onMouseDown={(event) => {
                // Shift click picks the card; it must not select text.
                if (pick && event.shiftKey) event.preventDefault();
            }}
            onClick={(event) => {
                if (pick && isPickClick(event)) {
                    event.preventDefault();
                    pick.toggle(data);
                    return;
                }
                onOpen(line);
            }}
            className={`${taskCardClass(selected, isDragging)} ${
                picked ? '!bg-primary-container/50 ring-2 ring-primary/70' : ''
            }`}
        >
            <TaskCardBody
                task={task}
                done={line.done}
                onToggle={() => onToggle(line)}
                subtasks={subtasks}
                onToggleSubtask={onToggleSubtask}
                meta={
                    <>
                        {quickDate && quick && (
                            <button
                                type="button"
                                data-testid="quick-place"
                                title={t(
                                    'upcoming.quickPlaceTitle',
                                    'Plan on {{day}}: the first day with room for it',
                                    { day: quick.label(quickDate) }
                                )}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    quick.place(data, quickDate);
                                }}
                                onPointerDown={(event) =>
                                    event.stopPropagation()
                                }
                                onKeyDown={(event) => event.stopPropagation()}
                                className="order-last ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary-container/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                                <ArrowRightIcon
                                    aria-hidden="true"
                                    className="h-3 w-3"
                                />
                                {quick.label(quickDate)}
                            </button>
                        )}
                        <PushedBadge uid={uid} />
                        {at !== null && (
                            <span
                                className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums ${
                                    line.start !== null
                                        ? 'text-primary'
                                        : 'text-surface-on-variant'
                                }`}
                            >
                                {line.start === null && (
                                    <FlagIcon
                                        aria-hidden="true"
                                        className="h-3 w-3"
                                    />
                                )}
                                {formatMinute(at)}
                            </span>
                        )}
                        {line.durationKnown && (
                            <span className="shrink-0 text-xs tabular-nums text-surface-on-variant">
                                {formatDuration(line.duration)}
                            </span>
                        )}
                    </>
                }
            />
        </div>
    );
};

export default TaskCard;
