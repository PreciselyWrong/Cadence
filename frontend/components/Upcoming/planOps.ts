import { addDays, format, parseISO } from 'date-fns';
import type { DailyPlanItem } from '../../utils/dailyPlanService';
import type { PlanOp } from '../../utils/dayService';
import type { CalendarEvent } from '../../utils/calendarFeedsService';
import type { Task } from '../../entities/Task';
import type { DayResponse } from '../../utils/dayService';
import { DayLines, applyOpsLocally, tasksOf } from '../Today/dayModel';

// Writes to one day's plan, sent in order. Due dates are never written here:
// moving a card changes the plan day only (docs/fork/TODAY-REDESIGN.md, rule 1).
export interface PlanWrite {
    date: string;
    ops: PlanOp[];
}

// A card as the board sees it: the task, the day its card sits on, and
// whether that day's plan holds it (false: due-only).
export interface CardRef {
    uid: string;
    date: string;
    planned: boolean;
}

export const dayString = (date: Date, timezone: string): string =>
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);

export const shiftDay = (date: string, days: number): string =>
    format(addDays(parseISO(date), days), 'yyyy-MM-dd');

export const columnDates = (anchor: string, count: number): string[] =>
    Array.from({ length: count }, (_, i) => shiftDay(anchor, i));

// A card dropped on another day's column. A planned card moves its plan line;
// a slotted one is slotted on the target day at the same time and removed
// from its old day instead (a `move` drops the slot; the slot comes first so
// a failed removal leaves it planned twice, never nowhere). A due-only card
// is planned on the target day (its due date stays).
export const columnDropWrites = (
    from: CardRef & { slot?: { start: number; duration: number } | null },
    to: string
): PlanWrite[] => {
    if (from.date === to) return [];
    if (from.planned && from.slot) {
        return [
            {
                date: to,
                ops: [
                    {
                        op: 'slot',
                        task_uid: from.uid,
                        start_minute: from.slot.start,
                        duration_minutes: from.slot.duration,
                    },
                ],
            },
            { date: from.date, ops: [{ op: 'remove', task_uid: from.uid }] },
        ];
    }
    if (from.planned) {
        return [
            {
                date: from.date,
                ops: [{ op: 'move', task_uid: from.uid, to_date: to }],
            },
        ];
    }
    return [{ date: to, ops: [{ op: 'add', task_uid: from.uid }] }];
};

// A card (or calendar block) dropped on the calendar: it gets a slot on the
// calendar's day. From another day's plan it is slotted on the new day, then
// removed from the old one: each write touches its own day only, so neither
// is sent with an etag the other has changed (a `move` rewrites both days),
// and a failed removal leaves the task planned twice rather than nowhere.
export const calendarDropWrites = (
    from: CardRef & { duration: number },
    to: { date: string; start: number }
): PlanWrite[] => {
    const slot: PlanOp = {
        op: 'slot',
        task_uid: from.uid,
        start_minute: to.start,
        duration_minutes: from.duration,
    };
    const writes: PlanWrite[] = [{ date: to.date, ops: [slot] }];
    if (from.planned && from.date !== to.date) {
        writes.push({
            date: from.date,
            ops: [{ op: 'remove', task_uid: from.uid }],
        });
    }
    return writes;
};

// Reorders a card among the open cards without a time of its column. The
// plan keeps the order; the card lands right after `overUid` when it was
// above it, right before when it was below (the usual sortable rule).
// `anytimeUids` is the column's untimed open cards, in display order;
// `plannedUids` the day's plan, in plan order.
export const reorderWrites = (
    card: CardRef,
    overUid: string,
    anytimeUids: string[],
    plannedUids: string[]
): PlanWrite[] => {
    if (card.uid === overUid) return [];
    const order = [...anytimeUids];
    const to = order.indexOf(overUid);
    if (to === -1) return [];
    const from = order.indexOf(card.uid);
    if (from !== -1) order.splice(from, 1);
    order.splice(to, 0, card.uid);
    const planned = new Set(plannedUids);
    const after = order.slice(order.indexOf(card.uid) + 1);
    const before = after.find((uid) => planned.has(uid)) ?? null;
    const op: PlanOp = card.planned
        ? { op: 'reorder', task_uid: card.uid, before_uid: before }
        : { op: 'add', task_uid: card.uid, before_uid: before };
    return [{ date: card.date, ops: [op] }];
};

