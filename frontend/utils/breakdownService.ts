import {
    getDefaultHeaders,
    getPostHeadersWithCsrf,
    handleAuthResponse,
} from './authUtils';
import { getApiPath } from '../config/paths';
import { Task } from '../entities/Task';

// Client of « Découper en étapes » (backend/modules/breakdown/).

export interface BreakdownStep {
    name: string;
    minutes: number;
}

// Why the AI gave nothing: the sheet says it in one line.
export type BreakdownReason =
    'disabled' | 'not_configured' | 'failed' | 'empty' | null;

export interface BreakdownProposal {
    source: 'ai' | 'fallback';
    reason: BreakdownReason;
    steps: BreakdownStep[];
    total_minutes: number;
}

export interface BreakdownSettings {
    enabled: boolean;
    model: string;
    max_steps: number;
    min_step_minutes: number;
    max_step_minutes: number;
    note_chars: number;
    max_tokens: number;
}

export interface BreakdownSettingsResponse {
    settings: BreakdownSettings;
    defaults: BreakdownSettings;
    ai_configured: boolean;
}

export class BreakdownRequestError extends Error {
    constructor(
        message: string,
        public status: number
    ) {
        super(message);
    }
}

async function request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown
): Promise<T> {
    const response = await fetch(getApiPath(path), {
        method,
        credentials: 'include',
        headers:
            method === 'GET'
                ? getDefaultHeaders()
                : await getPostHeadersWithCsrf(),
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok && ![401, 402, 429].includes(response.status)) {
        const detail = await response.json().catch(() => ({}));
        throw new BreakdownRequestError(
            detail?.error || 'Request failed',
            response.status
        );
    }
    await handleAuthResponse(response, 'Request failed');
    return response.json();
}

const taskPath = (uid: string) => `task/${encodeURIComponent(uid)}/breakdown`;

// Writes nothing: the steps are only proposed.
export const proposeBreakdown = (uid: string) =>
    request<BreakdownProposal>('POST', taskPath(uid), {});

export const applyBreakdown = (
    uid: string,
    steps: { name: string; minutes: number | null }[]
) => request<{ subtasks: Task[] }>('POST', `${taskPath(uid)}/apply`, { steps });

export const getBreakdownSettings = () =>
    request<BreakdownSettingsResponse>('GET', 'breakdown/settings');

export const updateBreakdownSettings = (patch: Partial<BreakdownSettings>) =>
    request<BreakdownSettingsResponse>('PUT', 'breakdown/settings', patch);
