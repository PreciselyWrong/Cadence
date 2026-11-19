import React, { useState } from 'react';
import { useToast } from '../../components/Shared/ToastContext';
import { useTranslation } from 'react-i18next';
import { PlusCircleIcon } from '@heroicons/react/24/outline';
import { useStore } from '../../store/useStore';
import { parseQuickAdd, QuickAddResult } from '../../utils/quickAddParse';
import type { Task } from '../../entities/Task';

// A list that tags its new tasks (a tag page, a ?tag= list) keeps its tag and
// adds the tags the typed line named.
export const withListTag = (
    extras: Partial<Task>,
    tagName: string
): Partial<Task> => ({
    ...extras,
    tags: [
        { name: tagName },
        ...(extras.tags ?? []).filter((tag) => tag.name !== tagName),
    ] as Task['tags'],
});

interface NewTaskProps {
    onTaskCreate: (taskName: string, extras: Partial<Task>) => Promise<void>;
    placeholder?: string;
}

// The fields the typed line named, in the shape the task payload takes (the
// same mapping as the Plan page's quick add). Only what was named is sent so
// a caller's own defaults survive.
const extrasFrom = (parsed: QuickAddResult): Partial<Task> =>
    ({
        ...(parsed.date ? { due_date: parsed.date } : {}),
        ...(parsed.priority ? { priority: parsed.priority } : {}),
        ...(parsed.projectId !== undefined
            ? { project_id: parsed.projectId }
            : {}),
        ...(parsed.tags.length > 0
            ? { tags: parsed.tags.map((tag) => ({ name: tag })) }
            : {}),
        ...(parsed.durationMinutes
            ? { estimated_minutes: parsed.durationMinutes }
            : {}),
    }) as Partial<Task>;

const NewTask: React.FC<NewTaskProps> = ({ onTaskCreate, placeholder }) => {
    const [taskName, setTaskName] = useState<string>('');
    const { showErrorToast } = useToast();
    const { t, i18n } = useTranslation();
    const projects = useStore((state) => state.projectsStore.projects);

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setTaskName(event.target.value);
    };

    const handleKeyDown = async (
        event: React.KeyboardEvent<HTMLInputElement>
    ) => {
        if (event.key === 'Escape') {
            setTaskName('');
            return;
        }
        if (event.key === 'Enter' && taskName.trim()) {
            const taskText = taskName.trim();
            const parsed = parseQuickAdd(taskText, {
                now: new Date(),
                locale: i18n.language,
                projects: projects
                    .filter((project) => project.id !== undefined)
                    .map((project) => ({
                        id: project.id as number,
                        name: project.name,
                    })),
            });
            const named = parsed.name.trim().length > 0;
            setTaskName('');

            try {
                await onTaskCreate(
                    named ? parsed.name.trim() : taskText,
                    named ? extrasFrom(parsed) : {}
                );
                // Success toast is now handled by the parent component
            } catch (error) {
                console.error('NewTask: Error creating task:', error);
                setTaskName(taskText);
                showErrorToast(
                    t('errors.taskCreate', 'Failed to create task.')
                );
            }
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between py-3.5 px-5 border-b border-gray-200 dark:border-gray-800 rounded-lg shadow-sm bg-white dark:bg-gray-900">
                <span className="text-xl text-gray-600 dark:text-gray-300 mr-2">
                    <PlusCircleIcon className="h-5 w-5" />
                </span>
                <input
                    type="text"
                    value={taskName}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    className="font-semibold text-base text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 bg-transparent dark:bg-transparent focus:outline-none focus:ring-0 w-full appearance-none"
                    placeholder={
                        placeholder ??
                        t('tasks.addNewTask', 'Προσθήκη Νέας Εργασίας')
                    }
                    data-testid="new-task-input"
                />
            </div>
        </div>
    );
};

export default NewTask;
