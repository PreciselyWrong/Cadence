import { Task } from '../../entities/Task';
import { isTaskDone } from '../../constants/taskStatus';
import type {
    DailyPlanItem,
    PlanItemInput,
} from '../../utils/dailyPlanService';
import type { DayResponse, PlanOp } from '../../utils/dayService';

export const DEFAULT_MINUTES = 30;

// One row of the day: a plan item, or a task that belongs to the day only
// through its due date (docs/fork/TODAY-REDESIGN.md, rule 2).
export interface DayLine {
    uid: string;
    task: Task;
    planned: boolean;
    // Reserved slot (plan item), minutes after local midnight.
    start: number | null;
    // A due time on this day: a deadline, drawn as busy when there is no slot.
    dueMinute: number | null;
    duration: number;
    // False when the duration is only the default guess.
    durationKnown: boolean;
    done: boolean;
}

const toMinute = (time: string | null | undefined): number | null => {
    if (!time) return null;
    const [h, m] = time.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

export const dueMinuteOn = (task: Task, date: string): number | null =>
    task.due_date?.slice(0, 10) === date ? toMinute(task.due_time) : null;

export const lineFromItem = (item: DailyPlanItem, date: string): DayLine => ({
    uid: item.task_uid,
    task: item.task,
    planned: true,
    start: item.start_minute,
    dueMinute: dueMinuteOn(item.task, date),
    duration: item.duration_minutes,
    durationKnown: true,
    done: !!item.occurrence_done || isTaskDone(item.task?.status),
});

export const lineFromDue = (task: Task, date: string): DayLine => ({
    uid: task.uid as string,
    task,
    planned: false,
    start: null,
    dueMinute: dueMinuteOn(task, date),
    duration: task.estimated_minutes || DEFAULT_MINUTES,
    durationKnown: !!task.estimated_minutes,
    done: isTaskDone(task.status),
});

// The time a line sits at in the list and on the calendar: its slot, else
// its due time.
export const lineAt = (line: DayLine): number | null =>
    line.start ?? line.dueMinute;

export interface DayLines {
    // Open lines with a slot or a due time, by time.
    timed: DayLine[];
    // Open lines without either: plan order, then due-only tasks.
    anytime: DayLine[];
    done: DayLine[];
}

export const dayLines = (
    items: DailyPlanItem[],
    due: Task[],
    date: string
): DayLines => {
    const planned = new Set(items.map((item) => item.task_uid));
    const lines = [
        ...[...items]
            .sort((a, b) => a.position - b.position)
            .map((item) => lineFromItem(item, date)),
        ...due
            .filter((task) => !planned.has(task.uid as string))
            .map((task) => lineFromDue(task, date)),
    ];
    const open = lines.filter((line) => !line.done);
    return {
        timed: open
            .filter((line) => lineAt(line) !== null)
            .sort((a, b) => (lineAt(a) as number) - (lineAt(b) as number)),
        anytime: open.filter((line) => lineAt(line) === null),
        done: lines.filter((line) => line.done),
    };
};

// The lines the page shows: completed ones are dropped when the viewer hides
// them (the list and the calendar both use this).
export const visibleLines = (
    lines: DayLines,
    hideCompleted: boolean
): DayLines => (hideCompleted ? { ...lines, done: [] } : lines);

export const toPlanInput = (items: DailyPlanItem[]): PlanItemInput[] =>
    [...items]
        .sort((a, b) => a.position - b.position)
        .map((item) => ({
            task_uid: item.task_uid,
            start_minute: item.start_minute,
            duration_minutes: item.duration_minutes,
        }));

const renumber = (items: DailyPlanItem[]): DailyPlanItem[] =>
    items.map((item, position) => ({ ...item, position }));

/**
 * The plan after `ops`, computed locally so the page answers at once; the
 * server applies the same ops in one transaction and its answer replaces this
 * one. Validation (overlaps, ranges) stays on the server. `tasks` resolves the
 * task of an op that adds a line.
 */
export const applyOpsLocally = (
    items: DailyPlanItem[],
    ops: PlanOp[],
    tasks: Map<string, Task>
): DailyPlanItem[] => {
    let next = [...items].sort((a, b) => a.position - b.position);
    const find = (uid: string) => next.findIndex((i) => i.task_uid === uid);
    const update = (uid: string, patch: Partial<DailyPlanItem>) => {
        next = next.map((item) =>
            item.task_uid === uid ? { ...item, ...patch } : item
        );
    };
    const insert = (item: DailyPlanItem, beforeUid?: string | null) => {
        const at = beforeUid ? find(beforeUid) : -1;
        next =
            at === -1
                ? [...next, item]
                : [...next.slice(0, at), item, ...next.slice(at)];
    };
    const ensure = (uid: string): boolean => {
        if (find(uid) !== -1) return true;
        const task = tasks.get(uid);
        if (!task) return false;
        insert({
            task_uid: uid,
            task,
            position: next.length,
            start_minute: null,
            duration_minutes: task.estimated_minutes || DEFAULT_MINUTES,
        });
        return true;
    };
    for (const op of ops) {
        switch (op.op) {
            case 'add': {
                if (find(op.task_uid) === -1) {
                    const task = tasks.get(op.task_uid);
                    if (!task) break;
                    insert(
                        {
                            task_uid: op.task_uid,
                            task,
                            position: 0,
                            start_minute: op.start_minute ?? null,
                            duration_minutes:
                                op.duration_minutes ??
                                (task.estimated_minutes || DEFAULT_MINUTES),
                        },
                        op.before_uid
                    );
                } else {
                    const patch: Partial<DailyPlanItem> = {};
                    if (op.start_minute !== undefined)
                        patch.start_minute = op.start_minute;
                    if (op.duration_minutes !== undefined)
                        patch.duration_minutes = op.duration_minutes;
                    update(op.task_uid, patch);
                }
                break;
            }
            case 'remove':
            case 'move':
                next = next.filter((item) => item.task_uid !== op.task_uid);
                break;
            case 'slot':
                if (!ensure(op.task_uid)) break;
                update(op.task_uid, {
                    start_minute: op.start_minute,
                    ...(op.duration_minutes !== undefined
                        ? { duration_minutes: op.duration_minutes }
                        : {}),
                });
                break;
            case 'unslot':
                update(op.task_uid, { start_minute: null });
                break;
            case 'resize':
                update(op.task_uid, { duration_minutes: op.duration_minutes });
                break;
            case 'reorder': {
                const at = find(op.task_uid);
                if (at === -1) break;
                const [item] = next.splice(at, 1);
                insert(item, op.before_uid);
                break;
            }
        }
    }
    return renumber(next);
};

// Minutes of `spans` inside [from, to), overlaps merged.
export const coveredMinutes = (
    spans: { start: number; end: number }[],
    from: number,
    to: number
): number => {
    const clipped = spans
        .map((s) => ({
            start: Math.max(from, s.start),
            end: Math.min(to, s.end),
        }))
        .filter((s) => s.end > s.start)
        .sort((a, b) => a.start - b.start);
    let total = 0;
    let end = -Infinity;
    for (const span of clipped) {
        if (span.start >= end) {
            total += span.end - span.start;
            end = span.end;
        } else if (span.end > end) {
            total += span.end - end;
            end = span.end;
        }
    }
    return total;
};

export interface DaySummary {
    open: number;
    // Time the open tasks still need (slots and estimates).
    needed: number;
    // Working time left: day hours (from now, today) minus busy events.
    free: number;
    over: boolean;
}

/**
 * The one line summary of the day. `busy` holds meetings, focus blocks and
 * unslotted due-time tasks (appointments); slotted tasks are not busy time,
 * they are what the time is for. `now` is null on any day but today.
 */
export const daySummary = (
    lines: DayLines,
    busy: { start: number; end: number }[],
    hours: { start: number; end: number },
    now: number | null
): DaySummary => {
    const from = now === null ? hours.start : Math.max(hours.start, now);
    const to = hours.end;
    const open = [...lines.timed, ...lines.anytime];
    const needed = open
        .filter((line) => !(line.start === null && line.dueMinute !== null))
        .reduce((sum, line) => {
            const end = (line.start ?? 0) + line.duration;
            // A running slot counts for what is left of it; a slot already
            // over and not done still needs its whole length later.
            if (line.start === null || end <= from) return sum + line.duration;
            return sum + (end - Math.max(line.start, from));
        }, 0);
    const free = Math.max(0, to - from - coveredMinutes(busy, from, to));
    return { open: open.length, needed, free, over: needed > free };
};

// Members of the day that are tasks: used to resolve ops locally.
export const tasksOf = (day: DayResponse): Map<string, Task> => {
    const map = new Map<string, Task>();
    const add = (task: Task) => task.uid && map.set(task.uid, task);
    day.plan?.items.forEach((item) => add(item.task));
    day.due.forEach(add);
    day.overdue.forEach(add);
    if (day.suggestions) {
        Object.values(day.suggestions).forEach((value) => {
            if (Array.isArray(value)) value.forEach(add);
        });
    }
    return map;
};

const SLOT = 15;

/**
 * The new slots after `moving` is dropped where `overUid` sits in the timed
 * list (Sunsama's Today: the list order is the day's order). The tasks take
 * the day's slot times in their new order, each after the one before and
 * clear of `busy` time; only the tasks whose start changes are returned. A
 * task without a slot dropped there gets one.
 */
export const reflowSlots = (
    slotted: DayLine[],
    moving: DayLine,
    overUid: string,
    busy: { start: number; end: number }[]
): { uid: string; start: number; duration: number }[] => {
    const fromIdx = slotted.findIndex((l) => l.uid === moving.uid);
    const overIdx = slotted.findIndex((l) => l.uid === overUid);
    if (overIdx === -1) return [];
    const without = slotted.filter((l) => l.uid !== moving.uid);
    let insertAt = without.findIndex((l) => l.uid === overUid);
    if (fromIdx !== -1 && fromIdx < overIdx) insertAt += 1;
    const order = [
        ...without.slice(0, insertAt),
        moving,
        ...without.slice(insertAt),
    ];
    const starts = slotted.map((l) => l.start as number);
    if (fromIdx === -1) starts.push(slotted[overIdx].start as number);
    starts.sort((a, b) => a - b);

    const changes: { uid: string; start: number; duration: number }[] = [];
    let previousEnd = -Infinity;
    order.forEach((line, index) => {
        let start = Math.max(starts[index], previousEnd);
        for (;;) {
            const clash = busy.find(
                (b) => start < b.end && b.start < start + line.duration
            );
            if (!clash) break;
            start = Math.ceil(clash.end / SLOT) * SLOT;
        }
        start = Math.min(start, 24 * 60 - line.duration);
        if (start !== line.start) {
            changes.push({ uid: line.uid, start, duration: line.duration });
        }
        previousEnd = start + line.duration;
    });
    return changes;
};
