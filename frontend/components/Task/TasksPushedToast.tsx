import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../Shared/ToastContext';
import {
    PushedTask,
    TASKS_PUSHED_EVENT,
    fetchTaskByUid,
} from '../../utils/tasksService';
import { TASK_UPDATED_EVENT } from '../../contexts/TaskPaneContext';
import { Task } from '../../entities/Task';

const SHOWN_NAMES = 3;

// Says which blocked tasks a save pushed later, whatever page made it,
// and hands their new dates to the lists that show them.
const TasksPushedToast: React.FC = () => {
    const { t } = useTranslation();
    const { showSuccessToast } = useToast();

    useEffect(() => {
        const onPushed = (event: Event) => {
            const pushed = (event as CustomEvent<PushedTask[]>).detail || [];
            if (pushed.length === 0) return;
            pushed.forEach((task) => {
                fetchTaskByUid(task.uid)
                    .then((fresh) =>
                        window.dispatchEvent(
                            new CustomEvent<Task>(TASK_UPDATED_EVENT, {
                                detail: fresh,
                            })
                        )
                    )
                    .catch(() => undefined);
            });
            const names = pushed
                .slice(0, SHOWN_NAMES)
                .map((task) => task.name)
                .join(', ');
            showSuccessToast(
                t(
                    'dependencies.pushed',
                    'Following tasks moved later: {{names}}',
                    {
                        names:
                            pushed.length > SHOWN_NAMES ? `${names}…` : names,
                    }
                )
            );
        };
        window.addEventListener(TASKS_PUSHED_EVENT, onPushed);
        return () => window.removeEventListener(TASKS_PUSHED_EVENT, onPushed);
    }, [showSuccessToast, t]);

    return null;
};

export default TasksPushedToast;
