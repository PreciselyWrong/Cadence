import {
    getDefaultHeaders,
    getPostHeadersWithCsrf,
    handleAuthResponse,
} from './authUtils';
import { getApiPath } from '../config/paths';

// Client of the agent proposals (docs/47-proposals.md). The server computes
// the facts; the answer is only ever applied by the user, one change at a time.

export type ProposalKind = 'week' | 'review' | 'weekend';
export type ProposalStatus =
    'pending' | 'ready' | 'failed' | 'applied' | 'dismissed';

export type WeekOp =
    | 'plan_day'
    | 'this_week'
    | 'next_week'
    | 'this_month'
    | 'next_month'
    | 'later'
    | 'due'
    | 'drop'
    | 'keep';

export interface WeekChange {
    task_uid: string;
    op: WeekOp;
    date?: string;
    reason: string;
}

export interface WeekQuestion {
    id: string;
    text: string;
    choices: string[];
}

// `headline` and `subtitle` since contract v2; `summary` is the older
// one-paragraph answer, still read for proposals answered before.
export interface WeekAnswer {
    headline?: string;
    subtitle?: string;
    summary?: string;
    questions: WeekQuestion[];
    changes: WeekChange[];
}

export type ReviewChoice =
    'do_today' | 'this_week' | 'in_view' | 'later' | 'done' | 'drop' | 'keep';

export interface ReviewJudgement {
    task_uid: string;
    choice: ReviewChoice;
    reason: string;
    cached?: boolean;
}

export interface ReviewAnswer {
    summary: string;
    items: ReviewJudgement[];
}

// A goal, an area or a project as the facts name it: a name, or an object
// carrying one.
export type FactRef = string | { uid?: string; name: string };

export interface WeekTaskFact {
    uid: string;
    name: string;
    goal?: FactRef;
    area?: FactRef;
    due?: string;
    project?: string;
    priority?: string;
    estimate_min?: number;
    overdue?: boolean;
    week_of?: string;
    someday?: boolean;
}

export interface WeekFacts {
    period: { start: string; end: string };
    today: string;
    days: {
        date: string;
        events: { title: string; start: string; end: string | null }[];
        planned: string[];
        load_minutes: number;
    }[];
    tasks: WeekTaskFact[];
    goals?: FactRef[];
    areas?: FactRef[];
    projects?: FactRef[];
}

export interface ProposalSummary {
    uid: string;
    kind: ProposalKind;
    status: ProposalStatus;
    period_start: string | null;
    period_end: string | null;
    answer: WeekAnswer | ReviewAnswer | null;
    error: string | null;
    reply_text: string | null;
    created_at: string;
    updated_at: string;
}

// The week's days as they stand now (`days`, week proposals only, computed at
// each read). Absent on an older server: the facts' loads are the fallback.
export interface WeekDayItem {
    task_uid: string;
    name: string;
    minutes: number;
}

export interface WeekDayEvent {
    title: string;
    start?: string;
    end?: string;
    all_day: boolean;
}

export interface WeekDayWork {
    start: string;
    end: string;
    label?: string | null;
}

export interface WeekDay {
    date: string;
    load_minutes: number;
    capacity_minutes: number;
    items: WeekDayItem[];
    events: WeekDayEvent[];
    work: WeekDayWork | null;
}

export interface ProposalDetail extends ProposalSummary {
    facts: WeekFacts | Record<string, unknown>;
    days?: WeekDay[];
}

export interface ApplyResult {
    task_uid: string;
    state: 'applied' | 'failed';
    error?: string;
}

export interface ApplyOutcome {
    uid: string;
    status: ProposalStatus;
    results: ApplyResult[];
}

// One week decision: any op for a task of the answer, `date` for `plan_day`
// and `due`.
export interface WeekDecision {
    task_uid: string;
    op: WeekOp;
    date?: string;
}

export interface ReviewDecision {
    task_uid: string;
    choice: ReviewChoice;
}

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

