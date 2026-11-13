import { addDays, addMonths, format, parseISO } from 'date-fns';
import type { Task } from '../../entities/Task';
import { isTaskDone } from '../../constants/taskStatus';
import type { PlanWrite } from './planOps';

// The Horizons layout of the Plan page: open tasks by the moment the user
// committed them to (week_of, month_of, #someday) or, failing that, by the
// day they are planned on or due (derived, never written back).
export type HorizonKey =
    'week' | 'next_week' | 'this_month' | 'next_month' | 'someday';

export const HORIZON_KEYS: HorizonKey[] = [
    'week',
    'next_week',
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
 * 2. a commitment that still holds: week_of this week or next week (only
 *    ever set by hand, never derived), then month_of this
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
    const nextWeek = format(addDays(parseISO(week), 7), 'yyyy-MM-dd');
    const weekEnd = format(addDays(parseISO(week), 6), 'yyyy-MM-dd');
    const thisMonth = monthStartOf(today);
    const nextMonth = monthStartOf(today, 1);
    const planned = firstPlannedDays(days, week);
    const buckets: HorizonBuckets = {
        week: [],
        next_week: [],
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
        if (day(task.week_of) === nextWeek) {
            return void buckets.next_week.push(task);
        }
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
    week_of?: 'this_week' | 'next_week' | null;
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
            : to === 'next_week'
              ? { week_of: 'next_week', month_of: null }
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

// Horizons side by side when they get 200 px each, else on two rows (three
// then two), two by two, one under the other on a phone.
const fitsColumns = (width: number, columns: number): boolean =>
    width >= columns * 200 + (columns - 1) * 12;

export const horizonColumns = (width: number): number => {
    if (width === 0 || fitsColumns(width, HORIZON_KEYS.length)) {
        return HORIZON_KEYS.length;
    }
    if (fitsColumns(width, 3)) return 3;
    return fitsColumns(width, 2) ? 2 : 1;
};

// Side by side, each horizon fills the page height and scrolls its own
// cards. Once they wrap, a fixed share of the height cut "This week" to one
// card while room was left below: each row then takes its cards' height and
// the page scrolls instead.
export const horizonRowsFill = (columns: number): boolean =>
    columns >= HORIZON_KEYS.length;

// The drop strip of the Days layout: the horizons past this week (this
// week is the days on screen).
export const STRIP_KEYS: HorizonKey[] = [
    'next_week',
    'this_month',
    'next_month',
    'someday',
];

/**
 * The plan writes that take a day card off its day when it is sent to a
 * horizon: a line of that day's plan is removed; a due-only, overdue,
 * inbox or horizon card has no line to remove (its due date stays).
 */
export const leaveDayWrites = (card: {
    uid: string;
    date: string;
    planned: boolean;
}): PlanWrite[] =>
    card.planned && /^\d{4}-\d{2}-\d{2}$/.test(card.date)
        ? [{ date: card.date, ops: [{ op: 'remove', task_uid: card.uid }] }]
        : [];

// What a task is committed to, read from its fields only (never its date or
// its plan): #someday, then a week or month that still holds; `replan` when
// its only commitment is a week or month that has passed. The task sheet's
// date chip shows it when the task has no date.
export type Commitment = HorizonKey | 'replan';

const passedCommitment = (
    task: HorizonTask,
    week: string,
    thisMonth: string
): boolean => {
    const weekOf = day(task.week_of);
    const monthOf = day(task.month_of);
    return (!!weekOf && weekOf < week) || (!!monthOf && monthOf < thisMonth);
};

export const commitmentOf = (
    task: Task,
    today: string,
    firstDayOfWeek: number
): Commitment | null => {
    const held = task as HorizonTask;
    if (isSomeday(held)) return 'someday';
    const week = weekStartOf(today, firstDayOfWeek);
    const nextWeek = format(addDays(parseISO(week), 7), 'yyyy-MM-dd');
    const thisMonth = monthStartOf(today);
    const weekOf = day(held.week_of);
    const monthOf = day(held.month_of);
    if (weekOf === week) return 'week';
    if (weekOf === nextWeek) return 'next_week';
    if (monthOf === thisMonth) return 'this_month';
    if (monthOf === monthStartOf(today, 1)) return 'next_month';
    return passedCommitment(held, week, thisMonth) ? 'replan' : null;
};

// A horizon picked from the date chip: the commitment of horizonPatch, the
// due date and time cleared, and the task taken off its plans from today on
// (`unplan`, PATCH /task). Picking the current horizon still clears the date.
export type HorizonDuePatch = HorizonPatch & {
    due_date: null;
    due_time: null;
    due_has_time: false;
    unplan: true;
};

export const horizonDuePatch = (
    from: Commitment | null,
    to: HorizonKey
): HorizonDuePatch => ({
    ...(horizonPatch(from === 'replan' ? null : from, to) ?? {}),
    due_date: null,
    due_time: null,
    due_has_time: false,
    unplan: true,
});

// A precise day picked for a committed task: the week, the month and the
// #someday tag go; null when the task holds none of them.
export const commitmentClearPatch = (task: Task): HorizonPatch | null => {
    const held = task as HorizonTask;
    const someday = isSomeday(held);
    if (!held.week_of && !held.month_of && !someday) return null;
    return {
        week_of: null,
        month_of: null,
        ...(someday ? { later: false } : {}),
    };
};

export interface ToPlanBox {
    replan: Task[];
    week: Task[];
    month: Task[];
}

/**
 * True when `GET /tasks?type=unsorted` (« Tâches à classer », backend
 * modules/tasks/queries/query-builders.js) lists the task, for the fields a
 * task of the list carries: no due date, not in view, not deferred past
 * `now`, and filed nowhere (no project nor area) or still waiting for
 * « Quand ? » (needs_when). The rest of that query is already a condition
 * of « À replanifier » (open, top level, not recurring, not #someday, no
 * plan line from today on, week before this one). Differences left: the
 * plan lines are only those of the loaded days, and the deferral is read
 * with the browser's clock.
 */
const isUnsorted = (task: HorizonTask, now: Date): boolean =>
    !task.due_date &&
    !task.in_view_at &&
    (!task.defer_until || new Date(task.defer_until) <= now) &&
    ((!task.project_id && !task.area_id) || !!task.needs_when);

// Each task's open plan days among the loaded ones.
const planDaysByTask = (days: PlanDays): Map<string, string[]> => {
    const byTask = new Map<string, string[]>();
    Object.entries(days).forEach(([date, planDay]) => {
        (planDay?.plan?.items ?? []).forEach((item) => {
            const uid = item.task?.uid;
            if (!uid || item.occurrence_done) return;
            byTask.set(uid, [...(byTask.get(uid) ?? []), date]);
        });
    });
    return byTask;
};

/**
 * The « À planifier » box of the Days layout, open top-level tasks without
 * #someday:
 * - replan: not recurring, with a week or month that has passed, placed in
 *   no horizon by bucketHorizons and planned on no day from today on, and
 *   not already shown elsewhere: not overdue (« En retard ») nor listed in
 *   « Tâches à classer » (isUnsorted);
 * - week: committed to this week, planned on no day of this week;
 * - month: committed to this month (and not to this or next week), planned
 *   on no day of this week.
 * Plan lines count for the days the board has loaded.
 */
export const toPlan = (
    tasks: Task[],
    today: string,
    firstDayOfWeek: number,
    days: PlanDays = {},
    now: Date = new Date()
): ToPlanBox => {
    const week = weekStartOf(today, firstDayOfWeek);
    const weekEnd = format(addDays(parseISO(week), 6), 'yyyy-MM-dd');
    const nextWeek = format(addDays(parseISO(week), 7), 'yyyy-MM-dd');
    const thisMonth = monthStartOf(today);
    const buckets = bucketHorizons(tasks, today, firstDayOfWeek, days);
    const placed = new Set(
        HORIZON_KEYS.flatMap((key) => buckets[key].map((task) => task.uid))
    );
    const plans = planDaysByTask(days);
    const plannedWhere = (uid: string, test: (date: string) => boolean) =>
        (plans.get(uid) ?? []).some(test);
    const box: ToPlanBox = { replan: [], week: [], month: [] };
    (tasks as HorizonTask[]).forEach((task) => {
        const uid = task.uid;
        if (!uid || isTaskDone(task.status) || task.parent_task_id) return;
        if (isSomeday(task)) return;
        const thisWeek = (date: string) => date >= week && date <= weekEnd;
        if (day(task.week_of) === week) {
            if (!plannedWhere(uid, thisWeek)) box.week.push(task);
            return;
        }
        // Next week ranks before this month, as in bucketHorizons.
        if (day(task.week_of) === nextWeek) return;
        if (day(task.month_of) === thisMonth) {
            if (!plannedWhere(uid, thisWeek)) box.month.push(task);
            return;
        }
        if (
            !isRecurring(task) &&
            passedCommitment(task, week, thisMonth) &&
            !placed.has(uid) &&
            !plannedWhere(uid, (date) => date >= today) &&
            !(day(task.due_date) && (day(task.due_date) as string) < today) &&
            !isUnsorted(task, now)
        ) {
            box.replan.push(task);
        }
    });
    return box;
};
