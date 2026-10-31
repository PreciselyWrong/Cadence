import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import EntitySidePanel from '../SidePanel/EntitySidePanel';
import {
    SidePanelField,
    SidePanelSection,
    sidePanelInputClass,
} from '../SidePanel/SidePanelParts';
import ColorPicker from '../Shared/ColorPicker';
import type {
    CadenceGroup,
    CadenceHabitDetail,
    DayName,
    GoalType,
    Period,
    ScheduleMode,
} from '../../utils/cadenceHabitsService';
import {
    ABSTINENCE_PROFILES,
    DAY_NAMES,
    HabitDraft,
    HabitKind,
    dayLabel,
    draftFromHabit,
    emptyDraft,
    unitsFor,
    validateDraft,
} from '../../utils/cadenceHabitUtils';
import {
    createFromDraft,
    goalChanged,
    scheduleChanged,
    updateFromDraft,
} from '../../utils/cadenceHabitSave';

interface HabitEditorProps {
    isOpen: boolean;
    onClose: () => void;
    groups: CadenceGroup[];
    // Absent to create a habit, the habit to edit otherwise
    habit?: CadenceHabitDetail | null;
    today: string;
    onSaved: (uid: string) => void;
}

const field = `${sidePanelInputClass} min-h-[44px]`;

interface ChoiceProps<T extends string> {
    legend: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}

