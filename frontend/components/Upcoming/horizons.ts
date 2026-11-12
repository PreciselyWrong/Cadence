import { addDays, addMonths, format, parseISO } from 'date-fns';
import type { Task } from '../../entities/Task';
import { isTaskDone } from '../../constants/taskStatus';

// The Horizons layout of the Plan page: open tasks by the moment the user
// committed them to (week_of, month_of, #someday) or, failing that, by the
// day they are planned on or due (derived, never written back).
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

const isRecurring = (task: Task): boolean =>
    !!task.recurrence_type && task.recurrence_type !== 'none';

// The plan days the board holds, as useDays returns them.
export type PlanDays = Record<
    string,
    { plan: { items: PlannedItem[] } | null }
>;

// Each task's earliest open plan line on `from` or later.
const firstPlannedDays = (
    days: PlanDays,
    from: string
): Map<string, string> => {
    const first = new Map<string, string>();
    Object.entries(days).forEach(([date, day]) => {
        if (date < from) return;
        (day?.plan?.items ?? []).forEach((item) => {
            const uid = item.task?.uid;
            if (!uid || item.occurrence_done) return;
            const known = first.get(uid);
            if (!known || date < known) first.set(uid, date);
        });
    });
    return first;
};

/**
 * Open top-level tasks into the four horizons, first rule that applies:
 * 1. #someday (the tag parks the task whatever else it holds);
 * 2. a commitment that still holds: week_of this week, then month_of this
 *    month or next month (the narrower one is the one the user acts on);
 * 3. the task's date, derived and never written: its earliest plan line
 *    from the start of this week on, else its due day from today on
 *    (recurring tasks excepted: their due date is the next occurrence).
 *    A day of this week gives This week, a later day of this month This
 *    month, a day of next month Next month. A task planned on a day of this
 *    week is left out of the buckets: This week lists it under « Planned on
 *    a day » (plannedThisWeek).
 * A past week or month, a past due day or a plan on a past week decides
 * nothing, so such tasks appear nowhere. `days` are the plan days the board
 * has loaded; without them only due dates are derived.
 */
export const bucketHorizons = (
    tasks: Task[],
    today: string,
    firstDayOfWeek: number,
    days: PlanDays = {}
): HorizonBuckets => {
    const week = weekStartOf(today, firstDayOfWeek);
    const weekEnd = format(addDays(parseISO(week), 6), 'yyyy-MM-dd');
    const thisMonth = monthStartOf(today);
    const nextMonth = monthStartOf(today, 1);
    const planned = firstPlannedDays(days, week);
    const buckets: HorizonBuckets = {
        week: [],
        this_month: [],
        next_month: [],
        someday: [],
    };
    const byDate = (date: string): HorizonKey | null => {
        if (date <= weekEnd) return 'week';
        const month = monthStartOf(date);
        if (month === thisMonth) return 'this_month';
        if (month === nextMonth) return 'next_month';
        return null;
    };
    (tasks as HorizonTask[]).forEach((task) => {
        if (!task.uid || isTaskDone(task.status) || task.parent_task_id) {
            return;
        }
        if (isSomeday(task)) return void buckets.someday.push(task);
        if (day(task.week_of) === week) return void buckets.week.push(task);
        const month = day(task.month_of);
        if (month === thisMonth) return void buckets.this_month.push(task);
        if (month === nextMonth) return void buckets.next_month.push(task);
        const plannedOn = planned.get(task.uid);
        if (plannedOn && plannedOn <= weekEnd) return;
        const due = isRecurring(task) ? null : day(task.due_date);
        const date = plannedOn ?? (due && due >= today ? due : null);
        const key = date ? byDate(date) : null;
        if (key) buckets[key].push(task);
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
    days: PlanDays,
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
