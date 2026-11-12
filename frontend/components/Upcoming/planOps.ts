import { addDays, format, parseISO } from 'date-fns';
import type { DailyPlanItem } from '../../utils/dailyPlanService';
import type { PlanOp } from '../../utils/dayService';
import type { CalendarEvent } from '../../utils/calendarFeedsService';
import { DayLines } from '../Today/dayModel';

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
// a due-only card is planned on the target day (its due date stays).
export const columnDropWrites = (from: CardRef, to: string): PlanWrite[] => {
    if (from.date === to) return [];
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