// A pending proposal of this kind is returned as it is (200), not doubled.
export const createProposal = (
    kind: ProposalKind,
    period?: { start?: string; end?: string }
): Promise<{ uid: string; status: ProposalStatus }> =>
    request(
        'proposals',
        'POST',
        { kind, ...period },
        'Failed to start the proposal.'
    ).then((response) => response.json());

export const getProposal = (uid: string): Promise<ProposalDetail> =>
    request(
        `proposals/${encodeURIComponent(uid)}`,
        'GET',
        undefined,
        'Failed to load the proposal.'
    ).then((response) => response.json());

// The latest proposal of each kind; `status` narrows it to one status.
export const listProposals = (
    status?: ProposalStatus
): Promise<ProposalSummary[]> =>
    request(
        status ? `proposals?status=${status}` : 'proposals',
        'GET',
        undefined,
        'Failed to load the proposals.'
    )
        .then((response) => response.json())
        .then((body: { proposals: ProposalSummary[] }) => body.proposals);

// Week: the decision taken for each task (`op`). Review: the decisions taken
// on one item each (`choice`).
export const applyProposal = (
    uid: string,
    body: { decisions: WeekDecision[] } | { decisions: ReviewDecision[] }
): Promise<ApplyOutcome> =>
    request(
        `proposals/${encodeURIComponent(uid)}/apply`,
        'POST',
        body,
        'Failed to apply the proposal.'
    ).then((response) => response.json());

// Sends the decisions that are not noted, a remark per noted task (the agent
// asks again for those tasks; the proposal goes back to pending) and the
// answers to the questions (one choice per question, docs/47-proposals.md,
// Send with answers). Without remarks the proposal is applied at once.
export interface ProposalNote {
    task_uid: string;
    text: string;
}

export interface ProposalAnswer {
    question_id: string;
    choice: string;
}

export const sendProposal = (
    uid: string,
    body: {
        decisions: WeekDecision[];
        notes: ProposalNote[];
        answers: ProposalAnswer[];
    }
): Promise<ApplyOutcome> =>
    request(
        `proposals/${encodeURIComponent(uid)}/send`,
        'POST',
        body,
        'Failed to send the proposal.'
    ).then((response) => response.json());

// Asks again with the user's words; the proposal goes back to pending.
export const replyProposal = (
    uid: string,
    text: string
): Promise<ProposalSummary> =>
    request(
        `proposals/${encodeURIComponent(uid)}/reply`,
        'POST',
        { text },
        'Failed to send the reply.'
    ).then((response) => response.json());

export const dismissProposal = (
    uid: string
): Promise<{ uid: string; status: ProposalStatus }> =>
    request(
        `proposals/${encodeURIComponent(uid)}/dismiss`,
        'POST',
        undefined,
        'Failed to dismiss the proposal.'
    ).then((response) => response.json());

// Career (« Carrière »): the agent's morning page of follow-ups, offers and
// tasks. Each decision is applied on its own, as soon as it is taken; the
// server keeps the decisions already applied (`decisions`).
export interface CareerStat {
    label: string;
    value: string | number;
}

export interface CareerFollowup {
    id: string;
    title: string;
    company?: string;
    applied_at?: string;
    note?: string;
    draft_url?: string;
    source_url?: string;
}

export interface CareerOffer {
    id: string;
    title: string;
    company: string;
    location?: string;
    rate?: string;
    url: string;
    expires?: string;
    fit: string;
    source?: string;
}

export interface CareerTask {
    id: string;
    name: string;
    note?: string;
    due_date?: string;
}

export interface CareerAnswer {
    headline: string;
    subtitle?: string;
    stats?: CareerStat[];
    followups: CareerFollowup[];
    offers: CareerOffer[];
    tasks: CareerTask[];
}

export type CareerDecision =
    | {
          kind: 'offer';
          id: string;
          op: 'apply' | 'skip' | 'later';
          note?: string;
      }
    | { kind: 'followup'; id: string; op: 'done' | 'later' | 'task' }
    | { kind: 'task'; id: string; op: 'create' | 'skip'; due_date?: string };

export interface CareerProposal {
    uid: string;
    kind: 'career';
    status: ProposalStatus;
    created_at: string;
    updated_at?: string;
    answer: CareerAnswer | null;
    decisions?: CareerDecision[];
}

