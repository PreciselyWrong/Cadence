import { TASK_STATUS } from '../../constants/taskStatus';
import { CalendarEvent } from '../../utils/calendarFeedsService';
import { Task } from '../../entities/Task';
import {
    DailyPlanItem,
    FocusBlock,
    PlanCandidates,
} from '../../utils/dailyPlanService';
import { SLOT_MINUTES, findFreeSlot, isItemDone } from './planUtils';

export type TaskGroupKey =
    'tagged_today' | 'overdue' | 'due_today' | 'in_progress' | 'suggested';

// Order of importance when every group is shown together.
export const GROUP_ORDER: TaskGroupKey[] = [
    'tagged_today',
    'overdue',
    'due_today',
    'in_progress',
    'suggested',
];

// The candidates as one list, in the user's ranking when the server sends
// it, then the rest in group order. The candidate list and "Place all" share
// it so both follow the same priority.
export const orderedCandidates = (
    candidates: PlanCandidates
): { task: Task; group: TaskGroupKey }[] => {
    const byUid = new Map<string, { task: Task; group: TaskGroupKey }>();
    for (const group of GROUP_ORDER) {
        for (const task of candidates[group] ?? []) {
            if (task.uid && !byUid.has(task.uid)) {
                byUid.set(task.uid, { task, group });
            }
        }
    }
    const ranked = candidates.ranked ?? [];
    const order = [
        ...ranked,
        ...[...byUid.keys()].filter((uid) => !ranked.includes(uid)),
    ];
    return order
        .map((uid) => byUid.get(uid))
        .filter(
            (entry): entry is { task: Task; group: TaskGroupKey } => !!entry
        );
};

interface Range {
    start: number;
    end: number;
}

export interface PlaceCandidate {
    uid: string;
    duration: number;
}

export interface Placement {
    uid: string;
    start: number | null;
    duration: number;
}

// A focus block is reserved time: shown as a busy calendar event so the
// free-time maths and every slot search skip it, the same way meetings are.
export const focusBlockEvents = (
    blocks: FocusBlock[],
    date: string
): CalendarEvent[] => {
    const weekday = new Date(`${date}T12:00:00`).getDay();
    return blocks
        .filter((block) => block.days.includes(weekday))
        .map((block) => ({
            uid: `focus-${block.id}`,
            title: block.label || 'Focus',
            all_day: false,
            busy: true,
            start: '',
            end: '',
            start_minute: block.start,
            end_minute: block.end,
            feed_uid: 'focus',
            feed_name: 'Focus',
            color: '#8b5cf6',
        }));
};

const asItem = (uid: string, start: number, duration: number) =>
    ({
        task_uid: uid,
        start_minute: start,
        duration_minutes: duration,
    }) as DailyPlanItem;

// "Place all": each candidate, in the order given, takes the first free slot
// at or after `from` inside `range`, around the blocks already planned, the
// busy events (meetings, focus blocks) and the candidates placed before it.
// One that fits nowhere gets `start: null` and the next, smaller one may
// still use a remaining gap.
export const planAll = (
    candidates: PlaceCandidate[],
    items: DailyPlanItem[],
    events: CalendarEvent[],
    range: Range,
    from: number
): Placement[] => {
    const taken = [...items];
    return candidates.map(({ uid, duration }) => {
        const start = findFreeSlot(taken, events, duration, range, from);
        if (start !== null) taken.push(asItem(uid, start, duration));
        return { uid, start, duration };
    });
};

// "Shift the rest": the slipped block restarts at `now` and every unfinished
// timed block from it on moves later only as far as needed to stay clear of
// the one before, the meetings and the blocks that stay put. A block pushed
// past the end of the range loses its time and stays in the plan.
export const shiftFollowing = (
    items: DailyPlanItem[],
    slippedUid: string,
    events: CalendarEvent[],
    range: Range,
    now: number
): DailyPlanItem[] => {
    const slipped = items.find((item) => item.task_uid === slippedUid);
    if (!slipped || slipped.start_minute === null) return items;
    const origin = slipped.start_minute;
    const moving = items
        .filter(
            (item) =>
                item.start_minute !== null &&
                item.start_minute >= origin &&
                !isItemDone(item)
        )
        .sort(
            (a, b) => (a.start_minute as number) - (b.start_minute as number)
        );
    const movingUids = new Set(moving.map((item) => item.task_uid));
    const taken = items.filter((item) => !movingUids.has(item.task_uid));
    const starts = new Map<string, number | null>();
    let cursor = Math.ceil(now / SLOT_MINUTES) * SLOT_MINUTES;
    for (const block of moving) {
        const from =
            block.task_uid === slippedUid
                ? cursor
                : Math.max(block.start_minute as number, cursor);
        const start = findFreeSlot(
            taken,
            events,
            block.duration_minutes,
            range,
            from
        );
        starts.set(block.task_uid, start);
        if (start !== null) {
            taken.push(asItem(block.task_uid, start, block.duration_minutes));
            cursor = start + block.duration_minutes;
        }
    }
    return items.map((item) =>
        starts.has(item.task_uid)
            ? {
                  ...item,
                  start_minute: starts.get(item.task_uid) as number | null,
              }
            : item
    );
};

// "Later": one block re-placed in the next free slot after `now`, or left
// untimed when the day has no room.
export const placeLater = (
    items: DailyPlanItem[],
    uid: string,
    events: CalendarEvent[],
    range: Range,
    now: number
): DailyPlanItem[] => {
    const block = items.find((item) => item.task_uid === uid);
    if (!block) return items;
    const others = items.filter((item) => item.task_uid !== uid);
    const start = findFreeSlot(
        others,
        events,
        block.duration_minutes,
        range,
        now
    );
    return items.map((item) =>
        item.task_uid === uid ? { ...item, start_minute: start } : item
    );
};

const isDropped = (status: unknown): boolean =>
    status === TASK_STATUS.CANCELLED ||
    status === TASK_STATUS.ARCHIVED ||
    status === 'cancelled' ||
    status === 'archived';

// Yesterday's plan items still worth a decision this morning: not done, not
// dropped, and not already on today's plan.
export const leftoversOf = (
    yesterday: DailyPlanItem[],
    today: DailyPlanItem[]
): DailyPlanItem[] => {
    const planned = new Set(today.map((item) => item.task_uid));
    return yesterday.filter(
        (item) =>
            !isItemDone(item) &&
            !isDropped(item.task?.status) &&
            !planned.has(item.task_uid)
    );
};

export const capacityState = (
    planned: number,
    free: number
): { percent: number; over: boolean; overBy: number } => ({
    percent:
        free > 0 ? Math.round((planned / free) * 100) : planned > 0 ? 100 : 0,
    over: planned > free,
    overBy: Math.max(0, planned - free),
});