// Done and open counts of a day, for the column's progress bar.
export const progressOf = (lines: DayLines) => {
    const done = lines.done.length;
    return {
        done,
        total: done + lines.timed.length + lines.anytime.length,
    };
};

const MINUTES_PER_DAY = 1440;

// The calendar's visible hours: the day's hours widened to hold every timed
// card, timed event and the current time, on whole hours.
export const calendarRange = (
    hours: { start: number; end: number },
    spans: { start: number; end: number }[],
    now: number | null
): { start: number; end: number } => {
    let start = hours.start;
    let end = hours.end;
    const widen = (s: number, e: number) => {
        start = Math.min(start, s);
        end = Math.max(end, e);
    };
    spans.forEach((span) => widen(span.start, span.end));
    if (now !== null) widen(now, now);
    return {
        start: Math.max(0, Math.floor(start / 60) * 60),
        end: Math.min(MINUTES_PER_DAY, Math.ceil(end / 60) * 60),
    };
};

export const timedSpans = (
    events: CalendarEvent[]
): { start: number; end: number }[] =>
    events
        .filter((e) => !e.all_day && e.start_minute !== null && e.end_minute)
        .map((e) => ({
            start: e.start_minute as number,
            end: e.end_minute as number,
        }));

export const planItemUids = (items: DailyPlanItem[]): string[] =>
    [...items]
        .sort((a, b) => a.position - b.position)
        .map((item) => item.task_uid);

// Every day a set of writes changes: the days written, and the day a `move`
// sends its task to (the server writes that one too).
export const touchedDates = (writes: PlanWrite[]): string[] => [
    ...new Set(
        writes.flatMap((write) => [
            write.date,
            ...write.ops.flatMap((op) =>
                op.op === 'move' ? [op.to_date] : []
            ),
        ])
    ),
];

const withoutTask = (tasks: Task[], uid: string): Task[] =>
    tasks.some((task) => task.uid === uid)
        ? tasks.filter((task) => task.uid !== uid)
        : tasks;

/**
 * The loaded days after `writes`, computed locally so a moved card shows on
 * its new day at once; the server's answer replaces this. Mirrors the server:
 * a `move` takes the line to the other day without its slot; a task planned
 * on a day from today on is no longer a due-only member of another day, nor
 * overdue. A day that is not loaded is left alone (it loads fresh).
 */
