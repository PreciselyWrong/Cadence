import { WeekChange, WeekDecision, WeekOp } from '../../utils/proposalsService';

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

export type GroupKey =
    | { id: string; kind: 'day'; date: string }
    | { id: string; kind: 'this_week' | 'later' | 'keep' | 'drop' };

export interface DecisionGroup {
    key: GroupKey;
    rows: WeekChange[];
}

const TAIL = ['this_week', 'later', 'drop', 'keep'] as const;

// Rows grouped by their CURRENT decision: days first (planned or due that
// day), then the week's, the parked, the dropped and the kept ones. Inside a
// group, rows keep the agent's order. Pure.
export function groupByDecision(
    changes: WeekChange[],
    decisions: Map<string, Decision>
): DecisionGroup[] {
    const days = new Map<string, WeekChange[]>();
    const tail: Record<(typeof TAIL)[number], WeekChange[]> = {
        this_week: [],
        later: [],
        drop: [],
        keep: [],
    };
    for (const change of changes) {
        const decision = decisions.get(change.task_uid) ?? suggestionOf(change);
        if (DATED_OPS.includes(decision.op)) {
            const date = decision.date ?? '';
            days.set(date, [...(days.get(date) ?? []), change]);
        } else {
            tail[decision.op as (typeof TAIL)[number]].push(change);
        }
    }
    const groups: DecisionGroup[] = [...days.keys()].sort().map((date) => ({
        key: { id: `day:${date}`, kind: 'day', date },
        rows: days.get(date) ?? [],
    }));
    for (const kind of TAIL) {
        if (tail[kind].length > 0) {
            groups.push({ key: { id: kind, kind }, rows: tail[kind] });
        }
    }
    return groups;
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

export const addDays = (date: string, days: number): string => {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
};

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
