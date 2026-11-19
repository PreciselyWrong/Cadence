import React, { createContext, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
    ArrowPathIcon,
    ChevronRightIcon,
    CheckIcon,
    EyeIcon,
    SparklesIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import Button from '../Shared/ui/Button';
import Menu, { MenuEntry } from '../Shared/ui/Menu';
import { formatDuration } from '../DailyPlan/planUtils';
import type { Decision } from '../Proposals/weekDecisions';
import type { HorizonKey } from './horizons';
import { PreviewMove, PreviewPlace, samePlace } from './weekPreview';
import type { WeekPreviewState } from './useWeekPreview';

// The AI's week shown over the Plan board (docs/03-upcoming-view.md › Week
// preview): violet cards where a decision sends a task, a dashed trace where
// it stands now. Hovering one rings the other; nothing changes size.

export interface WeekPreviewContextValue {
    state: WeekPreviewState;
    hover: string | null;
    setHover(uid: string | null): void;
    placeLabel(place: PreviewPlace): string;
    openTask(uid: string): void;
}

export const WeekPreviewContext = createContext<WeekPreviewContextValue | null>(
    null
);

export const useWeekPreviewContext = () => useContext(WeekPreviewContext);

// What a preview card carries in a drag.
export interface PreviewDragData {
    kind: 'preview';
    uid: string;
    title: string;
}

const HORIZON_ORDER: HorizonKey[] = [
    'week',
    'next_week',
    'this_month',
    'next_month',
    'someday',
];

// The decisions of one task, from its menu: open it, keep it, done, drop, a
// day of the period, a horizon.
function useMoveMenu(move: PreviewMove): MenuEntry[] {
    const { t } = useTranslation();
    const ctx = useWeekPreviewContext();
    if (!ctx) return [];
    const { state, placeLabel, openTask } = ctx;
    const set = (decision: Decision) => state.decide(move.uid, decision);
    const isTo = (place: PreviewPlace) => samePlace(move.to, place);
    const row = state.rows.find((r) => r.task_uid === move.uid);
    return [
        { heading: move.name },
        {
            key: 'open',
            label: t('upcoming.preview.open', 'Show the task'),
            icon: <EyeIcon className="h-4 w-4" />,
            onSelect: () => openTask(move.uid),
        },
        move.mine && row
            ? {
                  key: 'back',
                  label: t(
                      'upcoming.preview.backToAi',
                      'Back to the AI’s choice'
                  ),
                  icon: <ArrowPathIcon className="h-4 w-4" />,
                  onSelect: () =>
                      set(
                          row.op === 'plan_day' || row.op === 'due'
                              ? { op: row.op, date: row.date }
                              : { op: row.op }
                      ),
              }
            : {
                  key: 'keep',
                  label: t(
                      'upcoming.preview.keep',
                      'Refuse: keep it where it is'
                  ),
                  icon: <XMarkIcon className="h-4 w-4" />,
                  onSelect: () => set({ op: 'keep' }),
              },
        'separator',
        {
            key: 'done',
            label: t('upcoming.preview.done', 'Mark as done'),
            icon: <CheckIcon className="h-4 w-4" />,
            checked: isTo({ kind: 'done' }),
            onSelect: () => set({ op: 'done' }),
        },
        {
            key: 'drop',
            label: t('upcoming.preview.drop', 'Drop it'),
            danger: true,
            checked: isTo({ kind: 'drop' }),
            onSelect: () => set({ op: 'drop' }),
        },
        { heading: t('upcoming.preview.aDay', 'A day') },
        ...state.days.map((date): MenuEntry => ({
            key: `day-${date}`,
            label: placeLabel({ kind: 'day', date }),
            checked: isTo({ kind: 'day', date }),
            onSelect: () => set({ op: 'plan_day', date }),
        })),
        { heading: t('upcoming.preview.aHorizon', 'A horizon') },
        ...HORIZON_ORDER.map((key): MenuEntry => ({
            key: `horizon-${key}`,
            label: placeLabel({ kind: 'horizon', key }),
            checked: isTo({ kind: 'horizon', key }),
            onSelect: () =>
                set({
                    op: (
                        {
                            week: 'this_week',
                            next_week: 'next_week',
                            this_month: 'this_month',
                            next_month: 'next_month',
                            someday: 'later',
                        } as const
                    )[key],
                }),
        })),
    ];
}

// The pair under the pointer glows: a soft violet halo around both, no size
// change (the lists leave room for it).
const RING =
    'shadow-[0_0_0_1px_rgb(139_92_246/0.9),0_0_16px_3px_rgb(139_92_246/0.45)]';

// Where a decision sends a task: a violet card with its name, where it comes
// from, its time and, set apart, the AI's reason. A click opens its menu
// (« Show the task » first); it drags to a day or a horizon.
export const PreviewCard: React.FC<{ move: PreviewMove }> = ({ move }) => {
    const { t } = useTranslation();
    const ctx = useWeekPreviewContext();
    const entries = useMoveMenu(move);
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `preview:${move.uid}`,
        data: {
            kind: 'preview',
            uid: move.uid,
            title: move.name,
        } satisfies PreviewDragData,
    });
    if (!ctx) return null;
    const linked = ctx.hover === move.uid;
    return (
        <Menu
            entries={entries}
            align="start"
            testId="preview-card-menu"
            trigger={({ ref, onClick, onKeyDown, ...aria }) => (
                <button
                    type="button"
                    ref={(el) => {
                        setNodeRef(el);
                        if (typeof ref === 'function') ref(el);
                        else if (ref) {
                            (
                                ref as React.MutableRefObject<HTMLButtonElement | null>
                            ).current = el;
                        }
                    }}
                    {...attributes}
                    {...listeners}
                    {...aria}
                    onClick={onClick}
                    onKeyDown={(event) => {
                        onKeyDown(event);
                        listeners?.onKeyDown?.(event);
                    }}
                    onMouseEnter={() => ctx.setHover(move.uid)}
                    onMouseLeave={() => ctx.setHover(null)}
                    onFocus={() => ctx.setHover(move.uid)}
                    onBlur={() => ctx.setHover(null)}
                    data-testid="preview-card"
                    data-uid={move.uid}
                    data-linked={linked || undefined}
                    className={`w-full rounded-lg border-[1.5px] border-violet-500 bg-violet-50 px-2.5 py-2 text-left transition-shadow duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-violet-400 dark:bg-violet-950/50 ${
                        linked ? RING : ''
                    } ${isDragging ? 'opacity-50' : ''}`}
                >
                    <span className="flex items-start gap-1.5">
                        <SparklesIcon
                            aria-hidden="true"
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300"
                        />
                        <span className="min-w-0 break-words text-body-m font-medium leading-5 text-surface-on">
                            {move.name}
                        </span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs tabular-nums text-violet-700 dark:text-violet-300">
                        <span>← {ctx.placeLabel(move.from)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDuration(move.minutes)}</span>
                        {move.mine && (
                            <span className="rounded bg-violet-200/70 px-1 dark:bg-violet-800/60">
                                {t('upcoming.preview.mine', 'your choice')}
                            </span>
                        )}
                    </span>
                    {move.reason && (
                        <span className="mt-1.5 block border-t border-violet-200 pt-1.5 text-xs leading-snug text-surface-on-variant dark:border-violet-800">
                            {move.reason}
                        </span>
                    )}
                </button>
            )}
        />
    );
};

