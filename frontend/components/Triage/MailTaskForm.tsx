import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MailHorizon } from '../../utils/triageService';
import Button from '../Shared/ui/Button';

const field =
    'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900';

const HORIZONS: [MailHorizon, string, string][] = [
    ['week', 'triage.mail.horizon.week', 'Cette semaine'],
    ['next_week', 'triage.mail.horizon.nextWeek', 'Semaine prochaine'],
    ['this_month', 'triage.mail.horizon.thisMonth', 'Ce mois-ci'],
    ['next_month', 'triage.mail.horizon.nextMonth', 'Mois prochain'],
    ['someday', 'triage.mail.horizon.someday', 'Un jour'],
];

export interface MailTaskPayload {
    name: string;
    due_date?: string;
    horizon?: MailHorizon;
}

interface MailTaskFormProps {
    initialName: string;
    initialDue: string;
    initialHorizon?: MailHorizon | null;
    onSubmit: (payload: MailTaskPayload) => void;
}

// The task born from a mail: name and moment prefilled by the agent, all
// editable. A day or a horizon, never both (the day wins on the server).
const MailTaskForm: React.FC<MailTaskFormProps> = ({
    initialName,
    initialDue,
    initialHorizon = null,
    onSubmit,
}) => {
    const { t } = useTranslation();
    const [name, setName] = useState(initialName);
    const [dueDate, setDueDate] = useState(initialDue);
    const [horizon, setHorizon] = useState<MailHorizon | null>(
        initialDue ? null : initialHorizon
    );

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const text = name.trim();
        if (!text) return;
        if (dueDate) onSubmit({ name: text, due_date: dueDate });
        else if (horizon) onSubmit({ name: text, horizon });
        else onSubmit({ name: text });
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
                    onChange={(event) => {
                        setDueDate(event.target.value);
                        if (event.target.value) setHorizon(null);
                    }}
                    className={field}
                />
            </label>
            <div
                role="group"
                aria-label={t('triage.mail.horizon.label', 'Ou plus tard')}
                className="mt-2 flex flex-wrap items-center gap-1.5"
            >
                {HORIZONS.map(([key, label, fallback]) => (
                    <button
                        key={key}
                        type="button"
                        aria-pressed={horizon === key}
                        onClick={() => {
                            setHorizon(horizon === key ? null : key);
                            setDueDate('');
                        }}
                        className={`min-h-[36px] rounded-full px-3 text-label transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            horizon === key
                                ? 'bg-primary/10 text-surface-on ring-2 ring-inset ring-primary'
                                : 'text-surface-on ring-1 ring-inset ring-outline-variant hover:bg-surface-high'
                        }`}
                    >
                        {t(label, fallback)}
                    </button>
                ))}
            </div>
            <Button type="submit" variant="primary" size="md" className="mt-3">
                {t('triage.mail.createTask', 'Créer la tâche')}
            </Button>
        </form>
    );
};

export default MailTaskForm;