// A row of exclusive choices, read as one radio group.
function Choice<T extends string>({
    legend,
    value,
    options,
    onChange,
}: ChoiceProps<T>) {
    return (
        <div
            role="radiogroup"
            aria-label={legend}
            className="flex flex-wrap gap-2"
        >
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(option.value)}
                        className={`min-h-[44px] rounded-full px-4 text-label transition-colors duration-[220ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${
                            selected
                                ? 'bg-primary text-primary-on'
                                : 'border border-outline/35 bg-surface-variant/60 text-surface-on dark:bg-surface-variant/35'
                        }`}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

const HabitEditor: React.FC<HabitEditorProps> = ({
    isOpen,
    onClose,
    groups,
    habit,
    today,
    onSaved,
}) => {
    const { t, i18n } = useTranslation();
    const editing = !!habit;
    const [draft, setDraft] = useState<HabitDraft>(emptyDraft());
    const [initial, setInitial] = useState<HabitDraft>(emptyDraft());
    const [apply, setApply] = useState<'new' | 'fix'>('new');
    const [from, setFrom] = useState(today);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [invalid, setInvalid] = useState<string[]>([]);

    useEffect(() => {
        if (!isOpen) return;
        const start = habit ? draftFromHabit(habit) : emptyDraft();
        setDraft(start);
        setInitial(start);
        setApply('new');
        setFrom(today);
        setError(null);
        setInvalid([]);
    }, [isOpen, habit, today]);

    const set = (patch: Partial<HabitDraft>) =>
        setDraft((current) => ({ ...current, ...patch }));

    const setKind = (kind: HabitKind) => {
        setDraft((current) => {
            const next = { ...current, kind };
            if (kind !== 'goal' && current.goalType === 'BINARY') {
                next.goalType = 'COUNT';
                next.unitId = 'count';
            }
            if (kind === 'tracker' || kind === 'abstinence') {
                next.period = 'DAY';
                next.scheduleMode = 'EVERY_DAY';
            }
            if (kind === 'abstinence' && current.abstinenceProfile === 'NONE') {
                next.abstinenceProfile = 'CUSTOM';
            }
            return next;
        });
    };

    const setGoalType = (goalType: GoalType) => {
        const units = unitsFor(goalType);
        set({
            goalType,
            unitId: units.some((u) => u.id === draft.unitId)
                ? draft.unitId
                : draft.unitId === 'custom' && goalType !== 'DURATION'
                  ? 'custom'
                  : (units[0]?.id ?? 'count'),
        });
    };

    const hasGoalFields = draft.kind !== 'abstinence';
    const measurable = draft.kind !== 'goal' || draft.goalType !== 'BINARY';
    const language = i18n?.language ?? 'en';
    const changedGoal =
        editing && habit ? goalChanged(habit.goal, draft) : false;
    const changedSchedule =
        editing && habit ? scheduleChanged(habit.schedule, draft) : false;
    const versioned = changedGoal || changedSchedule;
    const isDirty = useMemo(
        () => JSON.stringify(draft) !== JSON.stringify(initial),
        [draft, initial]
    );

    const goalTypes: { value: GoalType; label: string }[] = [
        ...(draft.kind === 'goal'
            ? [
                  {
                      value: 'BINARY' as const,
                      label: t('cadenceHabits.goalType.binary', 'Done or not'),
                  },
              ]
            : []),
        { value: 'COUNT', label: t('cadenceHabits.goalType.count', 'Count') },
        {
            value: 'QUANTITY',
            label: t('cadenceHabits.goalType.quantity', 'Quantity'),
        },
        {
            value: 'DURATION',
            label: t('cadenceHabits.goalType.duration', 'Duration'),
        },
    ];

    const unitLabel = (id: string, fallback: string) =>
        t(`cadenceHabits.units.${id}`, fallback);
    const unitOptions = unitsFor(
        draft.goalType === 'BINARY' ? 'COUNT' : draft.goalType
    );

    const periodLabels: Record<Period, string> = {
        DAY: t('cadenceHabits.period.day', 'Per day'),
        WEEK: t('cadenceHabits.period.week', 'Per week'),
        MONTH: t('cadenceHabits.period.month', 'Per month'),
    };
    const modeLabels: Record<ScheduleMode, string> = {
        EVERY_DAY: t('cadenceHabits.schedule.everyDay', 'Every day'),
        SELECTED_DAYS: t(
            'cadenceHabits.schedule.selectedDays',
            'Selected days'
        ),
        FLEXIBLE_PERIOD: t(
            'cadenceHabits.schedule.flexible',
            'Any day of the period'
        ),
        INTERVAL_DAYS: t('cadenceHabits.schedule.interval', 'Every N days'),
    };

    const errorText = (key: string): string | null => {
        if (!invalid.includes(key)) return null;
        const messages: Record<string, string> = {
            name: t('cadenceHabits.errors.name', 'Give the habit a name.'),
            target: t(
                'cadenceHabits.errors.target',
                'The target must be greater than zero.'
            ),
            minimum: t(
                'cadenceHabits.errors.minimum',
                'The minimum must be greater than zero and at most the ideal.'
            ),
            frequency: t(
                'cadenceHabits.errors.frequency',
                'Sessions must be a whole number above zero.'
            ),
            customUnit: t(
                'cadenceHabits.errors.customUnit',
                'Name the unit and give its symbol.'
            ),
            activeDays: t(
                'cadenceHabits.errors.activeDays',
                'Pick at least one day.'
            ),
            intervalDays: t(
                'cadenceHabits.errors.intervalDays',
                'The interval is at least 2 days.'
            ),
            reminderTimes: t(
                'cadenceHabits.errors.reminderTimes',
                'A reminder needs a time.'
            ),
        };
        return messages[key] ?? null;
    };

    const submit = async () => {
        const problems = validateDraft(draft);
        setInvalid(problems);
        if (problems.length) {
            setError(
                t('cadenceHabits.errors.fix', 'Check the highlighted fields.')
            );
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            if (editing && habit) {
                await updateFromDraft(habit, draft, { apply, from });
                onSaved(habit.uid);
            } else {
                const created = await createFromDraft(draft);
                onSaved(created.uid);
            }
        } catch (caught) {
            const code =
                caught instanceof Error ? caught.message : String(caught);
            setError(
                t(
                    'cadenceHabits.errors.save',
                    'Could not save the habit ({{code}}).',
                    {
                        code,
                    }
                )
            );
        } finally {
            setSubmitting(false);
        }
    };

    const toggleDay = (day: DayName) =>
        set({
            activeDays: draft.activeDays.includes(day)
                ? draft.activeDays.filter((d) => d !== day)
                : DAY_NAMES.filter(
                      (d) => d === day || draft.activeDays.includes(d)
                  ),
        });

    return (
        <EntitySidePanel
            isOpen={isOpen}
            onClose={onClose}
            title={
                editing
                    ? t('cadenceHabits.editor.editTitle', 'Edit habit')
                    : t('cadenceHabits.editor.newTitle', 'New habit')
            }
            submitLabel={
                editing
                    ? t('common.save', 'Save')
                    : t('cadenceHabits.editor.create', 'Create habit')
            }
            submitTestId="habit-editor-submit"
            testId="habit-editor"
            isSubmitting={submitting}
            isDirty={isDirty}
            error={error}
            onSubmit={submit}
        >
            <SidePanelSection title={t('cadenceHabits.editor.about', 'Habit')}>
                <SidePanelField
                    label={t('cadenceHabits.editor.name', 'Name')}
                    htmlFor="habit-name"
                    error={errorText('name')}
                >
                    <input
                        id="habit-name"
                        type="text"
                        value={draft.name}
                        maxLength={255}
                        onChange={(event) => set({ name: event.target.value })}
                        aria-invalid={invalid.includes('name')}
                        className={field}
                    />
                </SidePanelField>
                <SidePanelField
                    label={t('cadenceHabits.editor.description', 'Description')}
                    htmlFor="habit-description"
                >
                    <textarea
                        id="habit-description"
                        rows={2}
                        value={draft.description}
                        onChange={(event) =>
                            set({ description: event.target.value })
                        }
                        className={sidePanelInputClass}
                    />
                </SidePanelField>
                <SidePanelField
                    label={t('cadenceHabits.editor.color', 'Colour')}
                >
                    <ColorPicker
                        large
                        value={draft.colorHex}
                        onChange={(colorHex) => set({ colorHex })}
                        noneLabel={t(
                            'cadenceHabits.editor.accentColor',
                            'App accent'
                        )}
                    />
                </SidePanelField>
                <SidePanelField
                    label={t('cadenceHabits.editor.group', 'Time of day')}
                    htmlFor="habit-group"
                >
                    <select
                        id="habit-group"
                        value={draft.groupUid}
                        onChange={(event) =>
                            set({ groupUid: event.target.value })
                        }
                        className={field}
                    >
                        {groups.map((group) => (
                            <option key={group.uid} value={group.uid}>
                                {group.name}
                            </option>
                        ))}
                    </select>
                </SidePanelField>
            </SidePanelSection>

            <SidePanelSection title={t('cadenceHabits.editor.kind', 'Kind')}>
                <Choice
                    legend={t('cadenceHabits.editor.kind', 'Kind')}
                    value={draft.kind}
                    onChange={setKind}
                    options={[
                        {
                            value: 'goal',
                            label: t('cadenceHabits.kind.goal', 'Goal'),
                        },
                        {
                            value: 'limit',
                            label: t('cadenceHabits.kind.limit', 'Limit'),
                        },
                        {
                            value: 'tracker',
                            label: t(
                                'cadenceHabits.kind.tracker',
                                'Free activity'
                            ),
                        },
                        {
                            value: 'abstinence',
                            label: t(
                                'cadenceHabits.kind.abstinence',
                                'Abstinence'
                            ),
                        },
                    ]}
                />
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {
                        {
                            goal: t(
                                'cadenceHabits.kind.goalHint',
                                'Reach a target each period.'
                            ),
                            limit: t(
                                'cadenceHabits.kind.limitHint',
                                'Stay at or under a maximum. Staying under is a success.'
                            ),
                            tracker: t(
                                'cadenceHabits.kind.trackerHint',
                                'Note an activity without a target.'
                            ),
                            abstinence: t(
                                'cadenceHabits.kind.abstinenceHint',
                                'Count the days without. Each slip you note restarts the count.'
                            ),
                        }[draft.kind]
                    }
                </p>
                {draft.kind === 'abstinence' && (
                    <SidePanelField
                        label={t('cadenceHabits.editor.profile', 'About')}
                        htmlFor="habit-profile"
                    >
                        <select
                            id="habit-profile"
                            value={draft.abstinenceProfile}
                            onChange={(event) =>
                                set({ abstinenceProfile: event.target.value })
                            }
                            className={field}
                        >
                            {ABSTINENCE_PROFILES.map((profile) => (
                                <option key={profile} value={profile}>
                                    {t(
                                        `cadenceHabits.profile.${profile}`,
                                        profile
                                    )}
                                </option>
                            ))}
                        </select>
                    </SidePanelField>
                )}
            </SidePanelSection>

            {hasGoalFields && (
                <SidePanelSection
                    title={
                        draft.kind === 'limit'
                            ? t('cadenceHabits.editor.limit', 'Limit')
                            : draft.kind === 'tracker'
                              ? t('cadenceHabits.editor.measure', 'Measure')
                              : t('cadenceHabits.editor.goal', 'Goal')
                    }
                >
                    <Choice
                        legend={t(
                            'cadenceHabits.editor.measureBy',
                            'Measured by'
                        )}
                        value={
                            draft.goalType === 'BINARY' && draft.kind !== 'goal'
                                ? 'COUNT'
                                : draft.goalType
                        }
                        onChange={setGoalType}
                        options={goalTypes}
                    />
                    {draft.goalType !== 'BINARY' && (
                        <>
                            <SidePanelField
                                label={t('cadenceHabits.editor.unit', 'Unit')}
                                htmlFor="habit-unit"
                                error={errorText('customUnit')}
                            >
                                <select
                                    id="habit-unit"
                                    value={draft.unitId}
                                    onChange={(event) =>
                                        set({ unitId: event.target.value })
                                    }
                                    className={field}
                                >
                                    {unitOptions.map((unit) => (
                                        <option key={unit.id} value={unit.id}>
                                            {unitLabel(unit.id, unit.nameFr)}
                                        </option>
                                    ))}
                                    {draft.goalType !== 'DURATION' && (
                                        <option value="custom">
                                            {t(
                                                'cadenceHabits.units.custom',
                                                'Custom unit'
                                            )}
                                        </option>
                                    )}
                                </select>
                            </SidePanelField>
                            {draft.unitId === 'custom' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <SidePanelField
                                        label={t(
                                            'cadenceHabits.editor.unitName',
                                            'Unit name'
                                        )}
                                        htmlFor="habit-unit-name"
                                    >
                                        <input
                                            id="habit-unit-name"
                                            type="text"
                                            value={draft.customName}
                                            onChange={(event) =>
                                                set({
                                                    customName:
                                                        event.target.value,
                                                })
                                            }
                                            className={field}
                                        />
                                    </SidePanelField>
                                    <SidePanelField
                                        label={t(
                                            'cadenceHabits.editor.unitSymbol',
                                            'Symbol'
                                        )}
                                        htmlFor="habit-unit-symbol"
                                    >
                                        <input
                                            id="habit-unit-symbol"
                                            type="text"
                                            value={draft.customSymbol}
                                            onChange={(event) =>
                                                set({
                                                    customSymbol:
                                                        event.target.value,
                                                })
                                            }
                                            className={field}
                                        />
                                    </SidePanelField>
                                </div>
                            )}
                        </>
                    )}
                    {draft.kind !== 'tracker' && measurable && (
                        <SidePanelField
                            label={
                                draft.kind === 'limit'
                                    ? t(
                                          'cadenceHabits.editor.maximum',
                                          'Maximum per period'
                                      )
                                    : t(
                                          'cadenceHabits.editor.ideal',
                                          'Ideal (target)'
                                      )
                            }
                            htmlFor="habit-target"
                            error={errorText('target')}
                        >
                            <input
                                id="habit-target"
                                type="text"
                                inputMode="decimal"
                                value={draft.target}
                                onChange={(event) =>
                                    set({ target: event.target.value })
                                }
                                aria-invalid={invalid.includes('target')}
                                className={field}
                            />
                        </SidePanelField>
                    )}
                    {draft.kind !== 'tracker' && (
                        <SidePanelField
                            label={t('cadenceHabits.editor.period', 'Period')}
                            htmlFor="habit-period"
                        >
                            <select
                                id="habit-period"
                                value={draft.period}
                                onChange={(event) =>
                                    set({
                                        period: event.target.value as Period,
                                    })
                                }
                                className={field}
                            >
                                {(['DAY', 'WEEK', 'MONTH'] as Period[]).map(
                                    (period) => (
                                        <option key={period} value={period}>
                                            {periodLabels[period]}
                                        </option>
                                    )
                                )}
                            </select>
                        </SidePanelField>
                    )}
                    {draft.kind === 'goal' && measurable && (
                        <>
                            <SidePanelField
                                label={t(
                                    'cadenceHabits.editor.minimum',
                                    'Minimum that counts (optional)'
                                )}
                                htmlFor="habit-minimum"
                                error={errorText('minimum')}
                            >
                                <input
                                    id="habit-minimum"
                                    type="text"
                                    inputMode="decimal"
                                    value={draft.minimum}
                                    onChange={(event) =>
                                        set({ minimum: event.target.value })
                                    }
                                    aria-invalid={invalid.includes('minimum')}
                                    className={field}
                                />
                            </SidePanelField>
                            <SidePanelField
                                label={t(
                                    'cadenceHabits.editor.frequency',
                                    'Sessions per period (optional)'
                                )}
                                htmlFor="habit-frequency"
                                error={errorText('frequency')}
                            >
                                <input
                                    id="habit-frequency"
                                    type="text"
                                    inputMode="numeric"
                                    value={draft.frequencyTarget}
                                    onChange={(event) =>
                                        set({
                                            frequencyTarget: event.target.value,
                                        })
                                    }
                                    className={field}
                                />
                            </SidePanelField>
                        </>
                    )}
                    {draft.kind === 'goal' && draft.goalType === 'DURATION' && (
                        <label className="flex min-h-[44px] items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                            <input
                                type="checkbox"
                                checked={draft.timerEnabled}
                                onChange={(event) =>
                                    set({ timerEnabled: event.target.checked })
                                }
                                className="h-5 w-5"
                            />
                            {t(
                                'cadenceHabits.editor.timer',
                                'Offer a timer for this habit'
                            )}
                        </label>
                    )}
                </SidePanelSection>
            )}

            {(draft.kind === 'goal' || draft.kind === 'limit') && (
                <SidePanelSection
                    title={t('cadenceHabits.editor.rhythm', 'Schedule')}
                >
                    <SidePanelField
                        label={t('cadenceHabits.editor.scheduleMode', 'Days')}
                        htmlFor="habit-schedule"
                    >
                        <select
                            id="habit-schedule"
                            value={draft.scheduleMode}
                            onChange={(event) =>
                                set({
                                    scheduleMode: event.target
                                        .value as ScheduleMode,
                                })
                            }
                            className={field}
                        >
                            {(Object.keys(modeLabels) as ScheduleMode[]).map(
                                (mode) => (
                                    <option key={mode} value={mode}>
                                        {modeLabels[mode]}
                                    </option>
                                )
                            )}
                        </select>
                    </SidePanelField>
                    {draft.scheduleMode === 'SELECTED_DAYS' && (
                        <div>
                            <div
                                role="group"
                                aria-label={t(
                                    'cadenceHabits.editor.activeDays',
                                    'Active days'
                                )}
                                className="flex flex-wrap gap-2"
                            >
                                {DAY_NAMES.map((day) => {
                                    const on = draft.activeDays.includes(day);
                                    return (
                                        <button
                                            key={day}
                                            type="button"
                                            aria-pressed={on}
                                            aria-label={dayLabel(
                                                day,
                                                language,
                                                'long'
                                            )}
                                            onClick={() => toggleDay(day)}
                                            className={`h-11 min-w-[44px] rounded-full px-3 text-label focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${
                                                on
                                                    ? 'bg-primary text-primary-on'
                                                    : 'border border-outline/35 bg-surface-variant/60 text-surface-on dark:bg-surface-variant/35'
                                            }`}
                                        >
                                            {dayLabel(day, language)}
                                        </button>
                                    );
                                })}
                            </div>
                            {errorText('activeDays') && (
                                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                                    {errorText('activeDays')}
                                </p>
                            )}
                        </div>
                    )}
                    {draft.scheduleMode === 'INTERVAL_DAYS' && (
                        <SidePanelField
                            label={t(
                                'cadenceHabits.editor.intervalDays',
                                'Every how many days'
                            )}
                            htmlFor="habit-interval"
                            error={errorText('intervalDays')}
                        >
                            <input
                                id="habit-interval"
                                type="number"
                                min={2}
                                value={draft.intervalDays}
                                onChange={(event) =>
                                    set({ intervalDays: event.target.value })
                                }
                                className={field}
                            />
                        </SidePanelField>
                    )}
                    {(draft.period !== 'DAY' ||
                        draft.scheduleMode === 'FLEXIBLE_PERIOD') && (
                        <SidePanelField
                            label={t(
                                'cadenceHabits.editor.firstDay',
                                'First day of the week'
                            )}
                            htmlFor="habit-first-day"
                        >
                            <select
                                id="habit-first-day"
                                value={draft.firstDay}
                                onChange={(event) =>
                                    set({
                                        firstDay: event.target.value as DayName,
                                    })
                                }
                                className={field}
                            >
                                {DAY_NAMES.map((day) => (
                                    <option key={day} value={day}>
                                        {dayLabel(day, language, 'long')}
                                    </option>
                                ))}
                            </select>
                        </SidePanelField>
                    )}
                </SidePanelSection>
            )}

            {draft.kind !== 'abstinence' && measurable && (
                <SidePanelSection
                    title={t('cadenceHabits.editor.quickTitle', 'Quick entry')}
                >
                    <SidePanelField
                        label={t(
                            'cadenceHabits.editor.quickValues',
                            'Quick buttons (amounts, separated by spaces)'
                        )}
                        htmlFor="habit-quick"
                    >
                        <input
                            id="habit-quick"
                            type="text"
                            value={draft.quickValues}
                            placeholder="10 20 30"
                            onChange={(event) =>
                                set({ quickValues: event.target.value })
                            }
                            className={field}
                        />
                    </SidePanelField>
                </SidePanelSection>
            )}

            <SidePanelSection
                title={t('cadenceHabits.editor.reminders', 'Reminders')}
            >
                {draft.reminderTimes.map((time, index) => (
                    <div key={index} className="flex items-center gap-2">
                        <input
                            type="time"
                            aria-label={t(
                                'cadenceHabits.editor.reminderTime',
                                'Reminder {{number}}',
                                { number: index + 1 }
                            )}
                            value={time}
                            onChange={(event) =>
                                set({
                                    reminderTimes: draft.reminderTimes.map(
                                        (value, i) =>
                                            i === index
                                                ? event.target.value
                                                : value
                                    ),
                                })
                            }
                            className={field}
                        />
                        <button
                            type="button"
                            onClick={() =>
                                set({
                                    reminderTimes: draft.reminderTimes.filter(
                                        (_, i) => i !== index
                                    ),
                                })
                            }
                            className="min-h-[44px] rounded-md px-3 text-sm text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                            {t('cadenceHabits.editor.removeReminder', 'Remove')}
                        </button>
                    </div>
                ))}
                {errorText('reminderTimes') && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                        {errorText('reminderTimes')}
                    </p>
                )}
                <button
                    type="button"
                    onClick={() =>
                        set({
                            reminderTimes: [...draft.reminderTimes, '09:00'],
                        })
                    }
                    className="min-h-[44px] rounded-md px-3 text-sm font-medium text-primary hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-gray-700"
                >
                    {t('cadenceHabits.editor.addReminder', 'Add a reminder')}
                </button>
                {draft.reminderTimes.length > 0 && (
                    <label className="flex min-h-[44px] items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                        <input
                            type="checkbox"
                            checked={draft.conditionalReminders}
                            onChange={(event) =>
                                set({
                                    conditionalReminders: event.target.checked,
                                })
                            }
                            className="h-5 w-5"
                        />
                        {t(
                            'cadenceHabits.editor.conditional',
                            'Only remind me while the period is not met'
                        )}
                    </label>
                )}
            </SidePanelSection>

            {editing && versioned && (
                <SidePanelSection
                    title={t(
                        'cadenceHabits.editor.applyTitle',
                        'Apply the change'
                    )}
                >
                    <Choice<'new' | 'fix'>
                        legend={t(
                            'cadenceHabits.editor.applyTitle',
                            'Apply the change'
                        )}
                        value={apply}
                        onChange={setApply}
                        options={[
                            {
                                value: 'new',
                                label: t(
                                    'cadenceHabits.editor.applyNew',
                                    'From a date (new version)'
                                ),
                            },
                            {
                                value: 'fix',
                                label: t(
                                    'cadenceHabits.editor.applyFix',
                                    'Correct the current version'
                                ),
                            },
                        ]}
                    />
                    {apply === 'new' ? (
                        <SidePanelField
                            label={t(
                                'cadenceHabits.editor.applyFrom',
                                'Applies from'
                            )}
                            htmlFor="habit-apply-from"
                        >
                            <input
                                id="habit-apply-from"
                                type="date"
                                value={from}
                                onChange={(event) =>
                                    setFrom(event.target.value)
                                }
                                className={field}
                            />
                        </SidePanelField>
                    ) : null}
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {apply === 'new'
                            ? t(
                                  'cadenceHabits.editor.applyNewHint',
                                  'Earlier days keep the goal they were lived with.'
                              )
                            : t(
                                  'cadenceHabits.editor.applyFixHint',
                                  'Rewrites the version in force, past days included. Use it to fix a mistake.'
                              )}
                    </p>
                </SidePanelSection>
            )}
        </EntitySidePanel>
    );
};

export default HabitEditor;
