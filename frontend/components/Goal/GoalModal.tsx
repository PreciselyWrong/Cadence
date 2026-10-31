import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Goal, GoalBucket, GoalHorizon, GoalStatus } from '../../entities/Goal';
import { createGoal, updateGoal } from '../../utils/goalsService';
import { createGoalUrl } from '../../utils/slugUtils';
import { useStore } from '../../store/useStore';
import { useToast } from '../Shared/ToastContext';
import ColorPicker from '../Shared/ColorPicker';
import DatePicker from '../Shared/DatePicker';
import EntitySidePanel from '../SidePanel/EntitySidePanel';
import {
    SidePanelField,
    SidePanelSection,
    sidePanelInputClass,
} from '../SidePanel/SidePanelParts';

interface GoalModalProps {
    isOpen: boolean;
    onClose: () => void;
    goal?: Goal | null;
    onSaved?: (goal: Goal) => void;
    // Opens a new goal already on the bucket list, in that group.
    defaultBucket?: GoalBucket | null;
}

const BUCKETS: GoalBucket[] = ['have', 'be', 'do'];
const BUCKET_FALLBACKS: Record<GoalBucket, string> = {
    have: 'Have',
    be: 'Be',
    do: 'Do',
};
const HORIZONS: GoalHorizon[] = ['month', 'quarter', 'season', 'year'];

const emptyGoal = (bucket: GoalBucket | null = null): Partial<Goal> => ({
    title: '',
    why: '',
    horizon: 'season' as GoalHorizon,
    status: 'active' as GoalStatus,
    target_date: '',
    area_id: null,
    color: '',
    bucket,
    parent_goal_uid: null,
});

const toFormData = (
    goal?: Goal | null,
    defaultBucket: GoalBucket | null = null
): Partial<Goal> =>
    goal
        ? {
              title: goal.title,
              why: goal.why ?? '',
              horizon: goal.horizon,
              status: goal.status,
              target_date: goal.target_date ?? '',
              area_id: goal.area_id ?? null,
              color: goal.color ?? '',
              bucket: goal.bucket ?? null,
              parent_goal_uid: goal.parent_goal_uid ?? null,
          }
        : emptyGoal(defaultBucket);

