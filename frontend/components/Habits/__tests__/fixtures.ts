import type {
    CadenceEvaluation,
    CadenceGoal,
    CadenceHabit,
    CadenceHabitDetail,
    CadenceQuickValue,
} from '../../../utils/cadenceHabitsService';

export const goal = (over: Partial<CadenceGoal> = {}): CadenceGoal => ({
    uid: 'goal-1',
    habit_uid: 'h1',
    target_minor: 1,
    period: 'DAY',
    goal_type: 'BINARY',
    unit_id: null,
    unit_dimension: null,
    unit_name_fr: null,
    unit_symbol: null,
    unit_scale_to_canonical: null,
    frequency_target: null,
    minimum_minor: null,
    direction: 'AT_LEAST',
    progression_step: null,
    progression_cadence: null,
    progression_cap_minor: null,
    progression_starts_on: null,
    effective_from: '2026-10-01',
    ...over,
});

export const minutesGoal = (over: Partial<CadenceGoal> = {}) =>
    goal({
        goal_type: 'DURATION',
        target_minor: 1800,
        unit_id: 'minutes',
        unit_dimension: 'TIME',
        unit_name_fr: 'Minutes',
        unit_symbol: 'min',
        unit_scale_to_canonical: 60,
        ...over,
    });

export const evaluation = (
    over: Partial<CadenceEvaluation> = {}
): CadenceEvaluation => ({
    period_start: '2026-10-05',
    period_end_exclusive: '2026-10-06',
    progress_minor: 0,
    target_minor: 1,
    attainment: 'TODO',
    validates_period: false,
    is_completed: false,
    reached_minimum: false,
    limit_status: null,
    session_count: 0,
    is_paused: false,
    is_planned: true,
    needs_attention: true,
    counts_as_failure: false,
    ...over,
});

export const habit = (over: Partial<CadenceHabit> = {}): CadenceHabit => ({
    uid: 'h1',
    group_uid: null,
    name: 'Lire',
    description: null,
    icon_id: null,
    color_argb: null,
    active: true,
    starts_on: '2026-10-01',
    archived: false,
    sort_order: 0,
    timer_enabled: false,
    abstinence_profile: 'NONE',
    abstinence_started_at: null,
    abstinence_spending_minor: null,
    abstinence_spending_period: null,
    abstinence_savings_currency: null,
    alcohol_follow_up_time: null,
    goal: goal(),
    schedule: null,
    status: {
        date: '2026-10-05',
        evaluation: evaluation(),
        streak: { current: 0, best: 0 },
    },
    ...over,
});

export const quick = (
    uid: string,
    amount: number,
    habitUid = 'h1'
): CadenceQuickValue => ({
    uid,
    habit_uid: habitUid,
    label: String(amount),
    amount_minor: amount,
    sort_order: 0,
});

export const detail = (
    over: Partial<CadenceHabitDetail> = {}
): CadenceHabitDetail => ({
    ...habit(),
    goals: [goal()],
    schedules: [],
    pauses: [],
    quick_values: [],
    reminders: [],
    abstinence_logs: [],
    alcohol_consumptions: [],
    stats: {
        summary: {
            evaluatedPeriods: 10,
            validatedPeriods: 8,
            idealPeriods: 6,
            successRatePercent: 80,
            trendPercentagePoints: 5,
            periodType: 'DAY',
            confidence: 'HIGH',
            days: [],
            calendarDays: [],
        },
        activity: {
            entries30: 12,
            activeDays30: 10,
            totalMinor30: 12,
            peakDayMinor30: 2,
            averagePerActiveDayMinor30: 1.2,
            calendarDays30: 30,
            entries90: 12,
            activeDays90: 10,
            totalMinor90: 12,
            entriesAllTime: 12,
            activeDaysAllTime: 10,
            totalMinorAllTime: 12,
        },
    },
    ...over,
});
