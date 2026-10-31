import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import EntitySidePanel from '../SidePanel/EntitySidePanel';
import {
    SidePanelField,
    sidePanelInputClass,
} from '../SidePanel/SidePanelParts';
import {
    CadenceEntry,
    CadenceHabit,
    createRow,
    deleteRow,
    updateRow,
} from '../../utils/cadenceHabitsService';
import {
    fromMinor,
    instantOnDate,
    toMinor,
    unitOfGoal,
} from '../../utils/cadenceHabitUtils';

interface EntryEditorProps {
    isOpen: boolean;
    onClose: () => void;
    habit: CadenceHabit;
    // Absent to add an entry, the entry to edit otherwise
    entry?: CadenceEntry | null;
    defaultDate: string;
    today: string;
    timezone: string;
    onSaved: () => void;
}

const field = `${sidePanelInputClass} min-h-[44px]`;

const EntryEditor: React.FC<EntryEditorProps> = ({
    isOpen,
    onClose,
    habit,
    entry,
    defaultDate,
    today,
    timezone,
    onSaved,
}) => {
    const { t } = useTranslation();
    const goal = habit.goal;
    const counted = !!goal && goal.goal_type !== 'BINARY';
    const unit = goal ? unitOfGoal(goal) : null;
    const scale = unit?.scale ?? 1;
    const [date, setDate] = useState(defaultDate);
    const [value, setValue] = useState('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setDate(entry?.local_date ?? defaultDate);
        setValue(entry ? fromMinor(entry.value_minor, scale) : '');
        setNote(entry?.note ?? '');
        setError(null);
    }, [isOpen, entry, defaultDate, scale]);

    const failed = (caught: unknown) =>
        setError(
            t(
                'cadenceHabits.errors.saveEntry',
                'Could not save the entry ({{code}}).',
                {
                    code:
                        caught instanceof Error
                            ? caught.message
                            : String(caught),
                }
            )
        );

    const submit = async () => {
        const minor = counted ? toMinor(value, scale) : 1;
        if (!date || date > today) {
            setError(
                t(
                    'cadenceHabits.errors.entryDate',
                    'Pick a date that is not in the future.'
                )
            );
            return;
        }
        if (minor === null) {
            setError(
                t(
                    'cadenceHabits.errors.entryValue',
                    'The amount must be greater than zero.'
                )
            );
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const when =
                date === today
                    ? {}
                    : {
                          local_date: date,
                          occurred_at: instantOnDate(date, timezone),
                          observed_zone_id: timezone,
                      };
            if (entry) {
                await updateRow(habit.uid, 'entries', entry.uid, {
                    value_minor: minor,
                    note: note.trim() || null,
                    ...(date !== entry.local_date
                        ? {
                              local_date: date,
                              occurred_at: instantOnDate(date, timezone),
                              observed_zone_id: timezone,
                          }
                        : {}),
                });
            } else {
                await createRow(habit.uid, 'entries', {
                    value_minor: minor,
                    note: note.trim() || null,
                    ...when,
                });
            }
            onSaved();
        } catch (caught) {
            failed(caught);
        } finally {
            setSubmitting(false);
        }
    };

    const remove = async () => {
        if (!entry) return;
        setSubmitting(true);
        try {
            await deleteRow(habit.uid, 'entries', entry.uid);
            onSaved();
        } catch (caught) {
            failed(caught);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <EntitySidePanel
            isOpen={isOpen}
            onClose={onClose}
            title={
                entry
                    ? t('cadenceHabits.entry.editTitle', 'Edit entry')
                    : t('cadenceHabits.entry.newTitle', 'Add an entry')
            }
            eyebrow={habit.name}
            testId="entry-editor"
            submitTestId="entry-editor-submit"
            isSubmitting={submitting}
            isDirty={
                entry
                    ? date !== entry.local_date ||
                      value !== fromMinor(entry.value_minor, scale) ||
                      note !== (entry.note ?? '')
                    : !!value || !!note
            }
            error={error}
            onSubmit={submit}
            onDelete={entry ? remove : undefined}
            deleteLabel={t('cadenceHabits.entry.delete', 'Delete entry')}
        >
            <SidePanelField
                label={t('cadenceHabits.entry.date', 'Date')}
                htmlFor="entry-date"
            >
                <input
                    id="entry-date"
                    type="date"
                    value={date}
                    max={today}
                    onChange={(event) => setDate(event.target.value)}
                    className={field}
                />
            </SidePanelField>
            {counted && (
                <SidePanelField
                    label={
                        unit?.symbol
                            ? t(
                                  'cadenceHabits.entry.valueUnit',
                                  'Amount ({{unit}})',
                                  { unit: unit.symbol }
                              )
                            : t('cadenceHabits.entry.value', 'Amount')
                    }
                    htmlFor="entry-value"
                >
                    <input
                        id="entry-value"
                        type="text"
                        inputMode="decimal"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        className={field}
                    />
                </SidePanelField>
            )}
            <SidePanelField
                label={t('cadenceHabits.entry.note', 'Note')}
                htmlFor="entry-note"
            >
                <textarea
                    id="entry-note"
                    rows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className={sidePanelInputClass}
                />
            </SidePanelField>
        </EntitySidePanel>
    );
};

export default EntryEditor;
