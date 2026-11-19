import type { CalendarEvent } from '../../utils/calendarFeedsService';
import { DayLine, DayLines, lineAt } from './dayModel';

export const MIN_FREE_MINUTES = 30;
export const DEFAULT_TASK_MINUTES = 30;
const QUARTER = 15;

export interface ToPlaceItem {
    line: DayLine;
    // Scheduled/due start minute when the task's time passed without being done.
    missedAt: number | null;
}

export type TimelineItem =
    | {
          kind: 'task';
          line: DayLine;
          start: number | null;
          end: number | null;
          past: boolean;
          next: boolean;
          overlaps: boolean;
      }
    | {
          kind: 'event';
          event: CalendarEvent;
          start: number | null;
          end: number | null;
          past: boolean;
          next: boolean;
          overlaps: boolean;
      };

export interface TimelineNow {
    kind: 'now';
    minute: number;
}

export interface TimelineFree {
    kind: 'free';
    startMinute: number;
    endMinute: number;
    minutes: number;
}

export type TimelineEntry = TimelineItem | TimelineNow | TimelineFree;

export interface TodayTimeline {
    toPlace: ToPlaceItem[];
    entries: TimelineEntry[];
}

/**
 * Orders Today's list into "À caser" (missed timed tasks first, then untimed)
 * and "Ma journée" on a time axis: all-day events, items before now, the
 * "now" line, any free slot >= 30 min, and upcoming items (with next item
 * highlighted and tasks overlapping an event marked).
 */
export const buildTodayTimeline = (
    lines: DayLines,
    events: CalendarEvent[],
    now: number | null
): TodayTimeline => {
    const missed: DayLine[] = [];
    const upcoming: DayLine[] = [];
    for (const line of lines.timed) {
        const start = lineAt(line) as number;
        const end = start + (line.duration || DEFAULT_TASK_MINUTES);
        if (now !== null && end <= now) {
            missed.push(line);
        } else {
            upcoming.push(line);
        }
    }
    missed.sort((a, b) => (lineAt(a) as number) - (lineAt(b) as number));
    const toPlace: ToPlaceItem[] = [
        ...missed.map((line) => ({ line, missedAt: lineAt(line) })),
        ...lines.anytime.map((line) => ({ line, missedAt: null })),
    ];

    const allDay: TimelineItem[] = events
        .filter((event) => event.all_day)
        .map((event) => ({
            kind: 'event',
            event,
            start: null,
            end: null,
            past: false,
            next: false,
            overlaps: false,
        }));

    const dated: TimelineItem[] = [
        ...upcoming.map((line) => {
            const start = lineAt(line) as number;
            return {
                kind: 'task' as const,
                line,
                start,
                end: start + (line.duration || DEFAULT_TASK_MINUTES),
                past: line.done,
                next: false,
                overlaps: false,
            };
        }),
        ...events
            .filter(
                (event) =>
                    !event.all_day &&
                    event.start_minute !== null &&
                    event.end_minute !== null
            )
            .map((event) => {
                const start = event.start_minute as number;
                const end = event.end_minute as number;
                return {
                    kind: 'event' as const,
                    event,
                    start,
                    end,
                    past: now !== null && end <= now,
                    next: false,
                    overlaps: false,
                };
            }),
    ];

    // Events come before tasks at the same start minute; only tasks starting
    // before an earlier event ends are marked overlapping.
    let eventEnd: number | null = null;
    const sorted = dated
        .sort(
            (a, b) =>
                (a.start as number) - (b.start as number) ||
                (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1)
        )
        .map((entry) => {
            if (entry.kind === 'event') {
                if (eventEnd === null || (entry.end as number) > eventEnd) {
                    eventEnd = entry.end as number;
                }
                return entry;
            }
            return {
                ...entry,
                overlaps:
                    eventEnd !== null && (entry.start as number) < eventEnd,
            };
        });

    if (now === null) {
        const nextIdx = sorted.findIndex((entry) => !entry.past);
        const marked = sorted.map((entry, idx) =>
            idx === nextIdx ? { ...entry, next: true } : entry
        );
        return { toPlace, entries: [...allDay, ...marked] };
    }

    const before = sorted.filter((entry) => (entry.start as number) <= now);
    const afterRaw = sorted.filter((entry) => (entry.start as number) > now);
    const nextIdx = afterRaw.findIndex((entry) => !entry.past);
    const after = afterRaw.map((entry, idx) =>
        idx === nextIdx ? { ...entry, next: true } : entry
    );

    let ongoingEnd: number | null = null;
    for (const entry of before) {
        if (!entry.past && entry.end !== null) {
            ongoingEnd =
                ongoingEnd === null
                    ? entry.end
                    : Math.max(ongoingEnd, entry.end);
        }
    }
    const freeFrom = ongoingEnd !== null ? Math.max(now, ongoingEnd) : now;
    const freeTo = after[0]?.start ?? null;
    const free: TimelineFree | null =
        freeTo !== null && freeTo - freeFrom >= MIN_FREE_MINUTES
            ? {
                  kind: 'free',
                  startMinute: freeFrom,
                  endMinute: freeTo,
                  minutes: freeTo - freeFrom,
              }
            : null;

    return {
        toPlace,
        entries: [
            ...allDay,
            ...before,
            { kind: 'now', minute: now },
            ...(free ? [free] : []),
            ...after,
        ],
    };
};

/**
 * Packs `toPlace` tasks sequentially from the next quarter hour of `free`,
 * skipping any task that does not fit so a shorter later task may still fit.
 */
export const fillFreeSlot = (
    toPlace: ToPlaceItem[],
    free: TimelineFree
): Array<{ uid: string; startMinute: number; durationMinutes: number }> => {
    let cursor = Math.ceil(free.startMinute / QUARTER) * QUARTER;
    const placements: Array<{
        uid: string;
        startMinute: number;
        durationMinutes: number;
    }> = [];
    for (const item of toPlace) {
        const minutes = item.line.duration || DEFAULT_TASK_MINUTES;
        if (cursor + minutes > free.endMinute) continue;
        placements.push({
            uid: item.line.uid,
            startMinute: cursor,
            durationMinutes: minutes,
        });
        cursor += minutes;
    }
    return placements;
};
