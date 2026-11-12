import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { fetchTaskByUid } from '../../utils/tasksService';
import { useToast } from '../Shared/ToastContext';
import { useTaskPanel } from '../../store/taskPanelStore';
import TaskModal from './TaskModal';
import { useLocation } from 'react-router-dom';
import { canShowTaskPane, useTaskPane } from '../../contexts/TaskPaneContext';

const TaskPanelHost: React.FC = () => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const uid = useTaskPanel((state) => state.uid);
    const occurrenceDate = useTaskPanel((state) => state.occurrenceDate);
    const close = useTaskPanel((state) => state.close);
    const [task, setTask] = useState<Task | null>(null);
    const location = useLocation();
    const { openTask } = useTaskPane();
    // One sheet for every page: a task opened by uid goes to the floating
    // sheet. A later occurrence of a series (edited alone) and the task and
    // habit pages, where the sheet does not show, keep the dialog.
    const toSheet =
        !!uid &&
        !occurrenceDate &&
        canShowTaskPane(location.pathname, `?task=${uid}`);

    useEffect(() => {
        if (!toSheet || !uid) return;
        openTask(uid);
        close();
    }, [toSheet, uid]);

    useEffect(() => {
        if (!uid || toSheet) {
            setTask(null);
            return;
        }
        let cancelled = false;
        fetchTaskByUid(uid)
            .then((fresh) => {
                if (cancelled) return;
                setTask(
                    occurrenceDate && occurrenceDate !== fresh.due_date
                        ? {
                              ...fresh,
                              due_date: occurrenceDate,
                              is_virtual_occurrence: true,
                          }
                        : fresh
                );
            })
            .catch(() => {
                if (cancelled) return;
                showErrorToast(t('api.errors.taskNotFound', 'Task not found.'));
                close();
            });
        return () => {
            cancelled = true;
        };
    }, [uid, occurrenceDate, toSheet]);

    if (!uid || !task || task.uid !== uid) return null;

    return <TaskModal isOpen onClose={close} task={task} />;
};

export default TaskPanelHost;
