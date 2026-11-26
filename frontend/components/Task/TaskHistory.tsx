import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClockIcon } from '@heroicons/react/24/outline';
import TaskTimeline from './TaskTimeline';

interface TaskHistoryProps {
    taskUid: string;
}

// What happened to the task and who did it, behind one quiet button: the
// history is read when a task's origin is unclear, not on every open.
const TaskHistory: React.FC<TaskHistoryProps> = ({ taskUid }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    return (
        <section className="space-y-2">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className="inline-flex min-h-[40px] items-center gap-1.5 self-start rounded-lg px-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
                <ClockIcon className="h-4 w-4" aria-hidden="true" />
                {t('timeline.history', 'History')}
            </button>
            {open && (
                <div className="px-2">
                    <TaskTimeline taskUid={taskUid} />
                </div>
            )}
        </section>
    );
};

export default TaskHistory;
