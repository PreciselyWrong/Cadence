import {
    getDefaultHeaders,
    getPostHeadersWithCsrf,
    handleAuthResponse,
} from './authUtils';
import { getApiPath } from '../config/paths';

// Client of the triage queue (docs/40-triage.md).

export type TriageAction =
    | 'rename'
    | 'split'
    | 'set_due'
    | 'done'
    | 'cancel'
    | 'delete'
    | 'reclass'
    | 'to_note'
    | 'to_project'
    | 'to_habit';

export interface TriageQuestion {
    key: string;
    text: string;
    target: { scope: string; ref: string };
}

export interface TriageItem {
    key: string;
    type: string;
    source: string;
    task_uid: string | null;
    action: TriageAction | 'question' | 'classify';
    payload: Record<string, unknown> | null;
    reason: string;
    details: string[];
    question: TriageQuestion | null;
}

export interface TriageTask {
    uid: string;
    name: string;
    note: string | null;
    due_date: string | null;
    project_name: string | null;
    tags: string[];
    recurring: boolean;
}

export interface TriageQueue {
    items: TriageItem[];
    tasks: Record<string, TriageTask>;
    count: number;
}

const newKey = () =>
    `triage:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

async function post(path: string, body: unknown): Promise<void> {
    const response = await fetch(getApiPath(path), {
        method: 'POST',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
        body: JSON.stringify(body),
    });
    await handleAuthResponse(response, 'Failed to update the triage queue.');
}

export const fetchTriageQueue = async (): Promise<TriageQueue> => {
    const response = await fetch(getApiPath('triage'), {
        credentials: 'include',
        headers: getDefaultHeaders(),
    });
    await handleAuthResponse(response, 'Failed to load the triage queue.');
    return response.json();
};

export const keepTask = (taskUid: string): Promise<void> =>
    post('triage/keep', { task_uid: taskUid });

export const applyTriage = (
    taskUid: string,
    action: TriageAction,
    payload: Record<string, unknown> | null
): Promise<void> =>
    post('triage/apply', {
        task_uid: taskUid,
        action,
        payload,
        idempotency_key: newKey(),
    });
