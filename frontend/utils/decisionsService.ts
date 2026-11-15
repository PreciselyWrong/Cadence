import {
    getDefaultHeaders,
    getPostHeadersWithCsrf,
    handleAuthResponse,
} from './authUtils';
import { getApiPath } from '../config/paths';

// Client of the agent decisions deck (docs/49-agent-decisions.md).

export interface DecisionChoice {
    id: string;
    label: string;
    tone?: 'primary' | 'danger';
}

export interface DecisionCard {
    uid: string;
    kind: string;
    kind_label: string;
    key: string;
    title: string;
    context?: string | null;
    body?: string | null;
    url?: string | null;
    choices: DecisionChoice[];
    recommended?: string | null;
    reason?: string | null;
    created_at: string;
    updated_at: string;
}

export interface DecisionsResponse {
    items: DecisionCard[];
    count: number;
}

export interface DecideDecisionOptions {
    note?: string;
    until?: string;
}

const newKey = () =>
    `decision:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

async function request(
    path: string,
    method: 'GET' | 'POST',
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

export const fetchDecisions = async (): Promise<DecisionsResponse> =>
    (
        await request(
            'decisions',
            'GET',
            undefined,
            'Failed to load the decisions.'
        )
    ).json();

export const decideDecision = async (
    uid: string,
    decision: string,
    options: DecideDecisionOptions = {},
    idempotencyKey?: string
): Promise<{ ok?: boolean; replayed?: boolean }> => {
    const body: Record<string, unknown> = {
        decision,
        idempotency_key: idempotencyKey ?? newKey(),
    };
    if (options.note !== undefined) body.note = options.note;
    if (options.until !== undefined) body.until = options.until;
    const response = await request(
        `decisions/${encodeURIComponent(uid)}/decide`,
        'POST',
        body,
        'Failed to save the decision.'
    );
    return response.json();
};
