import React from 'react';
import { Project } from '../../entities/Project';
import { Task } from '../../entities/Task';
import TaskList from '../Task/TaskList';
import NewTask from '../Task/NewTask';
import CompletedTasksSection from '../Task/CompletedTasksSection';
import { useIsMinimal } from '../../hooks/useUiDensity';
import { isTaskCompleted } from '../../constants/taskStatus';
import { TFunction } from 'i18next';

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
                <NewTask
                    onTaskCreate={onInlineCreate}
                    placeholder={t('tasks.addTaskInline', '+ Add task')}
                />
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
