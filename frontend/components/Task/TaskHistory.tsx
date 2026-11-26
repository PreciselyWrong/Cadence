import React from 'react';
import { useTranslation } from 'react-i18next';
import TaskTimeline from './TaskTimeline';

interface TaskHistoryProps {
    taskUid: string;
}

// What happened to the task and who did it. The sheet opens it from its
// foot bar: it is read when a task's origin is unclear, not on every open.
const TaskHistory: React.FC<TaskHistoryProps> = ({ taskUid }) => {
    const { t } = useTranslation();

    return (
        <section aria-label={t('timeline.history', 'History')} className="px-1">
            <TaskTimeline taskUid={taskUid} />
        </section>
    );
};

export default TaskHistory;
