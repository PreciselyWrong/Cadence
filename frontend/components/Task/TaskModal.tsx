import React from 'react';
import { Task } from '../../entities/Task';
import EntitySidePanel from '../SidePanel/EntitySidePanel';
import { useTaskEditor } from './useTaskEditor';
import {
    SaveIndicator,
    TaskEditorBody,
    TaskEditorFooter,
} from './TaskEditorBody';

interface TaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: Task;
    onSaved?: (task: Task) => void;
}

// Edits a task in the side panel with the inline editor: title, a chip per
// field, description in place, subtasks, attachments and comments. Relations
// stay on the task page.
const TaskModal: React.FC<TaskModalProps> = ({
    isOpen,
    onClose,
    task: initialTask,
    onSaved,
}) => {
    const ed = useTaskEditor(initialTask, onSaved, isOpen);

    return (
        <EntitySidePanel
            isOpen={isOpen}
            onClose={() => {
                ed.flush();
                onClose();
            }}
            eyebrow={ed.t('taskPanel.eyebrow', 'Task')}
            title={ed.task.name || ed.t('task.untitled', 'Untitled task')}
            error={ed.error}
            testId="task-panel"
            headerExtra={<SaveIndicator state={ed.state} />}
            footer={<TaskEditorFooter ed={ed} />}
        >
            <TaskEditorBody ed={ed} />
        </EntitySidePanel>
    );
};

export default TaskModal;
