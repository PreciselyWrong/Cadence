import React from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { ViewType } from '../../utils/profileService';
import { useIsMinimal } from '../../hooks/useUiDensity';
import { useViewType } from '../../hooks/useViewType';
import { useTaskPane } from '../../contexts/TaskPaneContext';
import {
    isRecurringScopeCancelled,
    isRecurringTask,
    moveTaskDue,
    saveTaskEdit,
} from '../../utils/recurringScope';
import TaskPriorityBoard, { BoardPriority } from './TaskPriorityBoard';
import TaskMonthCalendar from './TaskMonthCalendar';
import Segmented from '../Shared/ui/Segmented';

interface ViewTypeSwitchProps {
    value: ViewType;
    onChange: (next: ViewType) => void;
    // The choices offered, in order (default: List / Board / Calendar).
    keys?: ViewType[];
}

// The view switch of a page (List / Board / Calendar, or the given choices),
// on the shared Segmented control.
export const ViewTypeSwitch: React.FC<ViewTypeSwitchProps> = ({
    value,
    onChange,
    keys = ['list', 'board', 'calendar'],
}) => {
    const { t } = useTranslation();
    const labels: Record<ViewType, string> = {
        list: t('viewType.list', 'List'),
        board: t('viewType.board', 'Board'),
        calendar: t('viewType.calendar', 'Calendar'),
        outline: t('outline.title', 'Outline'),
        gallery: t('viewType.gallery', 'Gallery'),
    };
    return (
        <Segmented
            aria-label={t('viewType.label', 'View')}
            data-testid="view-type-switch"
            options={keys.map((key) => ({
                id: key,
                label: labels[key],
                testId: `view-type-${key}`,
            }))}
            selected={value}
            onSelect={(id) => onChange(id as ViewType)}
        />
    );
};

interface TaskViewBodyProps {
    // `view:<uid>`, `tag:<name>`, `project:<uid>` or `tasks`.
    viewKey: string;
    tasks: Task[];
    // Saves a whole task (used for priority and due date changes from the board
    // and the calendar).
    onTaskUpdate: (task: Task) => void | Promise<void>;
    // The list, shown for the List choice and always in Dense.
    children: React.ReactNode;
}

const MinimalTaskViewBody: React.FC<TaskViewBodyProps> = ({
    viewKey,
    tasks,
    onTaskUpdate,
    children,
}) => {
    const { viewType, setViewType } = useViewType(viewKey);
    const { openTask } = useTaskPane();

    // A recurring task asks which occurrences the change reaches, then the
    // page takes the task that holds the changed one.
    const saveRecurring = (change: Promise<Task>) =>
        void change
            .then((saved) => onTaskUpdate(saved))
            .catch((error) => {
                if (!isRecurringScopeCancelled(error)) {
                    console.error('Failed to update recurring task:', error);
                }
            });

    const changePriority = (task: Task, priority: BoardPriority) => {
        if (!isRecurringTask(task)) {
            void onTaskUpdate({ ...task, priority });
            return;
        }
        saveRecurring(saveTaskEdit(task, { priority }));
    };

    const moveDue = (task: Task, dueDate: string) => {
        if (!isRecurringTask(task)) {
            void onTaskUpdate({ ...task, due_date: dueDate });
            return;
        }
        saveRecurring(moveTaskDue(task, { due_date: dueDate }));
    };

    return (
        <div className="space-y-4" data-testid="task-view-body">
            <ViewTypeSwitch value={viewType} onChange={setViewType} />
            {viewType === 'board' ? (
                <TaskPriorityBoard
                    tasks={tasks}
                    onChangePriority={changePriority}
                    onOpenTask={(task) => task.uid && openTask(task.uid)}
                />
            ) : viewType === 'calendar' ? (
                <TaskMonthCalendar
                    tasks={tasks}
                    onOpenTask={(task) => task.uid && openTask(task.uid)}
                    onMoveDue={moveDue}
                />
            ) : (
                children
            )}
        </div>
    );
};

// Wraps a task list. In Minimal it adds the List / Board / Calendar switch,
// remembered per view; in Dense the list is rendered unchanged.
const TaskViewBody: React.FC<TaskViewBodyProps> = (props) => {
    const isMinimal = useIsMinimal();
    if (!isMinimal) return <>{props.children}</>;
    return <MinimalTaskViewBody {...props} />;
};

export default TaskViewBody;
