import { format } from 'date-fns';
import { TASK_STATUS } from '../../constants/taskStatus';

// The task an empty calendar hour creates: due on that day at that hour.
export const slotTaskInput = (name: string, start: Date) => ({
    name: name.trim(),
    due_date: format(start, 'yyyy-MM-dd'),
    due_time: format(start, 'HH:mm'),
    status: TASK_STATUS.NOT_STARTED,
    completed_at: null,
});
