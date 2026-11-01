import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    answerRecurringScope,
    RecurringScope,
    RecurringScopeKind,
    useRecurringScopeStore,
} from '../../utils/recurringScope';

interface RecurringScopeDialogProps {
    kind: RecurringScopeKind;
    onSelect: (scope: RecurringScope) => void;
    onCancel: () => void;
}

// Asks which occurrences of a recurring task an edit or a deletion reaches.
export const RecurringScopeDialog: React.FC<RecurringScopeDialogProps> = ({
    kind,
    onSelect,
    onCancel,
}) => {
    const { t } = useTranslation();

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCancel();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onCancel]);

    const optionClass =
        'w-full px-4 py-3 text-left rounded border border-gray-300 text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700 ';

    return (
        <div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
            onClick={onCancel}
            data-testid="recurring-scope-dialog"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="recurring-scope-title"
                className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-lg mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                <h3
                    id="recurring-scope-title"
                    className="text-xl font-semibold mb-4 text-gray-900 dark:text-white"
                >
                    {kind === 'delete'
                        ? t(
                              'task.recurringScope.deleteTitle',
                              'Delete this task or the series?'
                          )
                        : t(
                              'task.recurringScope.editTitle',
                              'Edit this task or the series?'
                          )}
                </h3>
                <div className="flex flex-col gap-3 mb-6">
                    <button
                        type="button"
                        onClick={() => onSelect('this')}
                        className={optionClass}
                        data-testid="recurring-scope-this"
                    >
                        {t(
                            'task.recurringScope.optionThis',
                            'Only this occurrence'
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => onSelect('following')}
                        className={optionClass}
                        data-testid="recurring-scope-following"
                    >
                        {t(
                            'task.recurringScope.optionFollowing',
                            'This and following occurrences'
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => onSelect('all')}
                        className={optionClass}
                        data-testid="recurring-scope-all"
                    >
                        {t('task.recurringScope.optionAll', 'All occurrences')}
                    </button>
                </div>
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 "
                        data-testid="recurring-scope-cancel"
                    >
                        {t('common.cancel', 'Cancel')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Renders the prompt whenever a recurring edit or deletion waits for an
// answer.
export const RecurringScopeDialogHost: React.FC = () => {
    const pending = useRecurringScopeStore((state) => state.pending);
    if (!pending) return null;
    return (
        <RecurringScopeDialog
            kind={pending.kind}
            onSelect={(scope) => answerRecurringScope(scope)}
            onCancel={() => answerRecurringScope(null)}
        />
    );
};

export default RecurringScopeDialogHost;