export interface CareerApplyOutcome {
    uid?: string;
    status?: ProposalStatus;
    results?: { kind?: string; id?: string; state?: string; error?: string }[];
}

export const listCareerProposals = (): Promise<CareerProposal[]> =>
    request(
        'proposals?kind=career&status=ready',
        'GET',
        undefined,
        'Failed to load the career page.'
    )
        .then((response) => response.json())
        .then((body: { proposals?: CareerProposal[] }) => body.proposals ?? []);

// Partial apply: one decision at a time is fine. A result marked `failed`
// for that decision is an error for the caller.
export const applyCareerDecisions = async (
    uid: string,
    decisions: CareerDecision[]
): Promise<CareerApplyOutcome> => {
    const outcome: CareerApplyOutcome = await request(
        `proposals/${encodeURIComponent(uid)}/apply`,
        'POST',
        { decisions },
        'Failed to apply the decision.'
    ).then((response) => response.json());
    const failed = outcome?.results?.find((r) => r.state === 'failed');
    if (failed)
        throw new Error(failed.error || 'Failed to apply the decision.');
    return outcome;
};

// Week-end (docs/48-weekend.md): one outing per free slot of the weekend. The
// user picks per slot, then « Valider » sends every pick in one call.
export type WeekendWeather =
    'sun' | 'partly' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog';
export type WeekendPart = 'morning' | 'afternoon' | 'day';
export type WeekendOp = 'calendar' | 'skip' | 'other';

export interface WeekendDay {
    date: string;
    weather: WeekendWeather;
    min: number;
    max: number;
}

export interface WeekendActivity {
    title: string;
    url?: string;
    note?: string;
    travel?: string;
    start?: string;
    end?: string;
    after?: string;
}

export interface WeekendDecision {
    op: WeekendOp;
    note?: string;
}

export interface WeekendEvent {
    state: 'requested' | 'created' | 'failed';
    link?: string;
    error?: string;
}

export interface WeekendSlot {
    id: string;
    date: string;
    part: WeekendPart;
    weather?: WeekendWeather;
    temp?: number;
    feels?: number;
    busy?: string;
    after?: string;
    activity?: WeekendActivity;
    recommended?: boolean;
    decision?: WeekendDecision;
    event?: WeekendEvent;
}

export interface WeekendElsewhere {
    place: string;
    date: string;
    weather: WeekendWeather;
    temp: number;
    travel?: string;
}

export interface WeekendAnswer {
    headline: string;
    subtitle?: string;
    days: WeekendDay[];
    slots: WeekendSlot[];
    elsewhere?: WeekendElsewhere[];
}

export interface WeekendProposal {
    uid: string;
    kind: 'weekend';
    status: ProposalStatus;
    created_at: string;
    updated_at?: string;
    answer: WeekendAnswer | null;
}

export interface WeekendDecisionInput {
    slot_id: string;
    op: WeekendOp;
    note?: string;
}

export interface WeekendApplyOutcome {
    uid?: string;
    status?: ProposalStatus;
    results?: { slot_id?: string; state?: string; error?: string }[];
}

export const getWeekendProposal = (uid: string): Promise<WeekendProposal> =>
    request(
        `proposals/${encodeURIComponent(uid)}`,
        'GET',
        undefined,
        'Failed to load the weekend proposal.'
    ).then((response) => response.json());

// Like the career decisions: an answer the server refuses for one slot fails
// the whole call, so the caller sees it as an error.
export const applyWeekendDecisions = async (
    uid: string,
    decisions: WeekendDecisionInput[]
): Promise<WeekendApplyOutcome> => {
    const outcome: WeekendApplyOutcome = await request(
        `proposals/${encodeURIComponent(uid)}/apply`,
        'POST',
        { decisions },
        'Failed to apply the weekend proposal.'
    ).then((response) => response.json());
    const failed = outcome?.results?.find((r) => r.state === 'failed');
    if (failed)
        throw new Error(
            failed.error || 'Failed to apply the weekend proposal.'
        );
    return outcome;
};
