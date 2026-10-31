import { getApiPath } from '../config/paths';
import { getCsrfToken } from './csrfService';
import { newId } from './cadenceHabitUtils';

// Client of the Cadence habits REST (docs/21-habits.md, "Cadence habits").
// Field names are those of the server and of the Android app: snake_case,
// quantities in minor units, civil dates as YYYY-MM-DD.

export type Period = 'DAY' | 'WEEK' | 'MONTH';
export type GoalType = 'BINARY' | 'COUNT' | 'QUANTITY' | 'DURATION';
export type Direction = 'AT_LEAST' | 'AT_MOST' | 'TRACK_ONLY';
export type UnitDimension =
    'TIME' | 'COUNT' | 'DISTANCE' | 'MASS' | 'VOLUME' | 'CUSTOM';
export type ScheduleMode =
    'EVERY_DAY' | 'SELECTED_DAYS' | 'FLEXIBLE_PERIOD' | 'INTERVAL_DAYS';
export type DayName =
    | 'MONDAY'
    | 'TUESDAY'
    | 'WEDNESDAY'
    | 'THURSDAY'
    | 'FRIDAY'
    | 'SATURDAY'
    | 'SUNDAY';
export type Attainment = 'TODO' | 'MINIMUM' | 'IDEAL';
export type LimitStatus = 'UNDER' | 'AT_LIMIT' | 'EXCEEDED';
export type PauseReason = 'REST' | 'ILLNESS' | 'TRAVEL' | 'CUSTOM' | 'MANUAL';
export type DayStatus =
    | 'IDEAL'
    | 'MINIMUM'
    | 'MISSED'
    | 'PAUSED'
    | 'ACTIVITY'
    | 'NO_ACTIVITY'
    | 'UNPLANNED';

export interface CadenceGroup {
    uid: string;
    name: string;
    start_minute: number | null;
    end_minute: number | null;
    sort_order: number;
}

export interface CadenceGoal {
    uid: string;
    habit_uid: string;
    target_minor: number;
    period: Period;
    goal_type: GoalType;
    unit_id: string | null;
    unit_dimension: UnitDimension | null;
    unit_name_fr: string | null;
    unit_symbol: string | null;
    unit_scale_to_canonical: number | null;
    frequency_target: number | null;
    minimum_minor: number | null;
    direction: Direction;
    progression_step: number | null;
    progression_cadence: 'WEEKLY' | 'MONTHLY' | null;
    progression_cap_minor: number | null;
    progression_starts_on: string | null;
    effective_from: string;
}

export interface CadenceSchedule {
    uid: string;
    habit_uid: string;
    schedule_mode: ScheduleMode;
    active_days: string;
    first_day_of_week: DayName;
    effective_from: string;
    interval_days: number;
}

export interface CadenceEvaluation {
    period_start: string;
    period_end_exclusive: string;
    progress_minor: number;
    target_minor: number;
    attainment: Attainment;
    validates_period: boolean;
    is_completed: boolean;
    reached_minimum: boolean;
    limit_status: LimitStatus | null;
    session_count: number;
    is_paused: boolean;
    is_planned: boolean;
    needs_attention: boolean;
    counts_as_failure: boolean;
}

export interface CadenceStatus {
    date: string;
    evaluation: CadenceEvaluation | null;
    streak: { current: number; best: number } | null;
}

export interface CadenceHabit {
    uid: string;
    group_uid: string | null;
    name: string;
    description: string | null;
    icon_id: string | null;
    color_argb: number | null;
    active: boolean;
    starts_on: string;
    archived: boolean;
    sort_order: number;
    timer_enabled: boolean;
    abstinence_profile: string;
    abstinence_started_at: string | null;
    abstinence_spending_minor: number | null;
    abstinence_spending_period: Period | null;
    abstinence_savings_currency: string | null;
    alcohol_follow_up_time: string | null;
    goal: CadenceGoal | null;
    schedule: CadenceSchedule | null;
    status: CadenceStatus;
}

export interface CadenceEntry {
    uid: string;
    habit_uid: string;
    occurred_at: string;
    local_date: string;
    observed_zone_id: string;
    value_minor: number;
    source: string;
    session_id: string | null;
    note: string | null;
}

export interface CadencePause {
    uid: string;
    habit_uid: string;
    start: string;
    end_exclusive: string | null;
    reason: PauseReason | null;
    reason_label: string | null;
}

export interface CadenceQuickValue {
    uid: string;
    habit_uid: string;
    label: string;
    amount_minor: number;
    sort_order: number;
}

export interface CadenceReminder {
    uid: string;
    habit_uid: string;
    time: string;
    days_of_week: string;
    enabled: boolean;
    conditional: boolean;
}

export interface AbstinenceLog {
    uid: string;
    habit_uid: string;
    occurred_at: string;
    local_date: string;
    observed_zone_id: string;
    kind: 'CHECK_IN' | 'URGE';
    intensity: number | null;
    note: string | null;
}

export interface AlcoholConsumption {
    uid: string;
    habit_uid: string;
    local_date: string;
    observed_zone_id: string;
    standard_drinks: number | null;
    follow_up_date: string | null;
    follow_up_notified: boolean;
    observed_at: string | null;
}

export interface CadenceDayEntry {
    date: string;
    status: DayStatus;
}

