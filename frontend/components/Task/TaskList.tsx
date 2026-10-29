import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    DndContext,
    closestCenter,
    DragEndEvent,
    DragMoveEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import TaskItem from './TaskItem';
import SortableItem from '../Shared/SortableItem';
import {
    resetSortableCursor,
    sortableCursorHandlers,
    swallowNextClick,
    useSortableSensors,
} from '../Shared/sortableList';
import { Project } from '../../entities/Project';
import { Task } from '../../entities/Task';
import { isTaskActive } from '../../constants/taskStatus';
import { TASK_SHEET_CLASS } from './taskSheet';
import { useMinimalRowKeyboard } from './useMinimalRowKeyboard';
import { useIsMinimal } from '../../hooks/useUiDensity';
import { useOptionalToast } from '../Shared/ToastContext';
import {
    announceProjectHover,
    dragPointer,
    moveTaskToProject,
    projectUidAt,
} from './taskProjectDrop';

interface TaskListProps {
    tasks: Task[];
    onTaskUpdate: (task: Task) => Promise<void>;
    onTaskCompletionToggle?: (task: Task) => void;
    onTaskCreate?: (task: Task) => void;
    onTaskDelete: (taskUid: string) => void;
    projects: Project[];
    hideProjectName?: boolean;
    onToggleToday?: (taskId: number, task?: Task) => Promise<void>;
    showCompletedTasks?: boolean;
    isInCompletedSection?: boolean;
    isUpcomingView?: boolean;
    showSuggestionChips?: boolean;
    // Makes the rows draggable; called with the shown task uids in their
    // new order after a drop.
    onReorder?: (orderedUids: string[]) => void;
}

const TaskList: React.FC<TaskListProps> = ({
    tasks,
    onTaskUpdate,
    onTaskCompletionToggle,
    onTaskDelete,
    projects,
    hideProjectName = false,
    onToggleToday,
    showCompletedTasks = false,
    isInCompletedSection = false,
    isUpcomingView = false,
    showSuggestionChips = false,
    onReorder,
}) => {
    const { t } = useTranslation();
    const sensors = useSortableSensors();
    const { listRef, onListKeyDown, onListFocus } = useMinimalRowKeyboard();
    const isMinimal = useIsMinimal();
    const toast = useOptionalToast();

    // Conditionally filter tasks based on showCompletedTasks prop
    const filteredTasks = showCompletedTasks
        ? tasks
        : tasks.filter((task) => isTaskActive(task.status));

    const renderTaskItem = (task: Task) => (
        <TaskItem
            task={task}
            onTaskUpdate={onTaskUpdate}
            onTaskCompletionToggle={onTaskCompletionToggle}
            onTaskDelete={onTaskDelete}
            projects={projects}
            hideProjectName={hideProjectName}
            onToggleToday={onToggleToday}
            isInCompletedSection={isInCompletedSection}
            isUpcomingView={isUpcomingView}
            showCompletedTasks={showCompletedTasks}
            showSuggestionChips={showSuggestionChips}
        />
    );

    const wrapperClass =
        'task-item-wrapper transition-all duration-200 ease-in-out overflow-visible relative hover:z-[10000] focus-within:z-[10000]';

    if (filteredTasks.length === 0) {
        return (
            <div className="task-list-container space-y-1.5 overflow-visible">
                <p className="text-gray-500 dark:text-gray-400 text-center mt-4">
                    No tasks available.
                </p>
            </div>
        );
    }

    const sortable = !!onReorder && filteredTasks.every((task) => task.uid);

    if (!sortable) {
        return (
            <div
                ref={listRef}
                onKeyDown={onListKeyDown}
                onFocus={onListFocus}
                className={`task-list-container overflow-visible ${TASK_SHEET_CLASS}`}
            >
                {filteredTasks.map((task) => (
                    <div
                        key={task.id}
                        className={wrapperClass}
                        data-testid={`task-item-${task.id}`}
                    >
                        {renderTaskItem(task)}
                    </div>
                ))}
            </div>
        );
    }

    const uids = filteredTasks.map((task) => task.uid as string);

    // Minimal only: the sidebar project under the pointer is highlighted.
    const handleDragMove = ({ activatorEvent, delta }: DragMoveEvent) => {
        if (!isMinimal) return;
        announceProjectHover(projectUidAt(dragPointer(activatorEvent, delta)));
    };

    const handleDragEnd = ({
        active,
        over,
        activatorEvent,
        delta,
    }: DragEndEvent) => {
        resetSortableCursor();
        announceProjectHover(null);
        // Released over a sidebar project: the row moves there and keeps its
        // place in this list. The click that ends the drag must not open
        // the project it lands on.
        const projectUid = isMinimal
            ? projectUidAt(dragPointer(activatorEvent, delta))
            : null;
        if (projectUid) {
            swallowNextClick();
            const task = filteredTasks.find((item) => item.uid === active.id);
            if (task) {
                moveTaskToProject(task, projectUid).catch(() => {
                    toast?.showErrorToast(
                        t('task.updateError', 'Failed to update task')
                    );
                });
            }
            return;
        }
        if (!over || active.id === over.id) return;
        swallowNextClick();
        const from = uids.indexOf(active.id as string);
        const to = uids.indexOf(over.id as string);
        if (from === -1 || to === -1) return;
        onReorder(arrayMove(uids, from, to));
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            {...sortableCursorHandlers}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
        >
            <SortableContext
                items={uids}
                strategy={verticalListSortingStrategy}
            >
                <div
                    ref={listRef}
                    onKeyDown={onListKeyDown}
                    onFocus={onListFocus}
                    className={`task-list-container overflow-visible ${TASK_SHEET_CLASS}`}
                >
                    {filteredTasks.map((task) => (
                        <div
                            key={task.id}
                            className={wrapperClass}
                            data-testid={`task-item-${task.id}`}
                        >
                            <SortableItem
                                id={task.uid as string}
                                label={task.name}
                                roleDescription={t(
                                    'sortable.task',
                                    'sortable task'
                                )}
                                testIdPrefix="sortable-task"
                            >
                                {renderTaskItem(task)}
                            </SortableItem>
                        </div>
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
};

export default TaskList;
