import React, { useState } from 'react';
import { PlusCircleIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { Project } from '../../../entities/Project';
import { Task } from '../../../entities/Task';
import TaskItem from '../TaskItem';
import { TASK_SHEET_CLASS } from '../taskSheet';

interface TaskSubtasksCardProps {
    subtasks: Task[];
    projects: Project[];
    onSubtaskUpdate: (updatedSubtask: Task) => Promise<void>;
    onSubtaskDelete: (taskUid: string) => void;
    onQuickAdd: (name: string) => void;
    // « Découper en étapes »: only offered to a top-level task.
    onBreakdown?: () => void;
    // The side panel names the section itself.
    showTitle?: boolean;
}

const TaskSubtasksCard: React.FC<TaskSubtasksCardProps> = ({
    subtasks,
    projects,
    onSubtaskUpdate,
    onSubtaskDelete,
    onQuickAdd,
    onBreakdown,
    showTitle = true,
}) => {
    const [newSubtaskName, setNewSubtaskName] = useState('');
    const { t } = useTranslation();

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && newSubtaskName.trim()) {
            e.preventDefault();
            onQuickAdd(newSubtaskName.trim());
            setNewSubtaskName('');
        }
    };

    return (
        <div>
            {showTitle && (
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                    {t('subtasks.title', 'Subtasks')}
                    {subtasks.length > 0 && (
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                            ({subtasks.length})
                        </span>
                    )}
                </h3>
            )}

            {subtasks.length > 0 && (
                <div className={`mb-1 ${TASK_SHEET_CLASS}`}>
                    {subtasks.map((subtask) => (
                        <TaskItem
                            key={subtask.id ?? subtask.uid}
                            task={subtask}
                            onTaskUpdate={onSubtaskUpdate}
                            onTaskDelete={onSubtaskDelete}
                            projects={projects}
                            hideProjectName
                            disableExpand
                        />
                    ))}
                </div>
            )}

            <div className="group flex items-center py-3 px-4 rounded-lg shadow-sm bg-white dark:bg-gray-900 transition-all duration-200 ease-in-out hover:ring-1 hover:ring-gray-200 dark:hover:ring-gray-700 focus-within:ring-1 focus-within:ring-blue-300 dark:focus-within:ring-blue-500 cursor-text">
                <PlusCircleIcon className="h-5 w-5 mr-3 flex-shrink-0 text-gray-500 dark:text-gray-400 transition-colors duration-200 group-hover:text-gray-500 dark:group-hover:text-gray-400 group-focus-within:text-blue-400 dark:group-focus-within:text-blue-400" />
                <input
                    type="text"
                    value={newSubtaskName}
                    onChange={(e) => setNewSubtaskName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('subtasks.placeholder', 'Add a subtask...')}
                    className="text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 bg-transparent focus:outline-none focus:ring-0 w-full cursor-text"
                />
            </div>
            {onBreakdown && (
                <button
                    type="button"
                    onClick={onBreakdown}
                    className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                >
                    <SparklesIcon className="h-4 w-4" aria-hidden="true" />
                    {t('breakdown.title', 'Découper en étapes')}
                </button>
            )}
        </div>
    );
};

export default TaskSubtasksCard;
