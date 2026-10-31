import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import EntitySidePanel from '../SidePanel/EntitySidePanel';
import {
    SidePanelField,
    sidePanelInputClass,
} from '../SidePanel/SidePanelParts';
import {
    CadenceHabit,
    PauseReason,
    createRow,
} from '../../utils/cadenceHabitsService';
import { addDays } from '../../utils/cadenceHabitUtils';

interface PauseEditorProps {
    isOpen: boolean;
    onClose: () => void;
    // The habits that can be paused together (a trip stops several at once)
    habits: CadenceHabit[];
    preselected: string[];
    today: string;
    onSaved: () => void;
}

const field = `${sidePanelInputClass} min-h-[44px]`;
const REASONS: Exclude<PauseReason, 'MANUAL'>[] = [
    'TRAVEL',
    'ILLNESS',
    'REST',
    'CUSTOM',
];

// A pause or a trip: the chosen habits stop counting from a day, until a last
// day or until it is ended by hand.
const PauseEditor: React.FC<PauseEditorProps> = ({
    isOpen,
    onClose,
    habits,
    preselected,
    today,
    onSaved,
}) => {
    const { t } = useTranslation();
    const preselectedKey = preselected.join('|');
    const [chosen, setChosen] = useState<string[]>(preselected);
    const [start, setStart] = useState(today);
    const [open, setOpen] = useState(true);
    const [lastDay, setLastDay] = useState(today);
    const [reason, setReason] = useState<PauseReason>('TRAVEL');
    const [label, setLabel] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setChosen(preselectedKey ? preselectedKey.split('|') : []);
        setStart(today);
        setOpen(true);
        setLastDay(today);
        setReason('TRAVEL');
        setLabel('');
        setError(null);
    }, [isOpen, preselectedKey, today]);

    const reasonLabels: Record<string, string> = {
        TRAVEL: t('cadenceHabits.pause.travel', 'Trip'),
        ILLNESS: t('cadenceHabits.pause.illness', 'Illness'),
        REST: t('cadenceHabits.pause.rest', 'Rest'),
        CUSTOM: t('cadenceHabits.pause.custom', 'Other reason'),
    };

    const submit = async () => {
        if (!chosen.length) {
            setError(
                t(
                    'cadenceHabits.errors.pauseHabits',
                    'Pick at least one habit.'
                )
            );
            return;
        }
        if (!open && lastDay < start) {
            setError(
                t(
                    'cadenceHabits.errors.pauseEnd',
                    'The last day cannot come before the first.'
                )
            );
            return;
        }
        if (reason === 'CUSTOM' && !label.trim()) {
            setError(
                t(
                    'cadenceHabits.errors.pauseLabel',
                    'Say what the pause is for.'
                )
            );
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const body = {
                start,
                end_exclusive: open ? null : addDays(lastDay, 1),
                reason,
                reason_label: reason === 'CUSTOM' ? label.trim() : null,
            };
            await Promise.all(
                chosen.map((uid) => createRow(uid, 'pauses', body))
            );
            onSaved();
        } catch (caught) {
            setError(
                t(
                    'cadenceHabits.errors.savePause',
                    'Could not save the pause ({{code}}).',
                    {
                        code:
                            caught instanceof Error
                                ? caught.message
                                : String(caught),
                    }
                )
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <EntitySidePanel
            isOpen={isOpen}
            onClose={onClose}
            title={t('cadenceHabits.pause.title', 'Pause or trip')}
            submitLabel={t('cadenceHabits.pause.create', 'Pause')}
            submitTestId="pause-editor-submit"
            testId="pause-editor"
            isSubmitting={submitting}
            isDirty={false}
            error={error}
            onSubmit={submit}
        >
            <p className="text-sm text-gray-600 dark:text-gray-300">
                {t(
                    'cadenceHabits.pause.hint',
                    'Paused days are not counted as missed and do not break the streak.'
                )}
            </p>
            {habits.length > 1 && (
                <fieldset className="space-y-1">
                    <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('cadenceHabits.pause.habits', 'Habits')}
                    </legend>
                    {habits.map((habit) => (
                        <label
                            key={habit.uid}
                            className="flex min-h-[44px] items-center gap-3 text-sm text-gray-800 dark:text-gray-200"
                        >
                            <input
                                type="checkbox"
                                className="h-5 w-5"
                                checked={chosen.includes(habit.uid)}
                                onChange={(event) =>
                                    setChosen(
                                        event.target.checked
                                            ? [...chosen, habit.uid]
                                            : chosen.filter(
                                                  (uid) => uid !== habit.uid
                                              )
                                    )
                                }
                            />
                            {habit.name}
                        </label>
                    ))}
                </fieldset>
            )}
            <SidePanelField
                label={t('cadenceHabits.pause.reason', 'Reason')}
                htmlFor="pause-reason"
            >
                <select
                    id="pause-reason"
                    value={reason}
                    onChange={(event) =>
                        setReason(event.target.value as PauseReason)
                    }
                    className={field}
                >
                    {REASONS.map((value) => (
                        <option key={value} value={value}>
                            {reasonLabels[value]}
                        </option>
                    ))}
                </select>
            </SidePanelField>
            {reason === 'CUSTOM' && (
                <SidePanelField
                    label={t(
                        'cadenceHabits.pause.label',
                        'Reason (your words)'
                    )}
                    htmlFor="pause-label"
                >
                    <input
                        id="pause-label"
                        type="text"
                        maxLength={255}
                        value={label}
                        onChange={(event) => setLabel(event.target.value)}
                        className={field}
                    />
                </SidePanelField>
            )}
            <SidePanelField
                label={t('cadenceHabits.pause.start', 'First day')}
                htmlFor="pause-start"
            >
                <input
                    id="pause-start"
                    type="date"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                    className={field}
                />
            </SidePanelField>
            <label className="flex min-h-[44px] items-center gap-3 text-sm text-gray-800 dark:text-gray-200">
                <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={open}
                    onChange={(event) => setOpen(event.target.checked)}
                />
                {t('cadenceHabits.pause.noEnd', 'No end date yet')}
            </label>
            {!open && (
                <SidePanelField
                    label={t(
                        'cadenceHabits.pause.lastDay',
                        'Last day (included)'
                    )}
                    htmlFor="pause-end"
                >
                    <input
                        id="pause-end"
                        type="date"
                        value={lastDay}
                        min={start}
                        onChange={(event) => setLastDay(event.target.value)}
                        className={field}
                    />
                </SidePanelField>
            )}
        </EntitySidePanel>
    );
};

export default PauseEditor;
