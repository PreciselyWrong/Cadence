import { toPriorityLevel } from '../Shared/PriorityBadge';
import { shiftDay } from './planOps';

// « Étaler sur 7 jours » of the overdue band (docs/03-upcoming-view.md).
// Android replays the same cases: fixtures/plan/spread-overdue.json.

export interface SpreadTask {
    uid: string;
    priority?: 'low' | 'medium' | 'high' | number | null;
    due_date?: string | null;
    estimated_minutes?: number | null;
}

export const SPREAD_DAYS = 7;
const DEFAULT_MINUTES = 30;
const RANK = { high: 0, medium: 1, low: 2 } as const;

const minutesOf = (task: Pick<SpreadTask, 'estimated_minutes'>): number =>
    task.estimated_minutes && task.estimated_minutes > 0
        ? task.estimated_minutes
        : DEFAULT_MINUTES;

const rankOf = (task: SpreadTask): number => {
    const level = toPriorityLevel(task.priority);
    return level ? RANK[level] : 3;
};

// No due date sorts last (an overdue task always has one).
const dueOf = (task: SpreadTask): string =>
    task.due_date ? task.due_date.slice(0, 10) : '9999-12-31';

const compare = (a: SpreadTask, b: SpreadTask): number =>
    rankOf(a) - rankOf(b) ||
    dueOf(a).localeCompare(dueOf(b)) ||
    (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);

/**
 * Where each overdue task goes: by priority (high first), then oldest due
 * date, then uid, each to the day from `today` to `today` + 6 with the
 * smallest load (estimated minutes of its planned tasks, 30 without an
 * estimate), the earliest on a tie; the day's load then grows by the task.
 */
export const spreadOverdue = (
    overdue: SpreadTask[],
    today: string,
    planned: Record<string, Array<Pick<SpreadTask, 'estimated_minutes'>>>
): Array<{ uid: string; date: string }> => {
    const days = Array.from({ length: SPREAD_DAYS }, (_, i) =>
        shiftDay(today, i)
    );
    const load = days.map((date) =>
        (planned[date] ?? []).reduce((sum, task) => sum + minutesOf(task), 0)
    );
    return [...overdue].sort(compare).map((task) => {
        let best = 0;
        for (let i = 1; i < days.length; i++) {
            if (load[i] < load[best]) best = i;
        }
        load[best] += minutesOf(task);
        return { uid: task.uid, date: days[best] };
    });
};
