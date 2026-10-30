import React from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentTextIcon } from '@heroicons/react/24/outline';

// Marks a task or project that mirrors a TODO.md file.
const TodoMdBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
    const { t } = useTranslation();
    return (
        <span
            className={`ml-1 inline-flex h-5 flex-shrink-0 items-center gap-0.5 rounded-full bg-gray-100 px-1.5 text-gray-500 dark:bg-gray-800 dark:text-gray-400 ${className}`}
            title={t(
                'todoMd.badgeTitle',
                'From a TODO.md file. Read-only here: edit the file instead.'
            )}
            data-testid="todo-md-badge"
        >
            <DocumentTextIcon className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium">
                {t('todoMd.badge', 'TODO.md')}
            </span>
        </span>
    );
};

export default TodoMdBadge;
