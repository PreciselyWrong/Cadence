import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    answerRecurringMove,
    RecurringMoveScope,
    useRecurringMoveStore,
} from '../../utils/recurringMove';

interface RecurringMoveDialogProps {
    onSelect: (scope: RecurringMoveScope) => void;
    onCancel: () => void;
}

export const RecurringMoveDialog: React.FC<RecurringMoveDialogProps> = ({
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
        'w-full px-4 py-3 text-left rounded border border-gray-300 text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700 focus:outline-none';

    return (
        <div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
            onClick={onCancel}
            data-testid="recurring-move-dialog"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="recurring-move-title"
                className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-lg mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                <h3
                    id="recurring-move-title"
                    className="text-xl font-semibold mb-4 text-gray-900 dark:text-white"
                >
                    {t('task.recurringMove.title', 'Move recurring task')}
                </h3>
                <div className="flex flex-col gap-3 mb-6">
                    <button
                        type="button"
                        onClick={() => onSelect('this')}
                        className={optionClass}
                        data-testid="recurring-move-this"
                    >
                        {t(
                            'task.recurringMove.optionThis',
                            'Only this occurrence'
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => onSelect('following')}
                        className={optionClass}
                        data-testid="recurring-move-following"
                    >
                        {t(
                            'task.recurringMove.optionFollowing',
                            'This and following occurrences'
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => onSelect('all')}
                        className={optionClass}
                        data-testid="recurring-move-all"
                    >
                        {t('task.recurringMove.optionAll', 'All occurrences')}
                    </button>
                </div>
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 focus:outline-none"
                        data-testid="recurring-move-cancel"
                    >
                        {t('common.cancel', 'Cancel')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Renders the prompt whenever a recurring move is waiting for an answer.
export const RecurringMoveDialogHost: React.FC = () => {
    const pending = useRecurringMoveStore((state) => state.pending);
    if (!pending) return null;
    return (
        <RecurringMoveDialog
            onSelect={(scope) => answerRecurringMove(scope)}
            onCancel={() => answerRecurringMove(null)}
        />
    );
};

export default RecurringMoveDialogHost;
