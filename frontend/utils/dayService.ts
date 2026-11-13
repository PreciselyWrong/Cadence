import { Task } from '../entities/Task';
import type { FocusScopeParams } from './focus';
import {
    getDefaultHeaders,
    getPostHeadersWithCsrf,
    handleAuthResponse,
} from './authUtils';
import { getApiPath } from '../config/paths';
import type {
    DailyPlan,
    DayHours,
    FocusBlock,
    PlanItemInput,
} from './dailyPlanService';

// One day as the Today page shows it (docs/fork/TODAY-REDESIGN.md, "Modèle").
// Members of the day = the plan's items + `due` (due that day, not planned on
// any other day from today on). Nothing here ever writes a due date.
export interface DaySuggestions {
    tagged_today: Task[];
    in_progress: Task[];
    tomorrow: Task[];
    this_week: Task[];
    in_view: Task[];
    suggested: Task[];
    suggested_total: number;
    inbox_count: number;
}

export interface DayResponse {
    date: string;
    is_today: boolean;
    day_hours: DayHours;
    focus_blocks_of_day: FocusBlock[];
    plan: DailyPlan | null;
    etag: string;
    due: Task[];
    // Only filled for today: open tasks due before today, not planned on a
    // day from today on.
    overdue: Task[];
    // Only filled for today: open tasks due before today and planned on a
    // later day, with the nearest such day. The Plan board leaves them out of
    // its overdue strip; Today lists them under Overdue. Absent on older servers.
    overdue_planned?: (Task & { planned_date: string })[];
    suggestions: DaySuggestions | null;
    // Done that day and not in the plan (plan items carry their own state).
    completed: Task[];
}

export type PlanOp =
    | {
          op: 'add';
          task_uid: string;
          start_minute?: number | null;
          duration_minutes?: number;
          before_uid?: string | null;
      }
    | { op: 'remove'; task_uid: string }
    | {
          op: 'slot';
          task_uid: string;
          start_minute: number;
          duration_minutes?: number;
      }
    | { op: 'unslot'; task_uid: string }
    | { op: 'resize'; task_uid: string; duration_minutes: number }
    | { op: 'reorder'; task_uid: string; before_uid: string | null }
    | { op: 'move'; task_uid: string; to_date: string };

// The plan changed on the server since `etag` (another device or client).
export class PlanChangedError extends Error {
    constructor() {
        super('plan_changed');
        this.name = 'PlanChangedError';
    }
}

const query = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value) search.set(key, value);
    });
    const text = search.toString();
    return text ? `?${text}` : '';
};

export const fetchDay = async (
    date?: string,
    scope: FocusScopeParams = {}
): Promise<DayResponse> => {
    const response = await fetch(
        getApiPath(`daily-plan/day${query({ date, ...scope })}`),
        {
            credentials: 'include',
            headers: getDefaultHeaders(),
            cache: 'no-store',
        }
    );
    await handleAuthResponse(response, 'Failed to load the day.');
    return response.json();
};

export interface PlanWrite {
    plan: DailyPlan | null;
    etag: string;
}

const writePlan = async (
    date: string,
    method: 'PATCH' | 'PUT',
    body: unknown,
    etag?: string
): Promise<PlanWrite> => {
    const headers: Record<string, string> = await getPostHeadersWithCsrf();
    if (etag) headers['If-Match'] = etag;
    const response = await fetch(
        getApiPath(`daily-plan/${encodeURIComponent(date)}`),
        {
            method,
            credentials: 'include',
            headers,
            body: JSON.stringify(body),
        }
    );
    if (response.status === 409) throw new PlanChangedError();
    await handleAuthResponse(response, 'Failed to save the day plan.');
    const json = await response.json();
    return { plan: json.plan ?? null, etag: json.etag };
};

// Applied in one transaction; all or nothing.
export const applyPlanOps = (
    date: string,
    ops: PlanOp[],
    etag?: string
): Promise<PlanWrite> => writePlan(date, 'PATCH', { ops }, etag);

// Puts a whole earlier plan back (undo).
export const restorePlan = (
    date: string,
    items: PlanItemInput[],
    etag?: string
): Promise<PlanWrite> => writePlan(date, 'PUT', { items }, etag);
