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
    action:
        | TriageAction
        | 'question'
        | 'accept_slot'
        | 'classify'
        | 'resolve_duplicate'
        | 'review_link'
        | 'decide_mail';
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

async function send(path: string, body: unknown): Promise<Response> {
    const response = await fetch(getApiPath(path), {
        method: 'POST',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
        body: JSON.stringify(body),
    });
    await handleAuthResponse(response, 'Failed to update the triage queue.');
    return response;
}

async function post(path: string, body: unknown): Promise<void> {
    await send(path, body);
}

export const fetchTriageQueue = async (): Promise<TriageQueue> => {
    const response = await fetch(getApiPath('triage'), {
        credentials: 'include',
        headers: getDefaultHeaders(),
    });
    await handleAuthResponse(response, 'Failed to load the triage queue.');
    return response.json();
};

export const answerSlot = (slotId: string, accept: boolean): Promise<void> =>
    post(`triage/slots/${slotId}/${accept ? 'accept' : 'refuse'}`, {});

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

// A link back on its review day: keep it, archive it, or see it in 30 days.
export type LinkReviewDecision = 'keep' | 'archive' | 'later';

export const reviewLink = (
    linkUid: string,
    decision: LinkReviewDecision
): Promise<void> =>
    post(`triage/links/${encodeURIComponent(linkUid)}/review`, { decision });

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
