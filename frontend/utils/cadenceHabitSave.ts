import {
    CadenceGoal,
    CadenceHabitDetail,
    CadenceSchedule,
    HabitPatch,
    createCadenceHabit,
    createRow,
    deleteRow,
    updateCadenceHabit,
    updateRow,
} from './cadenceHabitsService';
import {
    ALL_DAY_GROUP,
    HabitDraft,
    buildGoal,
    buildSchedule,
    draftScale,
    hexToArgb,
    quickAmounts,
} from './cadenceHabitUtils';

// Writes of the habit editor. A change of goal or schedule is a new version
// from a date, so the past keeps the goal that produced it; "fix" corrects the
// version in force instead (a typing mistake, not a new goal).

export interface ApplyChoice {
    apply: 'new' | 'fix';
    from: string;
}

const GOAL_KEYS: (keyof CadenceGoal)[] = [
    'target_minor',
    'period',
    'goal_type',
    'unit_id',
    'frequency_target',
    'minimum_minor',
    'direction',
    'progression_step',
];

export function goalChanged(current: CadenceGoal | null, draft: HabitDraft) {
    if (!current) return true;
    const built = buildGoal(draft, current) as Partial<CadenceGoal>;
    return GOAL_KEYS.some(
        (key) => (built[key] ?? null) !== (current[key] ?? null)
    );
}

export function scheduleChanged(
    current: CadenceSchedule | null,
    draft: HabitDraft
) {
    if (!current) return true;
    const built = buildSchedule(draft);
    if (built.schedule_mode !== current.schedule_mode) return true;
    if (built.first_day_of_week !== current.first_day_of_week) return true;
    if (
        built.schedule_mode === 'SELECTED_DAYS' &&
        built.active_days !== current.active_days
    ) {
        return true;
    }
    return (
        built.schedule_mode === 'INTERVAL_DAYS' &&
        built.interval_days !== current.interval_days
    );
}

const habitFields = (draft: HabitDraft) => ({
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    color_argb: hexToArgb(draft.colorHex),
    group_uid: draft.groupUid || ALL_DAY_GROUP,
    timer_enabled: draft.timerEnabled && draft.goalType === 'DURATION',
    abstinence_profile:
        draft.kind === 'abstinence'
            ? draft.abstinenceProfile === 'NONE'
                ? 'CUSTOM'
                : draft.abstinenceProfile
            : draft.abstinenceProfile,
});

const hasQuickValues = (draft: HabitDraft) =>
    draft.kind !== 'abstinence' &&
    (draft.kind !== 'goal' || draft.goalType !== 'BINARY');

const desiredQuickValues = (draft: HabitDraft) =>
    hasQuickValues(draft)
        ? [...new Set(quickAmounts(draft.quickValues, draftScale(draft)))]
        : [];

const quickLabel = (amountMinor: number, draft: HabitDraft) =>
    String(amountMinor / draftScale(draft));

export async function createFromDraft(
    draft: HabitDraft
): Promise<CadenceHabitDetail> {
    const fields = habitFields(draft);
    const created = await createCadenceHabit({
        ...fields,
        ...(draft.kind === 'abstinence'
            ? { abstinence_started_at: new Date().toISOString() }
            : {}),
        goal: buildGoal(draft),
        schedule: buildSchedule(draft),
    } as Parameters<typeof createCadenceHabit>[0]);

    await Promise.all(
        desiredQuickValues(draft).map((amount, index) =>
            createRow(created.uid, 'quick-values', {
                label: quickLabel(amount, draft),
                amount_minor: amount,
                sort_order: index,
            })
        )
    );
    await Promise.all(
        draft.reminderTimes.map((time) =>
            createRow(created.uid, 'reminders', {
                time,
                days_of_week: '',
                enabled: true,
                conditional: draft.conditionalReminders,
            })
        )
    );
    return created;
}

export async function updateFromDraft(
    current: CadenceHabitDetail,
    draft: HabitDraft,
    choice: ApplyChoice
): Promise<void> {
    const uid = current.uid;
    const fields = habitFields(draft);
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
        if (
            value !==
            ((current as unknown as Record<string, unknown>)[key] ?? null)
        ) {
            patch[key] = value;
        }
    }
    if ((patch.group_uid ?? null) === null) delete patch.group_uid;
    if (
        patch.group_uid === ALL_DAY_GROUP &&
        (current.group_uid ?? ALL_DAY_GROUP) === ALL_DAY_GROUP
    ) {
        delete patch.group_uid;
    }
    if (Object.keys(patch).length) {
        await updateCadenceHabit(uid, patch as HabitPatch);
    }

    if (goalChanged(current.goal, draft)) {
        const goal = buildGoal(draft, current.goal);
        if (choice.apply === 'fix' && current.goal) {
            await updateRow(uid, 'goals', current.goal.uid, goal);
        } else {
            await createRow(uid, 'goals', {
                ...goal,
                effective_from: choice.from,
            });
        }
    }
    if (scheduleChanged(current.schedule, draft)) {
        const schedule = buildSchedule(draft);
        if (choice.apply === 'fix' && current.schedule) {
            await updateRow(uid, 'schedules', current.schedule.uid, schedule);
        } else {
            await createRow(uid, 'schedules', {
                ...schedule,
                effective_from: choice.from,
            });
        }
    }

    await syncQuickValues(current, draft);
    await syncReminders(current, draft);
}

async function syncQuickValues(current: CadenceHabitDetail, draft: HabitDraft) {
    if (!hasQuickValues(draft)) return;
    const desired = desiredQuickValues(draft);
    const existing = current.quick_values;
    for (const row of existing) {
        if (!desired.includes(row.amount_minor)) {
            await deleteRow(current.uid, 'quick-values', row.uid);
        }
    }
    const kept = new Set(existing.map((row) => row.amount_minor));
    for (const [index, amount] of desired.entries()) {
        if (!kept.has(amount)) {
            await createRow(current.uid, 'quick-values', {
                label: quickLabel(amount, draft),
                amount_minor: amount,
                sort_order: index,
            });
        }
    }
}

async function syncReminders(current: CadenceHabitDetail, draft: HabitDraft) {
    const desired = [...new Set(draft.reminderTimes)];
    for (const row of current.reminders) {
        if (!desired.includes(row.time)) {
            await deleteRow(current.uid, 'reminders', row.uid);
        } else if (row.conditional !== draft.conditionalReminders) {
            await updateRow(current.uid, 'reminders', row.uid, {
                conditional: draft.conditionalReminders,
            });
        }
    }
    const kept = new Set(current.reminders.map((row) => row.time));
    for (const time of desired) {
        if (!kept.has(time)) {
            await createRow(current.uid, 'reminders', {
                time,
                days_of_week: '',
                enabled: true,
                conditional: draft.conditionalReminders,
            });
        }
    }
}
