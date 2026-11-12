import { addDays, addMonths, format, parseISO } from 'date-fns';
import type { Task } from '../../entities/Task';
import { isTaskDone } from '../../constants/taskStatus';

// The Horizons layout of the Plan page: open tasks by the moment the user
// committed them to (week_of, month_of, #someday), never by due date.
export type HorizonKey = 'week' | 'this_month' | 'next_month' | 'someday';

export const HORIZON_KEYS: HorizonKey[] = [
    'week',
    'this_month',
    'next_month',
    'someday',
];

export type HorizonBuckets = Record<HorizonKey, Task[]>;

// A task as the list endpoint returns it; month_of is newer than the entity.
type HorizonTask = Task & { month_of?: string | null };

const SOMEDAY = 'someday';

// First day of the week holding `date`; `firstDay` is 0 (Sunday) to 6.
export const weekStartOf = (date: string, firstDay: number): string => {
    const at = parseISO(date);
    const back = (at.getDay() - firstDay + 7) % 7;
    return format(addDays(at, -back), 'yyyy-MM-dd');
};

// First day of the month holding `date`, `offset` months later.
export const monthStartOf = (date: string, offset = 0): string =>
    format(addMonths(parseISO(`${date.slice(0, 7)}-01`), offset), 'yyyy-MM-dd');

const day = (value: string | null | undefined): string | null =>
    value ? value.slice(0, 10) : null;

const isSomeday = (task: Task): boolean =>
    (task.tags ?? []).some((tag) => tag.name?.toLowerCase() === SOMEDAY);

/**
 * Open top-level tasks into the four horizons. #someday wins (the tag parks
 * the task whatever else it holds), then the week, then the month: the
 * narrower commitment is the one the user acts on. A week or month that has
 * passed decides nothing, so those tasks appear nowhere.
 */
export const bucketHorizons = (
    tasks: Task[],
    today: string,
    firstDayOfWeek: number
): HorizonBuckets => {
    const week = weekStartOf(today, firstDayOfWeek);
    const thisMonth = monthStartOf(today);
    const nextMonth = monthStartOf(today, 1);
    const buckets: HorizonBuckets = {
        week: [],
        this_month: [],
        next_month: [],
        someday: [],
    };
    (tasks as HorizonTask[]).forEach((task) => {
        if (!task.uid || isTaskDone(task.status) || task.parent_task_id) {
            return;
        }
        if (isSomeday(task)) buckets.someday.push(task);
        else if (day(task.week_of) === week) buckets.week.push(task);
        else if (day(task.month_of) === thisMonth)
            buckets.this_month.push(task);
        else if (day(task.month_of) === nextMonth)
            buckets.next_month.push(task);
    });
    return buckets;
};

export const horizonOf = (
    buckets: HorizonBuckets,
    uid: string
): HorizonKey | null =>
    HORIZON_KEYS.find((key) => buckets[key].some((task) => task.uid === uid)) ??
    null;

// The PATCH /task body that moves a task to a horizon (backend
// modules/review/fields.js). The other commitment is cleared so the task
// lands where it was dropped; leaving Someday removes the tag.
export interface HorizonPatch {
    week_of?: 'this_week' | null;
    month_of?: 'this_month' | 'next_month' | null;
    later?: boolean;
}

export const horizonPatch = (
    from: HorizonKey | null,
    to: HorizonKey
): HorizonPatch | null => {
    if (from === to) return null;
    if (to === 'someday') return { later: true };
    const patch: HorizonPatch =
        to === 'week'
            ? { week_of: 'this_week', month_of: null }
            : { month_of: to, week_of: null };
    if (from === 'someday') patch.later = false;
    return patch;
};

// The days of the week holding `today`, first day first.
export const weekDates = (today: string, firstDayOfWeek: number): string[] => {
    const start = parseISO(weekStartOf(today, firstDayOfWeek));
    return Array.from({ length: 7 }, (_, i) =>
        format(addDays(start, i), 'yyyy-MM-dd')
    );
};

/**
 * Open tasks planned on a day of this week, for the collapsed "Planned on a
 * day" list of This week: each task once, by day then plan order, without
 * the ones already in the week bucket.
 */
export const plannedThisWeek = (
    days: Record<string, { plan: { items: PlannedItem[] } | null }>,
    today: string,
    firstDayOfWeek: number,
    exclude: Task[] = []
): { task: Task; date: string }[] => {
    const seen = new Set(exclude.map((task) => task.uid));
    const result: { task: Task; date: string }[] = [];
    weekDates(today, firstDayOfWeek).forEach((date) => {
        [...(days[date]?.plan?.items ?? [])]
            .sort((a, b) => a.position - b.position)
            .forEach((item) => {
                const task = item.task;
                if (!task?.uid || seen.has(task.uid)) return;
                if (item.occurrence_done || isTaskDone(task.status)) return;
                seen.add(task.uid);
                result.push({ task, date });
            });
    });
    return result;
};

interface PlannedItem {
    task: Task;
    position: number;
    occurrence_done?: boolean;
}
