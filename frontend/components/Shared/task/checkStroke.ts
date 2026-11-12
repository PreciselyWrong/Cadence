import { Task } from '../../../entities/Task';
import { PriorityLevel, toPriorityLevel } from '../PriorityBadge';

// The one colour signal of a task's checkbox, on every list, card and
// calendar block (Today's rule): high priority strokes red, every other
// level stays neutral. Priority is never shown in orange or blue here.
export const CHECK_STROKE: Readonly<Record<PriorityLevel | 'none', string>> = {
    high: 'border-danger',
    medium: 'border-outline',
    low: 'border-outline',
    none: 'border-outline',
};

export const checkStrokeClass = (priority: Task['priority']): string =>
    CHECK_STROKE[toPriorityLevel(priority) ?? 'none'];
