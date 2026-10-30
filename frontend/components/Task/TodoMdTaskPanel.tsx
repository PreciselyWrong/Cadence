import React from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import EntitySidePanel from '../SidePanel/EntitySidePanel';
import MarkdownRenderer from '../Shared/MarkdownRenderer';
import TodoMdBadge from '../Shared/TodoMdBadge';

interface TodoMdTaskPanelProps {
    isOpen: boolean;
    onClose: () => void;
    task: Task;
}

// What opens for a task mirrored from a TODO.md file: its content, read-only.
// The only change possible from here is the check mark, on the row.
const TodoMdTaskPanel: React.FC<TodoMdTaskPanelProps> = ({
    isOpen,
    onClose,
    task,
}) => {
    const { t } = useTranslation();
    return (
        <EntitySidePanel
            isOpen={isOpen}
            onClose={onClose}
            eyebrow={t('task.title', 'Task')}
            title={task.original_name || task.name}
            submitLabel={t('common.close', 'Close')}
            onSubmit={onClose}
            testId="task-panel"
        >
            <div className="space-y-4" data-testid="todo-md-task-panel">
                <p className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
                    <TodoMdBadge className="ml-0" />
                    {t(
                        'todoMd.readOnly',
                        'This comes from a TODO.md file. Edit the file instead.'
                    )}
                </p>
                {task.source_section && (
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {task.source_section}
                    </p>
                )}
                {task.note ? (
                    <MarkdownRenderer
                        content={task.note}
                        className="prose prose-sm dark:prose-invert max-w-none break-words"
                    />
                ) : null}
            </div>
        </EntitySidePanel>
    );
};

export default TodoMdTaskPanel;
