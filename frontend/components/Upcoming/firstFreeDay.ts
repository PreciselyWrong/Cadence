// The first day of the board with room for a task (docs/03-upcoming-view.md
// › Quick place): its free time, the day's hours minus its open plan lines,
// holds the task's estimate (30 min without one). Today counts only what is
// left of it. Pure: the caller gives the days, the time and the day's end.

import { createContext } from 'react';
import type { CardData } from './TaskCard';

const DEFAULT_MINUTES = 30;

// The board's quick place for a card of the inbox or of « This week »: the
// day it would go to (null: no day has room), its short label, and the move.
export interface QuickPlace {
    suggest(minutes: number | null | undefined): string | null;
    label(date: string): string;
    place(card: CardData, date: string): void;
}

export const QuickPlaceContext = createContext<QuickPlace | null>(null);

export interface DayRoom {
    date: string;
    // Minutes of open plan lines on the day.
    load: number;
    // Minutes of the day's working hours (0: a day off).
    capacity: number;
}

export function firstFreeDay(
    minutes: number | null | undefined,
    days: readonly DayRoom[],
    now: { today: string; nowMinute: number; dayEnd: number }
): string | null {
    const need = minutes && minutes > 0 ? minutes : DEFAULT_MINUTES;
    for (const day of days) {
        if (day.date < now.today || day.capacity <= 0) continue;
        const hours =
            day.date === now.today
                ? Math.min(
                      day.capacity,
                      Math.max(0, now.dayEnd - now.nowMinute)
                  )
                : day.capacity;
        if (hours - day.load >= need) return day.date;
    }
    return null;
}
