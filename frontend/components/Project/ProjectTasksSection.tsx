import React from 'react';
import { Project } from '../../entities/Project';
import { Task } from '../../entities/Task';
import TaskList from '../Task/TaskList';
import NewTask from '../Task/NewTask';
import CompletedTasksSection from '../Task/CompletedTasksSection';
import { useIsMinimal } from '../../hooks/useUiDensity';
import { isTaskCompleted } from '../../constants/taskStatus';
import { TFunction } from 'i18next';
import { TODO_MD_SECTIONS } from '../../utils/todoMd';

interface ProjectTasksSectionProps {
    displayTasks: Task[];
    onTaskUpdate: (task: Task) => Promise<void>;
    onTaskCompletionToggle: (task: Task) => void;
    onTaskDelete: (taskUid: string) => void;
    onToggleToday: (taskId: number, task?: Task) => Promise<void>;
    allProjects: Project[];
    showCompleted: boolean;
    taskSearchQuery: string;
    onTaskReorder?: (orderedUids: string[]) => void;
    // Minimal only: inline "+ Add task" field and the collapsed Completed
    // section, which lists this project's completed tasks.
    onInlineCreate?: (name: string) => Promise<void>;
    completedTasks?: Task[];
    completedListKey?: string;
    // TODO.md projects: where "+ Add task" writes in the file.
    todoSection?: string;
    onTodoSectionChange?: (section: string) => void;
    t: TFunction;
}

const ProjectTasksSection: React.FC<ProjectTasksSectionProps> = ({
    displayTasks,
    onTaskUpdate,
    onTaskCompletionToggle,
    onTaskDelete,
    onToggleToday,
    allProjects,
    showCompleted,
    taskSearchQuery,
    onTaskReorder,
    onInlineCreate,
    completedTasks = [],
    completedListKey = 'project',
    todoSection,
    onTodoSectionChange,
    t,
}) => {
    const isMinimal = useIsMinimal();
    const showInline = isMinimal && !!onInlineCreate;
    // With the completed filter on, the list already shows completed tasks.
    const showCompletedSection = isMinimal && !showCompleted;
    const completed = completedTasks.filter((task) =>
        isTaskCompleted(task.status)
    );
    return (
        <div className="xl:col-span-2 flex flex-col gap-2">
            {showInline && (
                <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <NewTask
                            onTaskCreate={onInlineCreate}
                            placeholder={t('tasks.addTaskInline', '+ Add task')}
                        />
                    </div>
                    {todoSection && onTodoSectionChange && (
                        <label className="flex flex-shrink-0 items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            {t('todoMd.addTo', 'Add to')}
                            <select
                                value={todoSection}
                                onChange={(e) =>
                                    onTodoSectionChange(e.target.value)
                                }
                                className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-sm text-gray-800 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                                data-testid="todo-md-section"
                            >
                                {TODO_MD_SECTIONS.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>
            )}
            <div className="transition-all duration-300 ease-in-out overflow-visible">
                {displayTasks.length > 0 ? (
                    <div className="transition-all duration-300 ease-in-out opacity-100 transform translate-y-0 overflow-visible">
                        <TaskList
                            tasks={displayTasks}
                            onTaskUpdate={onTaskUpdate}
                            onTaskCompletionToggle={onTaskCompletionToggle}
                            onTaskDelete={onTaskDelete}
                            projects={allProjects}
                            hideProjectName={true}
                            onToggleToday={onToggleToday}
                            showCompletedTasks={showCompleted}
                            onReorder={onTaskReorder}
                        />
                    </div>
                ) : (
                    <div className="transition-all duration-300 ease-in-out opacity-100 transform translate-y-0">
                        <p className="text-gray-600 dark:text-gray-300">
                            {taskSearchQuery.trim()
                                ? t(
                                      'tasks.noTasksAvailable',
                                      'No tasks available.'
                                  )
                                : showCompleted
                                  ? t(
                                        'project.noCompletedTasks',
                                        'No completed tasks.'
                                    )
                                  : t('project.noTasks', 'No tasks.')}
                        </p>
                    </div>
                )}
            </div>
            {showCompletedSection && (
                <CompletedTasksSection
                    list={completedListKey}
                    count={completed.length}
                >
                    <TaskList
                        tasks={completed}
                        onTaskUpdate={onTaskUpdate}
                        onTaskCompletionToggle={onTaskCompletionToggle}
                        onTaskDelete={onTaskDelete}
                        projects={allProjects}
                        hideProjectName={true}
                        onToggleToday={onToggleToday}
                        showCompletedTasks
                    />
                </CompletedTasksSection>
            )}
        </div>
    );
};

export default ProjectTasksSection;
