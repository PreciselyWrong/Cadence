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
import { NativeTaskDragContext, useSidebarDrop } from '../Sidebar/sidebarDrop';

interface TaskListProps {
    tasks: Task[];
    onTaskUpdate: (task: Task) => Promise<void>;
    onTaskCompletionToggle?: (task: Task) => void;
    onTaskCreate?: (task: Task) => void;
    onTaskDelete: (taskUid: string) => void;
    projects: Project[];
    hideProjectName?: boolean;
    hideAreaName?: boolean;
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
    hideAreaName = false,
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
    const sidebarDrop = useSidebarDrop();

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
            hideAreaName={hideAreaName}
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
                <p className="text-gray-600 dark:text-gray-300 text-center mt-4">
                    No tasks available.
                </p>
            </div>
        );
    }

    const sortable = !!onReorder && filteredTasks.every((task) => task.uid);

    // Rows of a list without reordering drag natively onto the sidebar.
    if (!sortable) {
        return (
            <NativeTaskDragContext.Provider value={true}>
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
            </NativeTaskDragContext.Provider>
        );
    }

    const uids = filteredTasks.map((task) => task.uid as string);

    const dragItem = (id: unknown) => {
        const task = filteredTasks.find((item) => item.uid === id);
        return task ? ({ kind: 'task', task } as const) : null;
    };

    // The sidebar row under the pointer lights up while dragging.
    const handleDragMove = (event: DragMoveEvent) =>
        sidebarDrop.dragMove(event, dragItem(event.active.id));

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        resetSortableCursor();
        // Released over a sidebar row: the task takes it (project, tag, area,
        // day) and keeps its place in this list.
        if (sidebarDrop.dragEnd(event, dragItem(active.id))) return;
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
            onDragCancel={() => {
                sortableCursorHandlers.onDragCancel();
                sidebarDrop.dragCancel();
            }}
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
