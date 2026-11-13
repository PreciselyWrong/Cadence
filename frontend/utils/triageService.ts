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
    action: TriageAction | 'question' | 'classify' | 'decide_mail';
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
    // The Gmail gateway is set: a mail card may archive its thread.
    mail_archive?: boolean;
}

const newKey = () =>
    `triage:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

async function request(
    path: string,
    method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE',
    body: unknown,
    errorMessage: string
): Promise<Response> {
    const response = await fetch(getApiPath(path), {
        method,
        credentials: 'include',
        headers:
            method === 'GET'
                ? getDefaultHeaders()
                : await getPostHeadersWithCsrf(),
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    await handleAuthResponse(response, errorMessage);
    return response;
}

const send = (path: string, body: unknown): Promise<Response> =>
    request(path, 'POST', body, 'Failed to update the triage queue.');

async function post(path: string, body: unknown): Promise<void> {
    await send(path, body);
}

export const fetchTriageQueue = async (): Promise<TriageQueue> =>
    (
        await request(
            'triage',
            'GET',
            undefined,
            'Failed to load the triage queue.'
        )
    ).json();

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

// A mail thread an agent proposed (docs/43-mail-triage.md). Every text field
// comes from a mail: shown as plain text only.
export interface MailPayload {
    mail_uid: string;
    account: string;
    from_name: string | null;
    from_address: string | null;
    subject: string | null;
    received_at: string;
    summary: string;
    suggestion: {
        kind: 'task' | 'reply' | 'read';
        task_name?: string;
        due_date?: string;
        project_uid?: string;
    } | null;
    draft_excerpt: string | null;
    gmail_url: string;
}

export type MailDecision = 'task' | 'reply' | 'later' | 'dismiss';

export interface MailOutcome {
    archived?: boolean;
}

export const decideMail = async (
    mailUid: string,
    decision: MailDecision,
    payload: Record<string, unknown>,
    archive: boolean
): Promise<MailOutcome> => {
    const response = await send(
        `triage/mail/${encodeURIComponent(mailUid)}/decide`,
        { decision, payload, archive, idempotency_key: newKey() }
    );
    return response.json();
};

// The answer to a question of the queue becomes the linked context of its
// target, so the question is not asked again.
export type ContextScope = 'task' | 'event' | 'series';

export interface LinkedContext {
    uid: string;
    scope: ContextScope;
    target_ref: string;
    text: string;
}

export const answerQuestion = async (
    target: { scope: string; ref: string },
    answer: 'yes' | 'no' | string
): Promise<LinkedContext> => {
    const response = await request(
        'triage/answers',
        'POST',
        { target, answer },
        'Failed to save the answer.'
    );
    return (await response.json()).context;
};

export const fetchContexts = async (query: {
    scope?: ContextScope;
    target_ref?: string;
}): Promise<LinkedContext[]> => {
    const search = new URLSearchParams();
    if (query.scope) search.set('scope', query.scope);
    if (query.target_ref) search.set('target_ref', query.target_ref);
    const qs = search.toString();
    const response = await request(
        `triage/contexts${qs ? `?${qs}` : ''}`,
        'GET',
        undefined,
        'Failed to load the contexts.'
    );
    return (await response.json()).contexts;
};

export const updateContext = async (
    uid: string,
    text: string
): Promise<LinkedContext> =>
    (
        await request(
            `triage/contexts/${encodeURIComponent(uid)}`,
            'PATCH',
            { text },
            'Failed to update the context.'
        )
    ).json();

export const deleteContext = async (uid: string): Promise<void> => {
    await request(
        `triage/contexts/${encodeURIComponent(uid)}`,
        'DELETE',
        undefined,
        'Failed to delete the context.'
    );
};

// The card types of the rules; each one can be turned off.
export const TRIAGE_ALERT_TYPES = [
    'conflict',
    'event_in_work_hours',
    'duplicate',
    'deadline_in_note',
    'postponed',
] as const;

export interface TriageSettings {
    calendarFeedUids: string[];
    calendarLookaheadDays: number;
    thresholds: {
        postponements: number;
        duplicateSimilarity: number;
        closedLookbackDays: number;
    };
    alerts: { disabled: string[] };
    triage: { enabled: boolean; dailyLimit: number };
}

export const fetchTriageSettings = async (): Promise<TriageSettings> =>
    (
        await request(
            'triage/settings',
            'GET',
            undefined,
            'Failed to load the triage settings.'
        )
    ).json();

export const saveTriageSettings = async (
    patch: Partial<TriageSettings>
): Promise<TriageSettings> =>
    (
        await request(
            'triage/settings',
            'PUT',
            patch,
            'Failed to save the triage settings.'
        )
    ).json();
