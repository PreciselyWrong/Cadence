import { toPriorityLevel } from '../Shared/PriorityBadge';
import { shiftDay } from './planOps';

// « Replanifier » of the overdue band (docs/03-upcoming-view.md).
// Android replays the same cases: fixtures/plan/spread-overdue.json.

export interface SpreadTask {
    uid: string;
    priority?: 'low' | 'medium' | 'high' | number | null;
    due_date?: string | null;
    estimated_minutes?: number | null;
    start_date?: string | null;
    defer_until?: string | null;
}

export const SPREAD_DAYS = 7;
const DEFAULT_MINUTES = 30;
const RANK = { high: 0, medium: 1, low: 2 } as const;
// Days from today a task may go to, by rank: urgent work stays close.
const WINDOW = [2, 4, SPREAD_DAYS, SPREAD_DAYS];

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

// The local day of a date or a timestamp (start and defer dates are
// timestamps on the wire, plain days in the shared cases).
const dayOf = (value: string): string => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.slice(0, 10);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// The first day the task may be done: its start or defer day, whichever
// is later ('' when it has neither).
const earliestOf = (task: SpreadTask): string =>
    [task.start_date, task.defer_until]
        .filter((value): value is string => !!value)
        .map(dayOf)
        .reduce((latest, day) => (day > latest ? day : latest), '');

/**
 * Where each overdue task goes: by priority (high first), then oldest due
 * date, then uid. A task may go to a day of its window from `today` (two
 * days for a high priority, four for a medium one, seven otherwise), never
 * before its start or defer day; with no such day in its window, the first
 * allowed day of the seven, and none at all leaves it overdue. It goes to
 * its lightest allowed day (estimated minutes of the planned tasks, 30
 * without an estimate), the earliest on a tie; that day's load then grows
 * by the task.
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
    const placed: Array<{ uid: string; date: string }> = [];
    [...overdue].sort(compare).forEach((task) => {
        const earliest = earliestOf(task);
        const allowed = days
            .map((date, i) => i)
            .filter((i) => days[i] >= earliest);
        if (allowed.length === 0) return;
        const inWindow = allowed.filter((i) => i < WINDOW[rankOf(task)]);
        const choices = inWindow.length > 0 ? inWindow : [allowed[0]];
        const best = choices.reduce((a, b) => (load[b] < load[a] ? b : a));
        load[best] += minutesOf(task);
        placed.push({ uid: task.uid, date: days[best] });
    });
    return placed;
};
