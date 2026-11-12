import {
    getDefaultHeaders,
    getPostHeadersWithCsrf,
    handleAuthResponse,
} from './authUtils';
import { getApiPath } from '../config/paths';

// Client of automatic classification (docs/41-auto-classify.md).

export type ClassifyEntity = 'task' | 'note';

export interface ProjectOption {
    uid: string;
    name: string;
    area_name: string | null;
    confidence: number | null;
}

export interface ClassifyPayload {
    suggestion_uid: string;
    entity: ClassifyEntity;
    item_uid: string;
    title: string | null;
    project: {
        options: ProjectOption[];
        area: { uid: string; name: string | null } | null;
        new_project: {
            name: string;
            area_uid: string | null;
            area_name: string | null;
        } | null;
    } | null;
    tags: { options: string[]; new_tag: string | null } | null;
    priority: { value: 1 | 2; confidence: number } | null;
}

export type ProjectChoice =
    | { type: 'project'; uid: string }
    | { type: 'area'; uid: string }
    | { type: 'new_project'; name: string; area_uid: string | null }
    | { type: 'none' };

export interface ClassifyChoice {
    project: ProjectChoice;
    tags: string[];
    new_tag: string | null;
    priority: 1 | 2 | null;
}

export interface ClassifyThresholds {
    project: number;
    tags: number;
    duration: number;
    priority: number;
    ask: number;
}

export interface ClassifySettings {
    enabled: boolean;
    mode: 'write' | 'dry_run';
    notify: boolean;
    model: string;
    reasoning_effort: '' | 'minimal' | 'low' | 'medium' | 'high';
    batch_size: number;
    grace_seconds: number;
    max_attempts: number;
    context_cache_minutes: number;
    suggestion_ttl_days: number;
    daily_suggestion_limit: number;
    log_retention_days: number;
    max_tags: number;
    max_tokens: number;
    thresholds: ClassifyThresholds;
    excluded_tags: string[];
}

// The newest API error, until a call succeeds, and how many items gave up.
export interface ClassifyHealth {
    last_error: { message: string; at: string } | null;
    retryable: number;
}

export interface ClassifySettingsResponse {
    settings: ClassifySettings;
    defaults: ClassifySettings;
    ai_configured: boolean;
    health: ClassifyHealth;
}

export interface ClassifyChange {
    id: number;
    run_id: string;
    entity: ClassifyEntity;
    item_uid: string;
    item_title: string | null;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    confidences: Record<string, unknown> | null;
    asked: Record<string, unknown> | null;
    dry_run: boolean;
    undone_at: string | null;
    created_at: string;
    undoable: boolean;
}

export interface ClassifyRun {
    run_id: string;
    created_at: string | null;
    dry_run: boolean;
    undoable: number;
    changes: ClassifyChange[];
}

export interface ClassifyMark {
    change_id: number;
    run_id: string;
    entity: ClassifyEntity;
    item_uid: string;
    fields: string[];
    after: Record<string, unknown>;
    created_at: string;
}

export interface DryRunReport {
    run_id: string;
    considered: number;
    results: { uid: string; outcome: string }[];
    error?: string;
}

// An error the server explained (409: the item changed), kept with its status.
export class ClassifyRequestError extends Error {
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
    if (!response.ok && ![401, 402].includes(response.status)) {
        const detail = await response.json().catch(() => ({}));
        throw new ClassifyRequestError(
            detail?.error || 'Request failed',
            response.status
        );
    }
    await handleAuthResponse(response, 'Request failed');
    return response.json();
}

export const fetchClassifySettings = () =>
    request<ClassifySettingsResponse>('GET', 'auto-classify/settings');

export const saveClassifySettings = (patch: Partial<ClassifySettings>) =>
    request<ClassifySettingsResponse>('PUT', 'auto-classify/settings', patch);

export const fetchClassifyRuns = () =>
    request<{ runs: ClassifyRun[] }>('GET', 'auto-classify/runs');

export const undoClassifyRun = (runId: string) =>
    request<{ undone: number; refused: unknown[] }>(
        'POST',
        `auto-classify/runs/${encodeURIComponent(runId)}/undo`,
        {}
    );

export const undoClassifyChange = (id: number) =>
    request<{ change: ClassifyChange }>(
        'POST',
        `auto-classify/changes/${id}/undo`,
        {}
    );

export const fetchClassifyMarks = (entity: ClassifyEntity, uid: string) =>
    request<{ marks: ClassifyMark[] }>(
        'GET',
        `auto-classify/marks?entity=${entity}&uid=${encodeURIComponent(uid)}`
    );

export const applyClassifySuggestion = (
    uid: string,
    choice: ClassifyChoice | 'all'
) =>
    request<unknown>(
        'POST',
        `auto-classify/suggestions/${encodeURIComponent(uid)}/apply`,
        { choice }
    );

export const dismissClassifySuggestion = (uid: string) =>
    request<unknown>(
        'POST',
        `auto-classify/suggestions/${encodeURIComponent(uid)}/dismiss`,
        {}
    );

export const retryClassifyFailed = () =>
    request<{ requeued: number }>('POST', 'auto-classify/retry', {});

export const runClassifyDryRun = (days: number) =>
    request<DryRunReport>('POST', 'auto-classify/dry-run', { days });

// What "Tout accepter" sends, as the card shows it: the best project (or the
// domain), every tag offered, the priority; never a new project or tag.
export function acceptAllChoice(payload: ClassifyPayload): ClassifyChoice {
    const best = payload.project?.options[0];
    const area = payload.project?.area;
    return {
        project: best
            ? { type: 'project', uid: best.uid }
            : area
              ? { type: 'area', uid: area.uid }
              : { type: 'none' },
        tags: payload.tags?.options ?? [],
        new_tag: null,
        priority: payload.priority?.value ?? null,
    };
}
