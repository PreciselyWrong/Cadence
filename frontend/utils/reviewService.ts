import {
    handleAuthResponse,
    getDefaultHeaders,
    getPostHeadersWithCsrf,
} from './authUtils';
import { getApiPath } from '../config/paths';
import { Task } from '../entities/Task';

export type ReviewCategory =
    'pushed' | 'undecided' | 'later' | 'projects' | 'stale';

export interface ReviewSummary {
    counts: Record<ReviewCategory | 'review_due', number>;
    attention_total: number;
    decided_this_week: number;
    week_start: string;
}

export interface PushSummary {
    recent_count: number;
    total_count: number;
    last_postponed_on: string | null;
    last_planned_for: string | null;
    frequent: boolean;
}

export interface PushedItem {
    task: Task;
    push: PushSummary;
}

export interface TaskReviewItem {
    task: Task;
    review_due: boolean;
    last_activity_at: string;
}

export interface InboxReviewItem {
    uid: string;
    title: string | null;
    content: string;
    created_at: string;
}

export type ProjectReason = 'no_next_action' | 'quiet' | 'pushed_tasks';

export interface ProjectReviewItem {
    project: {
        id: number;
        uid: string;
        name: string;
        status: string;
        due_date_at: string | null;
    };
    reasons: ProjectReason[];
    open_tasks: number;
    last_activity_at: string | null;
}

export interface ReviewPage<T> {
    total: number;
    items: T[];
}

export type ScheduleChangeKind =
    | 'postponed'
    | 'rescheduled'
    | 'time_shift'
    | 'advanced'
    | 'scheduled'
    | 'unscheduled'
    | 'automatic';

export interface ScheduleChange {
    kind: ScheduleChangeKind;
    from: string | null;
    to: string | null;
    at: string;
    source: string;
    created_at: string;
}

export interface TaskPostponements extends PushSummary {
    missed_plan_days: number;
    created_at: string;
    last_activity_at: string;
    reviewed_at: string | null;
    history_complete: boolean;
    changes: ScheduleChange[];
    missed_days: string[];
}

export interface ReviewWeek {
    week_start: string;
    week_end: string;
    committed: Task[];
    in_view: Task[];
    planned_minutes: number;
    unestimated: number;
    capacity_minutes: number | null;
}

// What a review decision may change on a task. Sent as a normal task PATCH.
export interface TaskDecision {
    in_view?: boolean;
    week_of?: string | null;
    review_on?: string | null;
    later?: boolean;
    reviewed?: boolean;
    status?: string;
    today?: boolean;
}

const get = async <T>(path: string, error: string): Promise<T> => {
    const response = await fetch(getApiPath(path), {
        credentials: 'include',
        headers: getDefaultHeaders(),
    });
    await handleAuthResponse(response, error);
    return response.json();
};

export const fetchReviewSummary = (): Promise<ReviewSummary> =>
    get('review', 'Could not load the review.');

export const fetchReviewCategory = <T>(
    category: ReviewCategory,
    offset = 0,
    limit = 50
): Promise<ReviewPage<T>> =>
    get(
        `review/${category}?offset=${offset}&limit=${limit}`,
        'Could not load the review.'
    );

export const fetchReviewWeek = (): Promise<ReviewWeek> =>
    get('review/week', 'Could not load the week.');

export const fetchTaskPostponements = (
    taskUid: string
): Promise<TaskPostponements> =>
    get(
        `task/${encodeURIComponent(taskUid)}/postponements`,
        'Could not load the history.'
    );

export const decideTask = async (
    taskUid: string,
    decision: TaskDecision
): Promise<Task> => {
    const response = await fetch(
        getApiPath(`task/${encodeURIComponent(taskUid)}`),
        {
            method: 'PATCH',
            credentials: 'include',
            headers: await getPostHeadersWithCsrf(),
            body: JSON.stringify(decision),
        }
    );
    await handleAuthResponse(response, 'Could not save the decision.');
    return response.json();
};

export const keepProject = async (projectUid: string): Promise<void> => {
    const response = await fetch(
        getApiPath(`project/${encodeURIComponent(projectUid)}/reviewed`),
        {
            method: 'POST',
            credentials: 'include',
            headers: await getPostHeadersWithCsrf(),
        }
    );
    await handleAuthResponse(response, 'Could not save the decision.');
};

export const saveWeekCapacity = async (
    minutes: number | null
): Promise<number | null> => {
    const response = await fetch(getApiPath('review/week/capacity'), {
        method: 'PUT',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
        body: JSON.stringify({ capacity_minutes: minutes }),
    });
    await handleAuthResponse(response, 'Could not save the capacity.');
    return (await response.json()).capacity_minutes;
};

export const isParked = (task: Task): boolean =>
    (task.tags || []).some((tag) => tag.name === 'someday');
