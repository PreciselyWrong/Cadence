import {
    getDefaultHeaders,
    getPostHeadersWithCsrf,
    handleAuthResponse,
} from './authUtils';
import { getApiPath } from '../config/paths';
import type { StatusType } from '../entities/Task';

// Client of the daily brief API (docs/39-daily-brief.md, API and Brief JSON).
// Components never call fetch themselves.

export interface BriefSource {
    id: 'tasks' | 'calendar' | 'mail' | 'llm';
    status: string;
    detail?: string;
}

export interface BriefTimelineEvent {
    ref: string;
    series_ref: string | null;
    title: string;
    all_day: boolean;
    start_minute: number | null;
    end_minute: number | null;
    calendar: string;
    conflict: boolean;
}

export interface BriefTimelineDay {
    date: string;
    work: { start: number; end: number; label: string }[];
    events: BriefTimelineEvent[];
    task_uids: string[];
    load: {
        planned_minutes: number;
        task_minutes?: number;
        capacity_minutes: number | null;
        hypothesis: boolean;
        note?: string;
    };
    flags: string[];
}

export interface BriefTonightItem {
    reason_code?: string | null;
    task_uid: string;
    reason: string;
    minutes: number;
}

export interface BriefMove {
    proposal_key: string;
    task_uid: string;
    from: string;
    to: string;
    reason: string;
}

export interface BriefQuestion {
    key: string;
    text: string;
    target: { scope: 'task' | 'event' | 'series'; ref: string };
}

export interface BriefAnticipate {
    key: string;
    type:
        | 'conflict'
        | 'overload'
        | 'duplicate'
        | 'deadline_in_note'
        | 'postponed'
        | 'dependency'
        | 'event_in_work_hours';
    text: string;
    task_uids: string[];
    event_refs: string[];
    question: BriefQuestion | null;
}

export interface BriefReply {
    account: string;
    thread_ref: string;
    from: string;
    subject: string;
    date: string;
    summary: string;
    link: string;
}

export interface BriefInboxItem {
    uid: string;
    title: string;
    proposal: {
        action: 'task' | 'note' | 'later' | 'delete';
        reason: string;
    } | null;
}

export interface BriefResolved {
    task_uid: string;
    completed_at: string;
}

export interface DailyBrief {
    schema: number;
    date: string;
    timezone: string;
    generated_at: string;
    sources: BriefSource[];
    counters: {
        due_today: number;
        overdue: number;
        tonight_minutes: number;
        capacity_minutes: number | null;
        conflicts: number;
        replies: number;
    };
    verdict: { text: string; by: 'rules' | 'llm' };
    timeline: BriefTimelineDay[];
    tonight: BriefTonightItem[];
    moves: BriefMove[];
    anticipate: BriefAnticipate[];
    replies: BriefReply[];
    inbox: BriefInboxItem[];
    resolved: BriefResolved[];
    audio_script?: unknown;
    audio: {
        status: 'none' | 'pending' | 'ready' | 'failed';
        path: string | null;
        duration_seconds: number | null;
        chapters: { id: string; start_seconds: number }[];
        voice: string | null;
    };
}

// The task as it is now; the brief only keeps uids.
export interface BriefTaskState {
    uid: string;
    name: string;
    status: StatusType | number;
    due_date: string | null;
    completed_at: string | null;
    estimated_minutes: number | null;
    priority: string | number | null;
    project_name: string | null;
    recurring?: boolean;
}

export type BriefStatus = 'pending' | 'partial' | 'ready' | 'failed' | null;

export interface DailyBriefResponse {
    date: string;
    brief: DailyBrief | null;
    version: number | null;
    status: BriefStatus;
    generated_at: string | null;
    tasks: Record<string, BriefTaskState>;
}

// The evening review (docs/39-daily-brief.md, Evening review). Built on each
// request from the current state; nothing is stored.
export interface EveningSlipped {
    task_uid: string;
    reason: string;
}

export interface EveningTonightItem {
    task_uid: string;
    minutes: number;
}

export interface DailyEvening {
    schema: number;
    date: string;
    generated_at: string;
    verdict: { text: string; by: 'rules' };
    counters: {
        done: number;
        slipped: number;
        tonight_minutes: number;
        capacity_minutes: number | null;
    };
    done: string[];
    tonight: EveningTonightItem[];
    slipped: EveningSlipped[];
    carry_over: string[];
    tomorrow: BriefTimelineDay;
    audio_script?: unknown;
}