// Where a decided task stands now: dashed, with where it goes (or done,
// dropped). Same menu as its card.
export const PreviewTrace: React.FC<{ move: PreviewMove }> = ({ move }) => {
    const ctx = useWeekPreviewContext();
    const entries = useMoveMenu(move);
    if (!ctx) return null;
    const linked = ctx.hover === move.uid;
    const tone =
        move.to.kind === 'done'
            ? 'text-success'
            : move.to.kind === 'drop'
              ? 'text-danger'
              : 'text-violet-700 dark:text-violet-300';
    return (
        <Menu
            entries={entries}
            align="start"
            testId="preview-trace-menu"
            trigger={({ ref, ...props }) => (
                <button
                    type="button"
                    ref={ref}
                    {...props}
                    onMouseEnter={() => ctx.setHover(move.uid)}
                    onMouseLeave={() => ctx.setHover(null)}
                    onFocus={() => ctx.setHover(move.uid)}
                    onBlur={() => ctx.setHover(null)}
                    data-testid="preview-trace"
                    data-uid={move.uid}
                    data-linked={linked || undefined}
                    className={`w-full rounded-lg border border-dashed border-outline-variant px-2.5 py-1.5 text-left transition-shadow duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        linked ? RING : ''
                    }`}
                >
                    <span className="block break-words text-body-m leading-5 text-surface-on-variant">
                        {move.name}
                    </span>
                    <span className={`mt-0.5 block text-xs ${tone}`}>
                        → {ctx.placeLabel(move.to)}
                    </span>
                </button>
            )}
        />
    );
};

