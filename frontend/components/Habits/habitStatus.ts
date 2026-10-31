import type { TFunction } from 'i18next';
import type {
    CadenceGoal,
    CadenceHabit,
    CadenceSchedule,
    PauseReason,
} from '../../utils/cadenceHabitsService';
import {
    DAY_NAMES,
    dayLabel,
    formatMinor,
    formatWithUnit,
    kindOf,
} from '../../utils/cadenceHabitUtils';

// The one-line state of a habit on its card and page header, with the wording
// of the Android app (conciseHabitStatus).
export function statusLine(t: TFunction, habit: CadenceHabit): string {
    const goal = habit.goal;
    const evaluation = habit.status.evaluation;
    if (!goal || !evaluation) {
        return t('cadenceHabits.status.notStarted', 'Not started yet');
    }
    const kind = kindOf(goal);
    if (evaluation.is_paused) return t('cadenceHabits.status.paused', 'Paused');
    if (kind === 'abstinence') {
        const days = habit.status.streak?.current ?? 0;
        return evaluation.progress_minor > 0
            ? t('cadenceHabits.abstinence.todayEvent', 'Today: slip recorded')
            : t('cadenceHabits.abstinence.daysClear', '{{count}} days clear', {
                  count: days,
              });
    }
    if (kind === 'tracker') {
        return t('cadenceHabits.status.trackerTotal', 'Today: {{value}}', {
            value: formatWithUnit(evaluation.progress_minor, goal),
        });
    }
    if (kind === 'limit') {
        const base = t(
            'cadenceHabits.status.limitProgress',
            '{{value}} of {{max}} max',
            {
                value: formatMinor(evaluation.progress_minor, goal),
                max: formatWithUnit(evaluation.target_minor, goal),
            }
        );
        const limit = evaluation.limit_status;
        if (limit === 'EXCEEDED') {
            return `${base} · ${t('cadenceHabits.status.limitExceeded', 'Limit exceeded')}`;
        }
        if (limit === 'AT_LIMIT') {
            return `${base} · ${t('cadenceHabits.status.limitAt', 'Limit reached')}`;
        }
        return base;
    }
    if (!evaluation.is_planned && evaluation.progress_minor === 0) {
        return t('cadenceHabits.status.notPlanned', 'Not planned today');
    }
    if (goal.goal_type === 'BINARY') {
        return evaluation.is_completed
            ? t('cadenceHabits.status.done', 'Done')
            : t('cadenceHabits.status.todo', 'To do');
    }
    const quantity = `${formatMinor(evaluation.progress_minor, goal)} / ${formatWithUnit(
        evaluation.target_minor,
        goal
    )}`;
    if (goal.frequency_target) {
        return t(
            'cadenceHabits.status.sessions',
            '{{quantity}} · {{done}} / {{total}} sessions',
            {
                quantity,
                done: evaluation.session_count,
                total: goal.frequency_target,
            }
        );
    }
    return quantity;
}

export function streakLabel(t: TFunction, current: number): string {
    return t('cadenceHabits.streak.current', '{{count}} periods in a row', {
        count: current,
    });
}

export const periodPhrase = (t: TFunction, period: CadenceGoal['period']) =>
    ({
        DAY: t('cadenceHabits.period.day', 'Per day'),
        WEEK: t('cadenceHabits.period.week', 'Per week'),
        MONTH: t('cadenceHabits.period.month', 'Per month'),
    })[period].toLowerCase();

// One version of a goal, in words: "30 min per day, minimum 10 min".
export function describeGoal(t: TFunction, goal: CadenceGoal): string {
    const kind = kindOf(goal);
    if (kind === 'abstinence') {
        return t('cadenceHabits.kind.abstinence', 'Abstinence');
    }
    if (kind === 'tracker') {
        return t('cadenceHabits.kind.tracker', 'Free activity');
    }
    const period = periodPhrase(t, goal.period);
    if (kind === 'limit') {
        return t(
            'cadenceHabits.goalLine.limit',
            'At most {{value}} {{period}}',
            {
                value: formatWithUnit(goal.target_minor, goal),
                period,
            }
        );
    }
    if (goal.goal_type === 'BINARY') {
        return t('cadenceHabits.goalLine.binary', 'Done {{period}}', {
            period,
        });
    }
    const base = t('cadenceHabits.goalLine.target', '{{value}} {{period}}', {
        value: formatWithUnit(goal.target_minor, goal),
        period,
    });
    const extras = [
        goal.minimum_minor
            ? t('cadenceHabits.goalLine.minimum', 'minimum {{value}}', {
                  value: formatWithUnit(goal.minimum_minor, goal),
              })
            : null,
        goal.frequency_target
            ? t('cadenceHabits.goalLine.sessions', '{{count}} sessions', {
                  count: goal.frequency_target,
              })
            : null,
    ].filter(Boolean);
    return [base, ...extras].join(', ');
}

export function describeSchedule(
    t: TFunction,
    schedule: CadenceSchedule,
    language: string
): string {
    switch (schedule.schedule_mode) {
        case 'EVERY_DAY':
            return t('cadenceHabits.schedule.everyDay', 'Every day');
        case 'SELECTED_DAYS':
            return DAY_NAMES.filter((d) =>
                schedule.active_days.split(',').includes(d)
            )
                .map((d) => dayLabel(d, language))
                .join(', ');
        case 'FLEXIBLE_PERIOD':
            return t(
                'cadenceHabits.schedule.flexible',
                'Any day of the period'
            );
        case 'INTERVAL_DAYS':
            return t('cadenceHabits.schedule.everyN', 'Every {{count}} days', {
                count: schedule.interval_days,
            });
    }
}

export function pauseReason(
    t: TFunction,
    reason: PauseReason | null,
    label: string | null
): string {
    if (reason === 'CUSTOM' && label) return label;
    return {
        TRAVEL: t('cadenceHabits.pause.travel', 'Trip'),
        ILLNESS: t('cadenceHabits.pause.illness', 'Illness'),
        REST: t('cadenceHabits.pause.rest', 'Rest'),
        CUSTOM: t('cadenceHabits.pause.custom', 'Other reason'),
        MANUAL: t('cadenceHabits.pause.manual', 'Paused'),
    }[reason ?? 'MANUAL'];
}
