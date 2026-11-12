import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Person, RelationshipType } from '../../entities/Person';
import { RELATIONSHIP_TYPES, relationshipLabel } from './relationshipLabel';
import ColorPicker from '../Shared/ColorPicker';
import EntitySidePanel from '../SidePanel/EntitySidePanel';
import {
    SidePanelField,
    SidePanelSection,
    sidePanelInputClass,
} from '../SidePanel/SidePanelParts';

interface PersonModalProps {
    person: Person | null;
    onSave: (data: Partial<Person>) => Promise<void>;
    onClose: () => void;
}

interface PersonFormState {
    name: string;
    relationshipType: RelationshipType;
    email: string;
    phone: string;
    notes: string;
    color: string;
}

const toFormState = (person: Person | null): PersonFormState => ({
    name: person?.name ?? '',
    relationshipType: person?.relationship_type ?? 'other',
    email: person?.email ?? '',
    phone: person?.phone ?? '',
    notes: person?.notes ?? '',
    color: person?.color ?? '',
});

// Mounted only while open (the people list and the sidebar both do this),
// so the panel is always open here.
const PersonModal: React.FC<PersonModalProps> = ({
    person,
    onSave,
    onClose,
}) => {
    const { t } = useTranslation();
    const [form, setForm] = useState<PersonFormState>(() =>
        toFormState(person)
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setForm(toFormState(person));
        setError(null);
    }, [person]);

    const setField = <K extends keyof PersonFormState>(
        key: K,
        value: PersonFormState[K]
    ) => setForm((prev) => ({ ...prev, [key]: value }));

    const hasUnsavedChanges = () => {
        const original = toFormState(person);
        return (Object.keys(original) as (keyof PersonFormState)[]).some(
            (key) => form[key] !== original[key]
        );
    };

    const handleSubmit = async () => {
        if (!form.name.trim()) {
            setError(t('people.nameRequired', 'Name is required'));
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await onSave({
                name: form.name.trim(),
                relationship_type: form.relationshipType,
                email: form.email.trim() || null,
                phone: form.phone.trim() || null,
                notes: form.notes.trim() || null,
                color: form.color || null,
            });
            onClose();
        } catch (err: unknown) {
            setError(
                err instanceof Error
                    ? err.message
                    : t('people.saveError', 'Failed to save person')
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <EntitySidePanel
            isOpen
            onClose={onClose}
            eyebrow={t('people.title', 'People')}
            title={
                person
                    ? t('people.editPerson', 'Edit person')
                    : t('people.newPerson', 'New person')
            }
            submitLabel={
                person ? t('common.save', 'Save') : t('common.create', 'Create')
            }
            isSubmitting={saving}
            isDirty={hasUnsavedChanges()}
            error={error}
            onSubmit={handleSubmit}
            testId="person-panel"
        >
            <SidePanelField
                label={t('forms.name', 'Name')}
                htmlFor="personName"
            >
                <input
                    id="personName"
                    type="text"
                    value={form.name}
                    onChange={(e) => setField('name', e.target.value)}
                    required
                    className={sidePanelInputClass}
                    placeholder={t(
                        'people.namePlaceholder',
                        'Dad, Partner, Alice…'
                    )}
                />
            </SidePanelField>

            <SidePanelField
                label={t('people.relationship', 'Relationship')}
                htmlFor="personRelationship"
            >
                <select
                    id="personRelationship"
                    value={form.relationshipType}
                    onChange={(e) =>
                        setField(
                            'relationshipType',
                            e.target.value as RelationshipType
                        )
                    }
                    className={sidePanelInputClass}
                >
                    {RELATIONSHIP_TYPES.map((type) => (
                        <option key={type} value={type}>
                            {relationshipLabel(type, t)}
                        </option>
                    ))}
                </select>
            </SidePanelField>

            <SidePanelField
                label={t('members.email', 'Email')}
                htmlFor="personEmail"
            >
                <input
                    id="personEmail"
                    type="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    className={sidePanelInputClass}
                    placeholder="optional@example.com"
                />
            </SidePanelField>

            <SidePanelField
                label={t('people.phone', 'Phone')}
                htmlFor="personPhone"
            >
                <input
                    id="personPhone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    className={sidePanelInputClass}
                    placeholder="+1 555 000 0000"
                />
            </SidePanelField>

            <SidePanelField
                label={t('notes.title', 'Notes')}
                htmlFor="personNotes"
            >
                <textarea
                    id="personNotes"
                    value={form.notes}
                    onChange={(e) => setField('notes', e.target.value)}
                    rows={3}
                    className={`${sidePanelInputClass} resize-none`}
                    placeholder={t(
                        'people.notesPlaceholder',
                        'Any notes about this person…'
                    )}
                />
            </SidePanelField>

            <SidePanelSection title={t('forms.color', 'Color')}>
                <ColorPicker
                    value={form.color}
                    onChange={(color) => setField('color', color)}
                />
            </SidePanelSection>
        </EntitySidePanel>
    );
};

export default PersonModal;