export interface DailyEveningResponse {
    date: string;
    evening: DailyEvening;
    tasks: Record<string, BriefTaskState>;
}

export interface BriefEveningWindow {
    start: string;
    end: string;
    minutes: number;
}

export interface BriefEveningSettings {
    enabled: boolean;
    switchTime: string;
}

export interface BriefSettings {
    enabled: boolean;
    time: string;
    days: number[];
    sections: string[];
    evening: BriefEveningSettings;
    timelineDays: number;
    calendarFeedUids: string[];
    calendarLookaheadDays: number;
    priorities: string[];
    thresholds: {
        postponements: number;
        duplicateSimilarity: number;
        maxMoves: number;
        maxTonight: number;
        closedLookbackDays: number;
    };
    capacity: {
        evening: Record<string, BriefEveningWindow>;
        dayNotes: Record<string, string>;
    };
    retention: { decisionsDays: number; audioDays: number };
    alerts: {
        disabled: string[];
        noise: { minVotes: number; ratio: number };
    };
    writing: { tone: string; instructions: string };
    llm: { enabled: boolean };
    triage: { enabled: boolean; dailyLimit: number };
    voice: {
        enabled: boolean;
        piperUrl: string;
        voice: string;
        speed: number;
        dictionary: { from: string; to: string }[];
    };
    mail: {
        enabled: boolean;
        accounts: string[];
        excludedAccounts: string[];
        replyWindowDays: number;
    };
}

// What PUT accepts: any part of the settings. A null removes a weekday key.
export type BriefSettingsPatch = Record<string, unknown>;

export interface BriefSourceStatus {
    id: 'calendar' | 'mail' | 'llm' | 'voice' | 'agent' | string;
    configured: boolean;
    working: boolean | null;
    detail: string | null;
}

export interface BriefStatusResponse {
    sources: BriefSourceStatus[];
    timezone_set: boolean;
}

export type BriefDecisionKind =
    'move' | 'tonight' | 'anticipate' | 'question' | 'mail' | 'feedback';

export interface BriefDecisionInput {
    kind: BriefDecisionKind;
    target_type: string;
    target_ref: string;
    decision: 'accepted' | 'refused' | 'ignored';
    proposal?: Record<string, unknown> | null;
    fingerprint?: string | null;
    reason?: string | null;
    idempotency_key: string;
}

export interface BriefAnswerInput {
    question_key: string;
    target: { scope: 'task' | 'event' | 'series'; ref: string };
    answer: 'yes' | 'no' | string;
    idempotency_key: string;
}

export type BriefContextScope = 'task' | 'event' | 'series';

export interface BriefContext {
    uid: string;
    scope: BriefContextScope;
    target_ref: string;
    text: string;
    created_at?: string;
    updated_at?: string;
}

export interface BriefContextsQuery {
    scope?: BriefContextScope;
    target_ref?: string;
}

export interface AgentSettings {
    baseUrl: string;
    timeoutSeconds: number;
    profiles: { mail: string };
    api_key_set: boolean;
    api_key_last4: string | null;
}

// Only the fields the user sets; api_key: null clears the stored key, a
// missing api_key keeps it.
export type AgentSettingsPatch = Partial<
    Omit<AgentSettings, 'api_key_set' | 'api_key_last4'>
> & { api_key?: string | null };

export type AgentCheck = 'ok' | 'error' | 'unauthorized' | 'missing';

export interface AgentTestResult {
    health: 'ok' | 'error';
    auth: 'ok' | 'error' | 'unauthorized';
    profiles: { mail: AgentCheck };
}