export const applyWritesLocally = (
    days: Record<string, DayResponse>,
    writes: PlanWrite[],
    today: string,
    // Tasks the writes add that no loaded day shows yet (just created).
    newTasks: Task[] = []
): Record<string, DayResponse> => {
    const tasks = new Map<string, Task>();
    Object.values(days).forEach((day) =>
        tasksOf(day).forEach((task, uid) => tasks.set(uid, task))
    );
    newTasks.forEach((task) => task.uid && tasks.set(task.uid, task));
    const next = { ...days };
    const setItems = (date: string, items: DailyPlanItem[]) => {
        const day = next[date];
        next[date] = {
            ...day,
            plan: day.plan
                ? { ...day.plan, items }
                : { uid: '', date, started_at: null, items },
        };
    };
    const plannedOn = (uid: string, date: string) => {
        if (date < today) return;
        Object.keys(next).forEach((other) => {
            const day = next[other];
            const due = other === date ? day.due : withoutTask(day.due, uid);
            const overdue = withoutTask(day.overdue ?? [], uid);
            if (due !== day.due || overdue !== (day.overdue ?? [])) {
                next[other] = { ...day, due, overdue };
            }
        });
    };
    for (const write of writes) {
        const day = next[write.date];
        if (!day) continue;
        const before = day.plan?.items ?? [];
        setItems(write.date, applyOpsLocally(before, write.ops, tasks));
        for (const op of write.ops) {
            if (op.op === 'move') {
                const target = next[op.to_date];
                const line = before.find(
                    (item) => item.task_uid === op.task_uid
                );
                const task = line?.task ?? tasks.get(op.task_uid);
                if (target && task) {
                    const items = target.plan?.items ?? [];
                    if (!items.some((item) => item.task_uid === op.task_uid)) {
                        setItems(op.to_date, [
                            ...items,
                            {
                                task_uid: op.task_uid,
                                task,
                                position: items.length,
                                start_minute: null,
                                duration_minutes:
                                    line?.duration_minutes ??
                                    (task.estimated_minutes || 30),
                            },
                        ]);
                    }
                }
                plannedOn(op.task_uid, op.to_date);
            } else if (op.op === 'add' || op.op === 'slot') {
                plannedOn(op.task_uid, write.date);
            }
        }
    }
    return next;
};

const holds = (tasks: Task[], uid: string): boolean =>
    tasks.some(
        (task) =>
            task.uid === uid ||
            (task.subtasks ?? []).some((sub) => sub.uid === uid)
    );

// The loaded days that show the task (or a subtask of it): the ones to
// refresh after it was saved elsewhere.
export const datesHolding = (
    days: Record<string, DayResponse>,
    uid: string
): string[] =>
    Object.entries(days)
        .filter(([, day]) =>
            holds(
                [
                    ...(day.plan?.items ?? []).map((item) => item.task),
                    ...day.due,
                    ...(day.overdue ?? []),
                    ...(day.completed ?? []),
                ],
                uid
            )
        )
        .map(([date]) => date);

const sortedItems = (day: DayResponse | undefined): DailyPlanItem[] =>
    [...(day?.plan?.items ?? [])].sort((a, b) => a.position - b.position);

// The plan line of a task on the first day of `order` that plans it.
export const plannedLine = (
    days: Record<string, DayResponse>,
    uid: string,
    order: string[]
): { date: string; start: number | null; duration: number } | null => {
    for (const date of order) {
        const item = days[date]?.plan?.items.find(
            (line) => line.task_uid === uid
        );
        if (item) {
            return {
                date,
                start: item.start_minute,
                duration: item.duration_minutes,
            };
        }
    }
    return null;
};

/**
 * The writes that take back `writes`, from the days as they were before
 * them: for each task they named on each day, its line is put back as it
 * was (removed, added back at its place, its slot, length or order). Only
 * those lines are written, so a later change to the same days stays. Adds
 * come before removals: a failed undo leaves a task planned twice, never
 * nowhere. On a day that was not loaded, an add or a slot (or a move to it)
 * created the line; anything else there cannot be undone: null.
 */