// The banner above the board: what the AI proposes, its questions, the
// effect, and the only buttons that write (« Appliquer », « Envoyer »).
export const PreviewBanner: React.FC<{
    onApply(): void;
    onIgnore(): void;
    onRetry(): void;
    onClose(): void;
}> = ({ onApply, onIgnore, onRetry, onClose }) => {
    const { t } = useTranslation();
    const ctx = useWeekPreviewContext();
    if (!ctx) return null;
    const { state } = ctx;
    const frame =
        'shrink-0 rounded-2xl border border-violet-300 bg-violet-50/70 px-3 py-2.5 dark:border-violet-800 dark:bg-violet-950/30';
    const badge = (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-600 px-2 py-0.5 text-xs font-semibold text-white">
            <SparklesIcon aria-hidden="true" className="h-3.5 w-3.5" />
            {t('upcoming.preview.badge', 'AI proposal')}
        </span>
    );
    if (state.pending || (!state.detail && !state.loadFailed)) {
        return (
            <section
                className={`${frame} flex items-center gap-3`}
                aria-live="polite"
                data-testid="week-preview-banner"
            >
                {badge}
                <span className="h-4 w-4 rounded-full border-2 border-violet-600 border-t-transparent motion-safe:animate-spin" />
                <span className="text-body-m text-surface-on">
                    {t(
                        'upcoming.preview.preparing',
                        'The AI is preparing your week…'
                    )}
                </span>
                <span className="flex-1" />
                <Button size="sm" variant="ghost" onClick={onClose}>
                    {t('upcoming.preview.close', 'Close')}
                </Button>
            </section>
        );
    }
    if (state.failed || state.loadFailed || !state.ready) {
        return (
            <section
                className={`${frame} flex items-center gap-3`}
                role="alert"
                data-testid="week-preview-banner"
            >
                {badge}
                <span className="text-body-m text-surface-on">
                    {t(
                        'upcoming.preview.failed',
                        'The AI could not prepare your week.'
                    )}
                </span>
                <span className="flex-1" />
                <Button size="sm" variant="secondary" onClick={onRetry}>
                    {t('proposals.retry', 'Réessayer')}
                </Button>
                <Button size="sm" variant="ghost" onClick={onClose}>
                    {t('upcoming.preview.close', 'Close')}
                </Button>
            </section>
        );
    }
    const answer = state.answer!;
    const moved = state.moves.filter(
        (move) =>
            move.to.kind !== 'done' &&
            move.to.kind !== 'drop' &&
            !samePlace(move.from, move.to)
    ).length;
    const done = state.moves.filter((m) => m.to.kind === 'done').length;
    const dropped = state.moves.filter((m) => m.to.kind === 'drop').length;
    const effect = [
        moved > 0 &&
            t('upcoming.preview.moved', 'Moved: {{count}}', { count: moved }),
        done > 0 &&
            t('upcoming.preview.doneCount', 'Done: {{count}}', { count: done }),
        dropped > 0 &&
            t('upcoming.preview.droppedCount', 'Dropped: {{count}}', {
                count: dropped,
            }),
    ].filter(Boolean);
    const sendsAnswers = state.answers.size > 0;
    return (
        <section
            className={`${frame} flex flex-col gap-2`}
            aria-label={t('upcoming.preview.label', 'Week proposed by the AI')}
            data-testid="week-preview-banner"
        >
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                {badge}
                <div className="min-w-[14rem] flex-1">
                    <p className="text-body font-semibold text-surface-on">
                        {answer.headline ||
                            t('proposals.sheet.title', 'Ta semaine')}
                    </p>
                    {(answer.subtitle || answer.summary) && (
                        <p className="text-body-m text-surface-on-variant">
                            {answer.subtitle || answer.summary}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {effect.length > 0 && (
                        <span className="mr-1 text-body-m tabular-nums text-violet-800 dark:text-violet-200">
                            {effect.join(' · ')}
                        </span>
                    )}

                    <Button size="sm" variant="ghost" onClick={onIgnore}>
                        {t('upcoming.preview.ignore', 'Ignore')}
                    </Button>
                    <Button
                        size="sm"
                        variant="primary"
                        disabled={
                            state.busy ||
                            (state.toApply.length === 0 && !sendsAnswers)
                        }
                        onClick={onApply}
                        data-testid="week-preview-apply"
                    >
                        {sendsAnswers
                            ? t('upcoming.preview.send', 'Send')
                            : t('upcoming.preview.apply', 'Apply ({{count}})', {
                                  count: state.toApply.length,
                              })}
                    </Button>
                </div>
            </div>
            {answer.questions?.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    {answer.questions.map((question) => (
                        <div
                            key={question.id}
                            className="flex flex-wrap items-center gap-1.5"
                        >
                            <span className="text-body-m text-violet-900 dark:text-violet-100">
                                {question.text}
                            </span>
                            {question.choices.map((choice) => {
                                const on =
                                    state.answers.get(question.id) === choice;
                                return (
                                    <button
                                        key={choice}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() =>
                                            state.choose(question.id, choice)
                                        }
                                        className={`rounded-full border px-2.5 py-0.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                            on
                                                ? 'border-violet-600 bg-violet-600 text-white'
                                                : 'border-violet-300 bg-surface text-violet-900 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-100 dark:hover:bg-violet-900/40'
                                        }`}
                                    >
                                        {choice}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
            <p className="text-xs text-surface-on-variant">
                {t(
                    'upcoming.preview.legend',
                    'Violet cards: where the AI sends a task. Dashed: where it is now. Click a card to choose or to see the task. Nothing is saved before « Apply ».'
                )}
            </p>
        </section>
    );
};

// One near horizon in the left column while previewing: its tasks, the
// traces of those leaving, the cards arriving; a drop target.
const PreviewHorizon: React.FC<{
    horizon: HorizonKey;
    title: string;
    tasks: Task[];
    // A far horizon lists only what the AI moves in or out.
    onlyMoved?: boolean;
}> = ({ horizon, title, tasks, onlyMoved = false }) => {
    const ctx = useWeekPreviewContext();
    const { setNodeRef, isOver } = useDroppable({
        id: `preview-horizon:${horizon}`,
        data: { kind: 'horizon', key: horizon },
    });
    // Folded per browser; a folded list still takes drops and keeps its count.
    const storeKey = `upcoming.previewCollapsed.${horizon}`;
    const [collapsed, setCollapsed] = useState(() => {
        try {
            return localStorage.getItem(storeKey) === '1';
        } catch {
            return false;
        }
    });
    const toggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        try {
            localStorage.setItem(storeKey, next ? '1' : '0');
        } catch {
            // Folding still works for this visit.
        }
    };
    if (!ctx) return null;
    const place: PreviewPlace = { kind: 'horizon', key: horizon };
    const byUid = new Map(ctx.state.moves.map((move) => [move.uid, move]));
    const here = new Set(tasks.map((task) => task.uid));
    const leaving = tasks.filter((task) => {
        const move = task.uid ? byUid.get(task.uid) : undefined;
        return move && !samePlace(move.to, place);
    }).length;
    const arriving = ctx.state.moves.filter(
        (move) => samePlace(move.to, place) && !here.has(move.uid)
    );
    const before = tasks.length;
    const after = before - leaving + arriving.length;
    return (
        <section
            ref={setNodeRef}
            data-testid="preview-horizon"
            data-horizon={horizon}
            aria-label={title}
            className={`flex flex-col gap-1.5 rounded-xl p-2 transition-colors ${
                isOver
                    ? 'bg-violet-100 dark:bg-violet-900/40'
                    : 'bg-surface-high/50'
            }`}
        >
            <h3 className="text-body-m font-semibold text-surface-on">
                <button
                    type="button"
                    aria-expanded={!collapsed}
                    onClick={toggle}
                    className="flex w-full items-center gap-1 rounded-md px-1 text-left hover:bg-surface-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    <ChevronRightIcon
                        aria-hidden="true"
                        className={`h-3.5 w-3.5 shrink-0 text-surface-on-variant transition-transform duration-150 ${
                            collapsed ? '' : 'rotate-90'
                        }`}
                    />
                    <span className="flex-1">{title}</span>
                    <span className="text-xs font-normal tabular-nums text-surface-on-variant">
                        {before === after ? (
                            after
                        ) : (
                            <>
                                {before} →{' '}
                                <b className="font-semibold text-violet-700 dark:text-violet-300">
                                    {after}
                                </b>
                            </>
                        )}
                    </span>
                </button>
            </h3>
            {!collapsed && (
                <>
                    {(onlyMoved
                        ? tasks.filter(
                              (task) => task.uid && byUid.has(task.uid)
                          )
                        : tasks
                    ).map((task) => {
                        const move = task.uid ? byUid.get(task.uid) : undefined;
                        if (move && !samePlace(move.to, place)) {
                            return <PreviewTrace key={task.uid} move={move} />;
                        }
                        return (
                            <button
                                key={task.uid}
                                type="button"
                                onClick={() =>
                                    task.uid && ctx.openTask(task.uid)
                                }
                                className="w-full rounded-lg border border-outline-variant/50 bg-surface px-2.5 py-1.5 text-left text-body-m leading-5 text-surface-on hover:border-outline-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                                {task.name}
                            </button>
                        );
                    })}
                    {arriving.map((move) => (
                        <PreviewCard key={move.uid} move={move} />
                    ))}
                    {tasks.length === 0 && arriving.length === 0 && (
                        <p className="px-1 text-xs text-surface-on-variant">
                            —
                        </p>
                    )}
                </>
            )}
        </section>
    );
};

export const PreviewHorizons: React.FC<{
    buckets: Record<HorizonKey, Task[]> | null;
    titles: Record<HorizonKey, string>;
}> = ({ buckets, titles }) => (
    <div className="flex flex-col gap-2 p-1" data-testid="preview-horizons">
        {HORIZON_ORDER.map((key) => (
            <PreviewHorizon
                key={key}
                horizon={key}
                title={titles[key]}
                tasks={buckets?.[key] ?? []}
                onlyMoved={key === 'next_month' || key === 'someday'}
            />
        ))}
    </div>
);
