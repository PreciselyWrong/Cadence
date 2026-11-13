import {
    WeekChange,
    WeekDay,
    WeekDecision,
    WeekOp,
    WeekTaskFact,
} from '../../utils/proposalsService';

// The user's decision on one task of the week: the agent's op by default,
// any other op once changed. `date` only for `plan_day` and `due`.
export interface Decision {
    op: WeekOp;
    date?: string;
}

export const DATED_OPS: WeekOp[] = ['plan_day', 'due'];

export const suggestionOf = (change: WeekChange): Decision =>
    DATED_OPS.includes(change.op)
        ? { op: change.op, date: change.date }
        : { op: change.op };

export const sameDecision = (a: Decision, b: Decision): boolean =>
    a.op === b.op && (a.date ?? '') === (b.date ?? '');

export const addDays = (date: string, days: number): string => {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
};

// Whole days from `from` to `to` (both YYYY-MM-DD).
export const dayDiff = (from: string, to: string): number =>
    Math.round(
        (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
            86_400_000
    );

// The days a task can be planned on: the period, from today on (the past
// cannot be planned), at most 14.
export function plannableDays(
    period: { start: string; end: string } | undefined,
    today: string | undefined
): string[] {
    if (!period?.start || !period.end) return [];
    const days: string[] = [];
    for (
        let date = period.start;
        date <= period.end && days.length < 14;
        date = addDays(date, 1)
    ) {
        if (!today || date >= today) days.push(date);
    }
    return days;
}

// Every task of the facts has a row: the agent's change, or « keep » when it
// gave none. A change for a task the facts do not name is kept too.
export function rowsOf(
    tasks: readonly WeekTaskFact[],
    changes: readonly WeekChange[]
): WeekChange[] {
    const byTask = new Map(changes.map((change) => [change.task_uid, change]));
    const named = new Set(tasks.map((task) => task.uid));
    return [
        ...tasks.map(
            (task): WeekChange =>
                byTask.get(task.uid) ?? {
                    task_uid: task.uid,
                    op: 'keep',
                    reason: '',
                }
        ),
        ...changes.filter((change) => !named.has(change.task_uid)),
    ];
}

export type SectionId = 'overdue' | 'days' | 'later';

export interface WeekSection {
    id: SectionId;
    rows: WeekChange[];
}

// Three sections, in this order: the overdue tasks whatever their decision,
// the rows planned on a day (by day), then the rest (horizons, later,
// dropped, kept). An empty section is left out; the agent's order holds
// inside a section.
export function weekSections(
    rows: readonly WeekChange[],
    tasks: ReadonlyMap<string, WeekTaskFact>,
    decisions: ReadonlyMap<string, Decision>
): WeekSection[] {
    const overdue: WeekChange[] = [];
    const dated: { row: WeekChange; date: string }[] = [];
    const later: WeekChange[] = [];
    for (const row of rows) {
        if (tasks.get(row.task_uid)?.overdue) {
            overdue.push(row);
            continue;
        }
        const decision = decisions.get(row.task_uid) ?? suggestionOf(row);
        if (DATED_OPS.includes(decision.op)) {
            dated.push({ row, date: decision.date ?? '' });
        } else {
            later.push(row);
        }
    }
    dated.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const sections: WeekSection[] = [
        { id: 'overdue', rows: overdue },
        { id: 'days', rows: dated.map(({ row }) => row) },
        { id: 'later', rows: later },
    ];
    return sections.filter((section) => section.rows.length > 0);
}

// Days late for an overdue task with a due date before today; null otherwise.
export function daysLate(
    task: WeekTaskFact | undefined,
    today: string | undefined
): number | null {
    if (!task?.overdue || !task.due || !today) return null;
    const late = dayDiff(task.due.slice(0, 10), today);
    return late > 0 ? late : null;
}

// Rows left as they are: kept and not noted (a noted row waits for the agent).
export function restingCount(
    rows: readonly WeekChange[],
    decisions: ReadonlyMap<string, Decision>,
    noted: ReadonlySet<string>
): number {
    return rows.filter(
        (row) =>
            !noted.has(row.task_uid) &&
            (decisions.get(row.task_uid) ?? suggestionOf(row)).op === 'keep'
    ).length;
}

export interface DayLoad {
    minutes: number;
    // Share of the work time taken, 0 to 1; null without the day's detail.
    share: number | null;
    full: boolean;
    // An all-day event, or events filling the whole work time.
    busy: boolean;
}

export function dayLoad(minutes: number, day?: WeekDay): DayLoad {
    if (!day) return { minutes, share: null, full: false, busy: false };
    const capacity = day.capacity_minutes;
    const busy =
        day.events.some((event) => event.all_day) ||
        (!!day.work && capacity === 0);
    const full = busy || (capacity > 0 && minutes >= capacity);
    const share = busy
        ? 1
        : capacity > 0
          ? Math.min(minutes / capacity, 1)
          : 0;
    return { minutes, share, full, busy };
}

// What « Appliquer » sends: every decision that writes something (`keep`
// writes nothing), in the agent's order.
export function decisionsToApply(
    changes: WeekChange[],
    decisions: Map<string, Decision>
): WeekDecision[] {
    return changes.flatMap((change) => {
        const decision = decisions.get(change.task_uid) ?? suggestionOf(change);
        if (decision.op === 'keep') return [];
        return [
            DATED_OPS.includes(decision.op)
                ? {
                      task_uid: change.task_uid,
                      op: decision.op,
                      date: decision.date,
                  }
                : { task_uid: change.task_uid, op: decision.op },
        ];
    });
}

// A remark the user wrote on a row: the agent asks again for that task. Only
// the non-blank text counts; rows keep their decision out of the apply.
export interface NoteToSend {
    task_uid: string;
    text: string;
}

export function notesToSend(
    changes: WeekChange[],
    notes: ReadonlyMap<string, string>
): NoteToSend[] {
    return changes.flatMap((change) => {
        const text = notes.get(change.task_uid)?.trim() ?? '';
        return text ? [{ task_uid: change.task_uid, text }] : [];
    });
}