// Creates a goal, or edits one, in the side panel. A new goal opens its page
// once saved, the same as before the panel existed.
const GoalModal: React.FC<GoalModalProps> = ({
    isOpen,
    onClose,
    goal,
    onSaved,
    defaultBucket = null,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { showSuccessToast, showErrorToast } = useToast();
    const areas = useStore((state: any) => state.areasStore.areas) as any[];
    const loadGoals = useStore((state: any) => state.goalsStore.loadGoals);
    const allGoals = useStore((state: any) => state.goalsStore.goals) as Goal[];

    const [formData, setFormData] = useState<Partial<Goal>>(() =>
        toFormData(goal, defaultBucket)
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setFormData(toFormData(goal, defaultBucket));
        setError(null);
    }, [isOpen, goal, defaultBucket]);

    const isEdit = !!goal?.uid;

    const hasUnsavedChanges = () => {
        if (!isEdit) {
            return !!formData.title?.trim() || !!formData.why?.trim();
        }
        const original = toFormData(goal, defaultBucket);
        return (Object.keys(original) as (keyof Goal)[]).some(
            (key) => (formData[key] ?? '') !== (original[key] ?? '')
        );
    };

    const handleChange = (
        e: React.ChangeEvent<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]:
                name === 'area_id'
                    ? value
                        ? parseInt(value, 10)
                        : null
                    : name === 'bucket' || name === 'parent_goal_uid'
                      ? value || null
                      : value,
        }));
    };

    // Only an objective can take key results, so only top-level goals off
    // the bucket list are offered, and not one that already has some.
    const isBucketGoal = Boolean(formData.bucket);
    const objectives = allGoals.filter(
        (g) => g.uid && g.uid !== goal?.uid && !g.parent_goal_uid && !g.bucket
    );
    const canBeKeyResult =
        !isBucketGoal &&
        objectives.length > 0 &&
        !(goal?.key_results_count && goal.key_results_count > 0);

    const handleSubmit = async () => {
        if (!formData.title?.trim()) {
            setError(t('errors.goalTitleRequired', 'Goal title is required'));
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            const payload = {
                ...formData,
                target_date: isBucketGoal ? null : formData.target_date || null,
                area_id: formData.area_id || null,
                bucket: formData.bucket || null,
                parent_goal_uid: isBucketGoal
                    ? null
                    : formData.parent_goal_uid || null,
            };
            if (isEdit) {
                const result = await updateGoal(goal!.uid!, payload);
                onSaved?.(result.goal);
                loadGoals(true);
                showSuccessToast(t('success.goalUpdated', 'Goal updated!'));
                onClose();
            } else {
                const result = await createGoal(payload as any);
                const current = useStore.getState().goalsStore.goals;
                useStore
                    .getState()
                    .goalsStore.setGoals([...current, result.goal]);
                showSuccessToast(t('success.goalCreated', 'Goal created!'));
                onClose();
                navigate(
                    createGoalUrl({
                        uid: result.goal.uid!,
                        title: result.goal.title,
                    })
                );
            }
        } catch (err) {
            setError((err as Error).message);
            showErrorToast(
                t('errors.failedToSaveGoal', 'Failed to save goal.')
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <EntitySidePanel
            isOpen={isOpen}
            onClose={onClose}
            eyebrow={t('goals.singular', 'Goal')}
            title={
                isEdit
                    ? formData.title || t('goals.editGoal', 'Edit Goal')
                    : t('goals.newGoal', 'New Goal')
            }
            submitLabel={
                isEdit
                    ? t('modals.updateGoal', 'Update Goal')
                    : t('modals.createGoal', 'Create Goal')
            }
            submitTestId="goal-save-button"
            isSubmitting={isSubmitting}
            isDirty={hasUnsavedChanges()}
            error={error}
            onSubmit={handleSubmit}
            testId="goal-panel"
        >
            <SidePanelField
                label={t('forms.goalTitle', 'Outcome')}
                htmlFor="goalTitle"
            >
                <input
                    id="goalTitle"
                    type="text"
                    name="title"
                    value={formData.title ?? ''}
                    onChange={handleChange}
                    required
                    className={sidePanelInputClass}
                    placeholder={t('forms.goalTitlePlaceholder', 'Goal title')}
                    data-testid="goal-title-input"
                />
            </SidePanelField>

            <SidePanelField label={t('forms.goalWhy', 'Why')} htmlFor="goalWhy">
                <textarea
                    id="goalWhy"
                    name="why"
                    value={formData.why ?? ''}
                    onChange={handleChange}
                    rows={3}
                    className={`${sidePanelInputClass} resize-none`}
                    placeholder={t(
                        'forms.goalWhyPlaceholder',
                        'What will achieving this enable?'
                    )}
                />
            </SidePanelField>

            {isBucketGoal && (
                <SidePanelField
                    label={t('forms.goalBucket', 'Bucket list group')}
                    htmlFor="goalBucket"
                >
                    <select
                        id="goalBucket"
                        aria-label={t('forms.goalBucket', 'Bucket list group')}
                        name="bucket"
                        value={formData.bucket ?? ''}
                        onChange={handleChange}
                        className={sidePanelInputClass}
                    >
                        <option value="">
                            {t('goals.bucket.none', 'Not on the bucket list')}
                        </option>
                        {BUCKETS.map((bucket) => (
                            <option key={bucket} value={bucket}>
                                {t(
                                    `goals.bucket.${bucket}`,
                                    BUCKET_FALLBACKS[bucket]
                                )}
                            </option>
                        ))}
                    </select>
                </SidePanelField>
            )}

            <SidePanelSection
                title={
                    isBucketGoal
                        ? t('forms.goalStatus', 'Status')
                        : t('forms.goalHorizon', 'Horizon')
                }
            >
                <div className="grid grid-cols-2 gap-3">
                    {!isBucketGoal && (
                        <select
                            aria-label={t('forms.goalHorizon', 'Horizon')}
                            name="horizon"
                            value={formData.horizon ?? 'season'}
                            onChange={handleChange}
                            className={sidePanelInputClass}
                        >
                            {HORIZONS.map((horizon) => (
                                <option key={horizon} value={horizon}>
                                    {t(`goals.horizon.${horizon}`, horizon)}
                                </option>
                            ))}
                        </select>
                    )}
                    <select
                        aria-label={t('forms.goalStatus', 'Status')}
                        name="status"
                        value={formData.status ?? 'active'}
                        onChange={handleChange}
                        className={sidePanelInputClass}
                    >
                        <option value="active">
                            {t('goals.status.active', 'Active')}
                        </option>
                        <option value="achieved">
                            {t('goals.status.achieved', 'Achieved')}
                        </option>
                        <option value="paused">
                            {t('goals.status.paused', 'Paused')}
                        </option>
                        <option value="dropped">
                            {t('goals.status.dropped', 'Dropped')}
                        </option>
                    </select>
                </div>
            </SidePanelSection>

            {!isBucketGoal && (
                <SidePanelField
                    label={t('forms.goalTargetDate', 'Target Date')}
                    htmlFor="goalTargetDate"
                >
                    <DatePicker
                        value={formData.target_date ?? ''}
                        onChange={(value) =>
                            setFormData((prev) => ({
                                ...prev,
                                target_date: value,
                            }))
                        }
                        placeholder={t('forms.goalTargetDate', 'Target Date')}
                    />
                </SidePanelField>
            )}

            {canBeKeyResult && (
                <SidePanelField
                    label={`${t('forms.goalParent', 'Key result of')} (${t('common.optional', 'optional')})`}
                    htmlFor="goalParent"
                >
                    <select
                        id="goalParent"
                        aria-label={t('forms.goalParent', 'Key result of')}
                        name="parent_goal_uid"
                        value={formData.parent_goal_uid ?? ''}
                        onChange={handleChange}
                        className={sidePanelInputClass}
                    >
                        <option value="">
                            {t('forms.noParentGoal', 'None (stands alone)')}
                        </option>
                        {objectives.map((objective) => (
                            <option key={objective.uid} value={objective.uid}>
                                {objective.title}
                            </option>
                        ))}
                    </select>
                </SidePanelField>
            )}

            <SidePanelField
                label={`${t('forms.goalArea', 'Area')} (${t('common.optional', 'optional')})`}
                htmlFor="goalArea"
            >
                <select
                    id="goalArea"
                    name="area_id"
                    value={formData.area_id ?? ''}
                    onChange={handleChange}
                    className={sidePanelInputClass}
                >
                    <option value="">{t('forms.noArea', 'No area')}</option>
                    {areas.map((area: any) => (
                        <option key={area.id} value={area.id}>
                            {area.name}
                        </option>
                    ))}
                </select>
            </SidePanelField>

            <SidePanelSection title={t('forms.color', 'Color')}>
                <ColorPicker
                    value={formData.color || ''}
                    onChange={(color) =>
                        setFormData((prev) => ({ ...prev, color: color || '' }))
                    }
                />
            </SidePanelSection>
        </EntitySidePanel>
    );
};

export default GoalModal;