const jsonRequest = async (
    path: string,
    method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE',
    body?: unknown,
    errorMessage = 'Request failed.'
): Promise<Response> => {
    const mutating = method !== 'GET';
    const headers = mutating
        ? await getPostHeadersWithCsrf()
        : getDefaultHeaders();
    const response = await fetch(getApiPath(path), {
        method,
        credentials: 'include',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    await handleAuthResponse(response, errorMessage);
    return response;
};

export const fetchDailyBrief = async (
    date: string
): Promise<DailyBriefResponse> =>
    (
        await jsonRequest(
            `daily-plan/${encodeURIComponent(date)}/brief`,
            'GET',
            undefined,
            'Failed to load the daily brief.'
        )
    ).json();

// Explicit regeneration: a new version of the day's brief.
export const regenerateDailyBrief = async (
    date: string
): Promise<DailyBriefResponse> =>
    (
        await jsonRequest(
            `daily-plan/${encodeURIComponent(date)}/brief`,
            'POST',
            {},
            'Failed to generate the daily brief.'
        )
    ).json();

export const fetchDailyEvening = async (
    date: string
): Promise<DailyEveningResponse> =>
    (
        await jsonRequest(
            `daily-plan/${encodeURIComponent(date)}/evening`,
            'GET',
            undefined,
            'Failed to load the evening review.'
        )
    ).json();

export const fetchBriefSettings = async (): Promise<BriefSettings> =>
    (
        await jsonRequest(
            'daily-plan/brief/settings',
            'GET',
            undefined,
            'Failed to load the brief settings.'
        )
    ).json();

export const saveBriefSettings = async (
    patch: BriefSettingsPatch
): Promise<BriefSettings> =>
    (
        await jsonRequest(
            'daily-plan/brief/settings',
            'PUT',
            patch,
            'Failed to save the brief settings.'
        )
    ).json();

// The Today card toggle lives in the profile's today settings.
export const saveShowDailyBrief = async (show: boolean): Promise<void> => {
    await jsonRequest(
        'profile/today-settings',
        'PUT',
        { showDailyBrief: show },
        'Failed to save the Today settings.'
    );
};

export const fetchBriefStatus = async (): Promise<BriefStatusResponse> =>
    (
        await jsonRequest(
            'daily-plan/brief/status',
            'GET',
            undefined,
            'Failed to load the brief status.'
        )
    ).json();

export const recordBriefDecision = async (
    date: string,
    input: BriefDecisionInput
): Promise<unknown> =>
    (
        await jsonRequest(
            `daily-plan/${encodeURIComponent(date)}/brief/decisions`,
            'POST',
            input,
            'Failed to record the decision.'
        )
    ).json();

export const answerBriefQuestion = async (
    date: string,
    input: BriefAnswerInput
): Promise<{ context: BriefContext; decision: unknown }> =>
    (
        await jsonRequest(
            `daily-plan/${encodeURIComponent(date)}/brief/answers`,
            'POST',
            input,
            'Failed to save the answer.'
        )
    ).json();

export const fetchBriefContexts = async (
    query: BriefContextsQuery = {}
): Promise<BriefContext[]> => {
    const search = new URLSearchParams();
    if (query.scope) search.set('scope', query.scope);
    if (query.target_ref) search.set('target_ref', query.target_ref);
    const qs = search.toString();
    const data = await (
        await jsonRequest(
            `daily-plan/brief/contexts${qs ? `?${qs}` : ''}`,
            'GET',
            undefined,
            'Failed to load the contexts.'
        )
    ).json();
    return data.contexts;
};

export const updateBriefContext = async (
    uid: string,
    text: string
): Promise<BriefContext> =>
    (
        await jsonRequest(
            `daily-plan/brief/contexts/${encodeURIComponent(uid)}`,
            'PATCH',
            { text },
            'Failed to update the context.'
        )
    ).json();

export const deleteBriefContext = async (uid: string): Promise<void> => {
    await jsonRequest(
        `daily-plan/brief/contexts/${encodeURIComponent(uid)}`,
        'DELETE',
        undefined,
        'Failed to delete the context.'
    );
};

export const fetchAgentSettings = async (): Promise<AgentSettings> =>
    (
        await jsonRequest(
            'agents/settings',
            'GET',
            undefined,
            'Failed to load the agent settings.'
        )
    ).json();

export const saveAgentSettings = async (
    patch: AgentSettingsPatch
): Promise<AgentSettings> =>
    (
        await jsonRequest(
            'agents/settings',
            'PUT',
            patch,
            'Failed to save the agent settings.'
        )
    ).json();

export const testAgentConnection = async (): Promise<AgentTestResult> =>
    (
        await jsonRequest(
            'agents/test',
            'POST',
            {},
            'Failed to test the agent connection.'
        )
    ).json();
