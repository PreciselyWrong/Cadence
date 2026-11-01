import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';

interface SlotChoiceDialogProps {
    start: Date;
    googleAvailable: boolean;
    onAddTask: (name: string) => Promise<void>;
    onGoogleEvent: () => void;
    onClose: () => void;
}

// An empty hour clicked on the calendar: a task due then, or, when a Google
// calendar is writable, a Google event as the second choice.
const SlotChoiceDialog: React.FC<SlotChoiceDialogProps> = ({
    start,
    googleAvailable,
    onAddTask,
    onGoogleEvent,
    onClose,
}) => {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const time = format(start, 'HH:mm');
    const addLabel = t('calendar.slot.addTaskAt', 'Add task at {{time}}', {
        time,
    });

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const canAdd = name.trim().length > 0 && !saving;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canAdd) return;
        setSaving(true);
        try {
            await onAddTask(name.trim());
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={addLabel}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-5 space-y-3"
                onClick={(event) => event.stopPropagation()}
            >
                <form onSubmit={submit} className="space-y-3">
                    <input
                        autoFocus
                        type="text"
                        aria-label={t('calendar.slot.taskName', 'Task name')}
                        placeholder={t('calendar.slot.taskName', 'Task name')}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    />
                    <button
                        type="submit"
                        disabled={!canAdd}
                        className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {addLabel}
                    </button>
                </form>
                {googleAvailable && (
                    <button
                        type="button"
                        onClick={onGoogleEvent}
                        className="w-full rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                        {t('calendar.slot.googleEvent', 'New Google event')}
                    </button>
                )}
            </div>
        </div>
    );
};

export default SlotChoiceDialog;
