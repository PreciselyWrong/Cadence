import React from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarIcon, FlagIcon } from '@heroicons/react/24/outline';
import { Task, PriorityType } from '../../../entities/Task';
import PriorityDropdown from '../../Shared/PriorityDropdown';
import DateTimePicker from '../../Shared/DateTimePicker';
import { toPriorityLevel, PriorityLevel } from '../../Shared/PriorityBadge';
import { fromDueParts, toDueParts } from '../../../utils/dueDateTime';
import { useTaskRowSave } from './useTaskRowSave';

const FLAG_TONE: Record<PriorityLevel, string> = {
    high: 'text-red-500 dark:text-red-400',
    medium: 'text-orange-500 dark:text-orange-400',
    low: 'text-blue-500 dark:text-blue-400',
};

// Hidden until the row is hovered or focused, always shown on touch screens.
const HOVER_ONLY =
    'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100';

interface MinimalQuickEditsProps {
    task: Task;
    onFieldUpdate: (task: Task) => Promise<void>;
    dueText: string | null;
    dueClass: string;
}

// Priority flag and due date on a minimal row. Each control reuses the editor
// and save path of the expanded row. The wrapper stops clicks and keys from
// reaching the row, which would otherwise expand it (portal menus bubble too).
const MinimalQuickEdits: React.FC<MinimalQuickEditsProps> = ({
    task,
    onFieldUpdate,
    dueText,
    dueClass,
}) => {
    const { t } = useTranslation();
    const setters = useTaskRowSave(task, onFieldUpdate);
    const level = toPriorityLevel(task.priority);
    const setPriorityLabel = t('tasks.quickEdit.setPriority', 'Set priority');
    const setDueLabel = t('tasks.quickEdit.setDueDate', 'Set due date');
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();

    return (
        <div
            className="flex flex-shrink-0 items-center gap-2"
            onClick={stop}
            onKeyDown={stop}
        >
            <PriorityDropdown
                value={level as PriorityType}
                onChange={(p) => void setters.setPriority(p)}
                renderTrigger={({ onClick, isOpen }) => (
                    <button
                        type="button"
                        onClick={onClick}
                        aria-label={setPriorityLabel}
                        title={setPriorityLabel}
                        aria-haspopup="menu"
                        aria-expanded={isOpen}
                        className={`flex flex-shrink-0 items-center transition-opacity focus:outline-none ${
                            level
                                ? FLAG_TONE[level]
                                : `text-gray-400 dark:text-gray-500 ${HOVER_ONLY}`
                        }`}
                    >
                        <FlagIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                )}
            />

            <DateTimePicker
                value={fromDueParts(
                    task.due_date,
                    task.due_has_time ? task.due_time : null
                )}
                onChange={(iso) => {
                    const parts = toDueParts(iso);
                    void setters.setDue(parts.date, parts.time);
                }}
                renderTrigger={({ onClick, isOpen }) =>
                    task.due_date ? (
                        <button
                            type="button"
                            onClick={onClick}
                            aria-haspopup="dialog"
                            aria-expanded={isOpen}
                            aria-label={setDueLabel}
                            className={`whitespace-nowrap rounded hover:underline focus:outline-none ${dueClass}`}
                        >
                            {dueText}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={onClick}
                            aria-haspopup="dialog"
                            aria-expanded={isOpen}
                            aria-label={setDueLabel}
                            title={setDueLabel}
                            className={`flex flex-shrink-0 items-center text-gray-400 transition-opacity focus:outline-none dark:text-gray-500 ${HOVER_ONLY}`}
                        >
                            <CalendarIcon
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                            />
                        </button>
                    )
                }
            />
        </div>
    );
};

export default MinimalQuickEdits;