export interface CadenceSummary {
    evaluatedPeriods: number;
    validatedPeriods: number;
    idealPeriods: number;
    successRatePercent: number | null;
    trendPercentagePoints: number | null;
    periodType: Period | null;
    confidence: string;
    days: CadenceDayEntry[];
    calendarDays: CadenceDayEntry[];
}

export interface CadenceActivity {
    entries30: number;
    activeDays30: number;
    totalMinor30: number;
    peakDayMinor30: number;
    averagePerActiveDayMinor30: number | null;
    calendarDays30: number;
    entries90: number;
    activeDays90: number;
    totalMinor90: number;
    entriesAllTime: number;
    activeDaysAllTime: number;
    totalMinorAllTime: number;
}

export interface CadenceHabitDetail extends CadenceHabit {
    goals: CadenceGoal[];
    schedules: CadenceSchedule[];
    pauses: CadencePause[];
    quick_values: CadenceQuickValue[];
    reminders: CadenceReminder[];
    abstinence_logs: AbstinenceLog[];
    alcohol_consumptions: AlcoholConsumption[];
    stats: { summary: CadenceSummary; activity: CadenceActivity };
}

export interface CadenceHabitList {
    date: string;
    timezone: string;
    habits: CadenceHabit[];
}

export type GoalInput = Partial<Omit<CadenceGoal, 'uid' | 'habit_uid'>> &
    Pick<CadenceGoal, 'target_minor' | 'period'>;
export type ScheduleInput = Partial<Omit<CadenceSchedule, 'uid' | 'habit_uid'>>;

export interface CreateHabitInput {
    uid?: string;
    name: string;
    description?: string | null;
    icon_id?: string | null;
    color_argb?: number | null;
    group_uid?: string | null;
    starts_on?: string;
    timer_enabled?: boolean;
    abstinence_profile?: string;
    goal: GoalInput;
    schedule?: ScheduleInput;
    effective_from?: string;
}

export type HabitPatch = Partial<
    Pick<
        CadenceHabit,
        | 'name'
        | 'description'
        | 'icon_id'
        | 'color_argb'
        | 'group_uid'
        | 'archived'
        | 'active'
        | 'starts_on'
        | 'sort_order'
        | 'timer_enabled'
        | 'abstinence_profile'
        | 'abstinence_started_at'
    >
>;

export type RowCollection =
    | 'goals'
    | 'schedules'
    | 'entries'
    | 'pauses'
    | 'quick-values'
    | 'reminders'
    | 'abstinence-logs'
    | 'alcohol-consumptions';

export class CadenceHabitError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string) {
        super(code);
        this.name = 'CadenceHabitError';
        this.status = status;
        this.code = code;
    }
}

async function failure(response: Response): Promise<CadenceHabitError> {
    let code = `http_${response.status}`;
    try {
        const data = await response.json();
        code = data.error || data.message || code;
    } catch {
        // the status alone is the code
    }
    return new CadenceHabitError(response.status, code);
}

async function read<T>(path: string): Promise<T> {
    const response = await fetch(getApiPath(path), { credentials: 'include' });
    if (!response.ok) throw await failure(response);
    return response.json();
}

async function write<T>(
    path: string,
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    body?: unknown
): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-csrf-token': await getCsrfToken(),
    };
    if (method === 'POST') headers['Idempotency-Key'] = newId();
    const response = await fetch(getApiPath(path), {
        method,
        credentials: 'include',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw await failure(response);
    return response.json();
}

const query = (params: Record<string, string | boolean | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== false) {
            search.set(key, String(value));
        }
    }
    const text = search.toString();
    return text ? `?${text}` : '';
};

export const fetchCadenceHabits = (
    options: { archived?: boolean; date?: string } = {}
): Promise<CadenceHabitList> =>
    read(
        `cadence/habits${query({ archived: options.archived, date: options.date })}`
    );

export const fetchCadenceHabit = (
    uid: string,
    date?: string
): Promise<CadenceHabitDetail> =>
    read(`cadence/habits/${uid}${query({ date })}`);

export const createCadenceHabit = (
    input: CreateHabitInput
): Promise<CadenceHabitDetail> => write('cadence/habits', 'POST', input);

export const updateCadenceHabit = (
    uid: string,
    patch: HabitPatch
): Promise<CadenceHabitDetail> =>
    write(`cadence/habits/${uid}`, 'PATCH', patch);

export const deleteCadenceHabit = (uid: string): Promise<{ deleted: true }> =>
    write(`cadence/habits/${uid}`, 'DELETE');

export const fetchCadenceGroups = (): Promise<CadenceGroup[]> =>
    read('cadence/groups');

export const fetchEntries = (
    habitUid: string,
    range: { from?: string; to?: string } = {}
): Promise<CadenceEntry[]> =>
    read(
        `cadence/habits/${habitUid}/entries${query({ from: range.from, to: range.to })}`
    );

export const createRow = <T = unknown>(
    habitUid: string,
    collection: RowCollection,
    body: object
): Promise<T> =>
    write(`cadence/habits/${habitUid}/${collection}`, 'POST', body);

export const updateRow = <T = unknown>(
    habitUid: string,
    collection: RowCollection,
    rowUid: string,
    body: object
): Promise<T> =>
    write(`cadence/habits/${habitUid}/${collection}/${rowUid}`, 'PATCH', body);

export const deleteRow = (
    habitUid: string,
    collection: RowCollection,
    rowUid: string
): Promise<{ deleted: true }> =>
    write(`cadence/habits/${habitUid}/${collection}/${rowUid}`, 'DELETE');
