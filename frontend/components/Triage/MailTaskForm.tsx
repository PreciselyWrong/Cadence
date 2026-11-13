import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../Shared/ui/Button';

const field =
    'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900';

interface MailTaskFormProps {
    initialName: string;
    initialDue: string;
    onSubmit: (payload: { name: string; due_date?: string }) => void;
}

// The task born from a mail: name and due date prefilled, both editable.
const MailTaskForm: React.FC<MailTaskFormProps> = ({
    initialName,
    initialDue,
    onSubmit,
}) => {
    const { t } = useTranslation();
    const [name, setName] = useState(initialName);
    const [dueDate, setDueDate] = useState(initialDue);

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const text = name.trim();
        if (!text) return;
        onSubmit(dueDate ? { name: text, due_date: dueDate } : { name: text });
    };

    return (
        <form
            onSubmit={submit}
            className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700"
        >
            <label className="block text-sm text-gray-700 dark:text-gray-200">
                {t('triage.mail.taskName', 'Nom de la tâche')}
                <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={field}
                    autoFocus
                />
            </label>
            <label className="mt-2 block text-sm text-gray-700 dark:text-gray-200">
                {t('triage.mail.taskDue', 'Échéance')}
                <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className={field}
                />
            </label>
            <Button type="submit" variant="primary" size="md" className="mt-2">
                {t('triage.mail.createTask', 'Créer la tâche')}
            </Button>
        </form>
    );
};

export default MailTaskForm;
