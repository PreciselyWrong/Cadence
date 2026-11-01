import React from 'react';
import { useTranslation } from 'react-i18next';
import { BellAlertIcon } from '@heroicons/react/24/outline';
import DateTimePicker from '../../Shared/DateTimePicker';
import { Task } from '../../../entities/Task';
import {
    formatDateTimeByCountry,
    getUserTimezone,
} from '../../../utils/dateUtils';
import { getCountryFromTimezone } from '../../../utils/localeUtils';

interface TaskReminderCardProps {
    task: Task;
    isEditing: boolean;
    editedReminder: string;
    onChangeDateTime: (value: string) => void;
    onStartEdit: () => void;
    onSave: () => void;
    onCancel: () => void;
}

// The moment a notification rings for this task, independent of the due date.
const TaskReminderCard: React.FC<TaskReminderCardProps> = ({
    task,
    isEditing,
    editedReminder,
    onChangeDateTime,
    onStartEdit,
    onSave,
    onCancel,
}) => {
    const { t } = useTranslation();

    const formatted = (() => {
        if (!task.reminder_at) return null;
        const date = new Date(task.reminder_at);
        if (Number.isNaN(date.getTime())) return null;
        return formatDateTimeByCountry(
            date,
            getCountryFromTimezone(getUserTimezone())
        );
    })();

    return (
        <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('task.reminder', 'Reminder')}
            </h4>
            <div className="rounded-lg shadow-sm bg-white dark:bg-gray-900 border-2 border-gray-50 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 p-4 transition-colors">
                {isEditing ? (
                    <div className="space-y-3">
                        <DateTimePicker
                            value={editedReminder || ''}
                            onChange={onChangeDateTime}
                            placeholder={t(
                                'task.reminderPlaceholder',
                                'Select reminder date and time'
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
                        {formatted ? (
                            <div className="flex items-center space-x-2 flex-1 min-w-0 text-gray-900 dark:text-gray-100">
                                <BellAlertIcon className="h-4 w-4 flex-shrink-0 text-gray-600 dark:text-gray-300" />
                                <span className="text-sm font-medium">
                                    {formatted}
                                </span>
                            </div>
                        ) : (
                            <span className="text-sm text-gray-600 dark:text-gray-300 italic">
                                {t('task.noReminder', 'No reminder')}
                            </span>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};

export default TaskReminderCard;
