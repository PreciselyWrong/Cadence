import type {
    WeekChange,
    WeekFacts,
    WeekTaskFact,
} from '../../utils/proposalsService';
import { addDays, Decision, suggestionOf } from '../Proposals/weekDecisions';
import type { HorizonKey } from './horizons';

// The week proposed by the AI, shown over the Plan board before anything is
// written (docs/03-upcoming-view.md › Week preview). Pure: no React, no clock.

export type PreviewPlace =
    | { kind: 'day'; date: string }
    | { kind: 'horizon'; key: HorizonKey }
    | { kind: 'inbox' }
    | { kind: 'overdue' }
    | { kind: 'done' }
    | { kind: 'drop' }
    | { kind: 'none' };

// One decided task: where it is now and where the decision sends it.
export interface PreviewMove {
    uid: string;
    name: string;
    minutes: number;
    from: PreviewPlace;
    to: PreviewPlace;
    decision: Decision;
    // The agent's reason; empty for a decision of the user's own.
    reason: string;
    // The user changed the agent's decision.
    mine: boolean;
}

// A task without an estimate counts as on the board.
const DEFAULT_MINUTES = 30;

const OP_HORIZON: Partial<Record<Decision['op'], HorizonKey>> = {
    this_week: 'week',
    next_week: 'next_week',
    this_month: 'this_month',
    next_month: 'next_month',
    later: 'someday',
};

const HORIZON_OP: Record<HorizonKey, Decision['op']> = {
    week: 'this_week',
    next_week: 'next_week',
    this_month: 'this_month',
    next_month: 'next_month',
    someday: 'later',
};

const dayOf = (value: string) => value.slice(0, 10);

// Where a task of the facts stands today, as the board shows it.
export function placeOfTask(
    task: WeekTaskFact,
    facts: Pick<WeekFacts, 'today' | 'period' | 'days'>
): PreviewPlace {
    const planned = (facts.days ?? [])
        .filter((day) => day.date >= facts.today)
        .find((day) => (day.planned ?? []).includes(task.uid));
    if (planned) return { kind: 'day', date: planned.date };
    if (task.overdue) return { kind: 'overdue' };
    const due = task.due ? dayOf(task.due) : null;
    if (due && due >= facts.period.start && due <= facts.period.end) {
        return { kind: 'day', date: due };
    }
    if (task.week_of) {
        const week = dayOf(task.week_of);
        if (week <= facts.today && facts.today < addDays(week, 7)) {
            return { kind: 'horizon', key: 'week' };
        }
        if (week > facts.today && week <= addDays(facts.today, 7)) {
            return { kind: 'horizon', key: 'next_week' };
        }
    }
    if (task.month_of) {
        const month = dayOf(task.month_of).slice(0, 7);
        return {
            kind: 'horizon',
            key:
                month === facts.today.slice(0, 7) ? 'this_month' : 'next_month',
        };
    }
    if (task.someday) return { kind: 'horizon', key: 'someday' };
    if (task.inbox) return { kind: 'inbox' };
    return { kind: 'none' };
}

// Where a decision sends a task; null for keep (it stays).
export function placeOfDecision(decision: Decision): PreviewPlace | null {
    switch (decision.op) {
        case 'plan_day':
        case 'due':
            return decision.date
                ? { kind: 'day', date: dayOf(decision.date) }
                : null;
        case 'done':
            return { kind: 'done' };
        case 'drop':
            return { kind: 'drop' };
        case 'keep':
            return null;
        default: {
            const key = OP_HORIZON[decision.op];
            return key ? { kind: 'horizon', key } : null;
        }
    }
}

// The decision a drop or a menu choice on a place makes; null where nothing
// can be decided (the inbox, the overdue band).
export function decisionOfPlace(place: PreviewPlace): Decision | null {
    switch (place.kind) {
        case 'day':
            return { op: 'plan_day', date: place.date };
        case 'horizon':
            return { op: HORIZON_OP[place.key] };
        case 'done':
            return { op: 'done' };
        case 'drop':
            return { op: 'drop' };
        default:
            return null;
    }
}

export const samePlace = (a: PreviewPlace, b: PreviewPlace): boolean =>
    a.kind === b.kind &&
    (a.kind !== 'day' || a.date === (b as { date: string }).date) &&
    (a.kind !== 'horizon' || a.key === (b as { key: HorizonKey }).key);

// Every decided task (not kept), in the agent's order, the user's decisions
// first where they differ.
export function previewMoves(
    facts: WeekFacts,
    rows: readonly WeekChange[],
    decisions: ReadonlyMap<string, Decision>
): PreviewMove[] {
    const tasks = new Map(facts.tasks.map((task) => [task.uid, task]));
    const moves: PreviewMove[] = [];
    for (const row of rows) {
        const task = tasks.get(row.task_uid);
        if (!task) continue;
        const suggestion = suggestionOf(row);
        const decision = decisions.get(row.task_uid) ?? suggestion;
        const to = placeOfDecision(decision);
        if (!to) continue;
        const mine =
            decision.op !== suggestion.op ||
            (decision.date ?? '') !== (suggestion.date ?? '');
        moves.push({
            uid: task.uid,
            name: task.name,
            minutes:
                task.estimate_min && task.estimate_min > 0
                    ? task.estimate_min
                    : DEFAULT_MINUTES,
            from: placeOfTask(task, facts),
            to,
            decision,
            reason: mine ? '' : row.reason,
            mine,
        });
    }
    return moves;
}
