import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import TodoMdBadge from '../Shared/TodoMdBadge';
import { useToast } from '../Shared/ToastContext';

interface TodoMdProjectNoteProps {
    path: string;
    onReread?: () => Promise<void>;
}

// Under the title of a project mirrored from a TODO.md file: where it comes
// from, and a button to read the file again without waiting for the server.
const TodoMdProjectNote: React.FC<TodoMdProjectNoteProps> = ({
    path,
    onReread,
}) => {
    const { t } = useTranslation();
    const { showSuccessToast, showErrorToast } = useToast();
    const [busy, setBusy] = useState(false);

    const reread = async () => {
        if (!onReread || busy) return;
        setBusy(true);
        try {
            await onReread();
            showSuccessToast(t('todoMd.rereadDone', 'TODO.md files reread.'));
        } catch {
            showErrorToast(
                t('todoMd.rereadFailed', 'Could not reread the TODO.md files.')
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-300"
            data-testid="todo-md-project-note"
        >
            <TodoMdBadge className="ml-0" />
            <span>
                {t(
                    'todoMd.projectInfo',
                    'Mirrors {{path}}. Tasks you add are written to the file, and checking one off updates it.',
                    { path }
                )}
            </span>
            {onReread && (
                <button
                    type="button"
                    onClick={() => void reread()}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-blue-600 hover:bg-white/60 disabled:opacity-60 dark:text-blue-400 dark:hover:bg-gray-800/60"
                    data-testid="todo-md-reread"
                >
                    <ArrowPathIcon
                        className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`}
                    />
                    {busy
                        ? t('todoMd.rereading', 'Rereading...')
                        : t('todoMd.reread', 'Reread')}
                </button>
            )}
        </div>
    );
};

export default TodoMdProjectNote;
