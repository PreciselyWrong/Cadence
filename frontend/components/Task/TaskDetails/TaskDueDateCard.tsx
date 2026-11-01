import React from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarIcon } from '@heroicons/react/24/outline';
import TaskDueDateSection from '../TaskForm/TaskDueDateSection';
import { Task } from '../../../entities/Task';
import {
    parseDateString,
    formatDateByCountry,
    getUserTimezone,
} from '../../../utils/dateUtils';
import { getCountryFromTimezone } from '../../../utils/localeUtils';

interface TaskDueDateCardProps {
    task: Task;
    isEditing: boolean;
    editedDueDate: string;
    onChangeDate: (value: string) => void;
    editedDueTime: string;
    onChangeTime: (value: string) => void;
    onStartEdit: () => void;
    onSave: () => void;
    onCancel: () => void;
}

const TaskDueDateCard: React.FC<TaskDueDateCardProps> = ({
    task,
    isEditing,
    editedDueDate,
    onChangeDate,
    editedDueTime,
    onChangeTime,
    onStartEdit,
    onSave,
    onCancel,
}) => {
    const { t } = useTranslation();

    const getDueDateDisplay = (dueDate: string) => {
        const date = parseDateString(dueDate);
        if (!date) return null;

        // Format date based on user's timezone-derived country
        const timezone = getUserTimezone();
        const country = getCountryFromTimezone(timezone);
        const formattedDate = formatDateByCountry(date, country);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(date);
        target.setHours(0, 0, 0, 0);

        const diffDays = Math.round(
            (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        let relativeText = '';
        if (diffDays === 0) {
            relativeText = t('dateIndicators.today', 'today');
        } else if (diffDays === 1) {
            relativeText = t('dateIndicators.tomorrow', 'tomorrow');
        } else if (diffDays > 0) {
            relativeText = t('task.inDays', 'in {{count}} days', {
                count: diffDays,
            });
        }
        // A past date shows only the date: no "N days ago" count and no red
        // (docs/fork/WEB-UX-NOTES.md, ton sans culpabilité).

        return { formattedDate, relativeText };
    };

    return (
        <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('task.dueDate', 'Due Date')}
            </h4>
            <div className="rounded-lg shadow-sm bg-white dark:bg-gray-900 border-2 border-gray-50 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 p-4 transition-colors">
                {isEditing ? (
                    <div className="space-y-3">
                        <TaskDueDateSection
                            value={editedDueDate}
                            onChange={onChangeDate}
                            time={editedDueTime}
                            onTimeChange={onChangeTime}
                            placeholder={t(
                                'forms.task.dueDatePlaceholder',
                                'Select due date'
                            )}
                        />
                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={onSave}
                                className="px-4 py-2 text-sm bg-green-600 dark:bg-green-500 text-white rounded hover:bg-green-700 dark:hover:bg-green-600 transition-colors"
                            >
                                {t('common.save', 'Save')}
                            </button>
                            <button
                                onClick={onCancel}
                                className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                            >
                                {t('common.cancel', 'Cancel')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={onStartEdit}
                        className="flex w-full items-center justify-between text-left"
                    >
                        {task.due_date ? (
                            (() => {
                                const display = getDueDateDisplay(
                                    task.due_date
                                );
                                if (!display) return null;

                                return (
                                    <div className="flex items-center justify-between w-full text-gray-900 dark:text-gray-100">
                                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                                            <CalendarIcon className="h-4 w-4 flex-shrink-0 text-gray-600 dark:text-gray-300" />
                                            <span className="text-sm font-medium">
                                                {display.formattedDate}
                                                {task.due_has_time &&
                                                    task.due_time &&
                                                    ` ${task.due_time}`}
                                            </span>
                                            {display.relativeText && (
                                                <span className="text-sm italic text-gray-600 dark:text-gray-300">
                                                    ({display.relativeText})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()
                        ) : (
                            <span className="text-sm text-gray-600 dark:text-gray-300 italic">
                                {t('task.noDueDate', 'No due date')}
                            </span>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};

export default TaskDueDateCard;