export const inverseWrites = (
    days: Record<string, DayResponse>,
    writes: PlanWrite[],
    today: string
): PlanWrite[] | null => {
    const named = new Map<string, string[]>();
    const name = (date: string, uid: string) => {
        const uids = named.get(date) ?? [];
        if (!uids.includes(uid)) named.set(date, [...uids, uid]);
    };
    writes.forEach((write) =>
        write.ops.forEach((op) => {
            name(write.date, op.task_uid);
            if (op.op === 'move') name(op.to_date, op.task_uid);
        })
    );
    const after = applyWritesLocally(days, writes, today);
    const restores: PlanWrite[] = [];
    const removals: PlanWrite[] = [];
    for (const [date, uids] of named) {
        if (!days[date]) {
            const created = writes.every(
                (write) =>
                    write.date !== date ||
                    write.ops.every((op) => op.op === 'add' || op.op === 'slot')
            );
            if (!created) return null;
            removals.push({
                date,
                ops: uids.map((uid) => ({ op: 'remove', task_uid: uid })),
            });
            continue;
        }
        const pre = sortedItems(days[date]);
        const post = sortedItems(after[date]);
        // Lines the writes created (the local copy may lack the task).
        const removed = uids.filter(
            (uid) =>
                !pre.some((line) => line.task_uid === uid) &&
                writes.some((write) =>
                    write.ops.some(
                        (op) =>
                            op.task_uid === uid &&
                            (op.op === 'move'
                                ? op.to_date === date
                                : write.date === date &&
                                  (op.op === 'add' || op.op === 'slot'))
                    )
                )
        );
        // The lines on the day once the undo has run, for before_uid.
        const present = new Set(
            post
                .map((line) => line.task_uid)
                .filter((uid) => !removed.includes(uid))
        );
        const nextPresent = (uid: string): string | null => {
            const at = pre.findIndex((line) => line.task_uid === uid);
            return (
                pre.slice(at + 1).find((line) => present.has(line.task_uid))
                    ?.task_uid ?? null
            );
        };
        const adds: PlanOp[] = [];
        const updates: PlanOp[] = [];
        // Last first, so a line added back finds the next one already there.
        [...pre].reverse().forEach((was) => {
            const uid = was.task_uid;
            if (!uids.includes(uid)) return;
            const now = post.find((line) => line.task_uid === uid);
            if (!now) {
                adds.unshift({
                    op: 'add',
                    task_uid: uid,
                    start_minute: was.start_minute,
                    duration_minutes: was.duration_minutes,
                    before_uid: nextPresent(uid),
                });
                present.add(uid);
                return;
            }
            if (was.start_minute !== now.start_minute) {
                updates.unshift(
                    was.start_minute === null
                        ? { op: 'unslot', task_uid: uid }
                        : {
                              op: 'slot',
                              task_uid: uid,
                              start_minute: was.start_minute,
                              duration_minutes: was.duration_minutes,
                          }
                );
            }
            if (
                was.duration_minutes !== now.duration_minutes &&
                (was.start_minute === null ||
                    was.start_minute === now.start_minute)
            ) {
                updates.unshift({
                    op: 'resize',
                    task_uid: uid,
                    duration_minutes: was.duration_minutes,
                });
            }
            const at = post.findIndex((line) => line.task_uid === uid);
            const nextNow =
                post.slice(at + 1).find((line) => present.has(line.task_uid))
                    ?.task_uid ?? null;
            const nextWas = nextPresent(uid);
            if (nextNow !== nextWas) {
                updates.unshift({
                    op: 'reorder',
                    task_uid: uid,
                    before_uid: nextWas,
                });
            }
        });
        const ops: PlanOp[] = [
            ...removed.map((uid) => ({ op: 'remove' as const, task_uid: uid })),
            ...adds,
            ...updates,
        ];
        if (ops.length === 0) continue;
        (adds.length > 0 || updates.length > 0 ? restores : removals).push({
            date,
            ops,
        });
    }
    return [...restores, ...removals];
};

// An undo sent after other changes: a before_uid that left a loaded day
// would make the server refuse the write; the line goes last instead.
export const withoutMissingAnchors = (
    days: Record<string, DayResponse>,
    writes: PlanWrite[]
): PlanWrite[] =>
    writes.map((write) => {
        const day = days[write.date];
        if (!day) return write;
        const uids = new Set(
            (day.plan?.items ?? []).map((item) => item.task_uid)
        );
        return {
            ...write,
            ops: write.ops.map((op) =>
                (op.op === 'add' || op.op === 'reorder') &&
                op.before_uid &&
                !uids.has(op.before_uid)
                    ? { ...op, before_uid: null }
                    : op
            ),
        };
    });
