import { useTranslation } from 'react-i18next';
import type { MenuEntry } from '../../Shared/ui/Menu';
import { Task } from '../../../entities/Task';
import {
    decideTask,
    isParked,
    TaskDecision,
} from '../../../utils/reviewService';
import { isCurrentWeek } from '../../Review/TaskDecisionRow';
import { useToast } from '../../Shared/ToastContext';
import { useNextAction } from '../../../contexts/NextActionContext';
import { isTaskCompleted } from '../../../constants/taskStatus';

// The review toggles of a task row's menu (In view, This week, Later) and,
// on a project page, Next action. `onSaved` gets the task as saved.
export const useReviewMenuEntries = (
    task: Task,
    onSaved: (task: Task) => Promise<void> | void
): MenuEntry[] => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const nextAction = useNextAction();
    if (!task.uid) return [];
    const uid = task.uid;
    const parked = isParked(task);
    const thisWeek = isCurrentWeek(task.week_of);

    const decide = async (decision: TaskDecision) => {
        try {
            const updated = await decideTask(uid, decision);
            await onSaved({
                ...task,
                ...updated,
                subtasks: updated.subtasks || task.subtasks || [],
            });
        } catch (error) {
            console.error('Review decision failed:', error);
            showErrorToast(
                t('review.saveError', 'Could not save the decision.')
            );
        }
    };

    const entries: MenuEntry[] = [];
    if (!parked) {
        entries.push(
            {
                key: 'inView',
                label: t('review.actions.inView', 'In view'),
                checked: Boolean(task.in_view),
                onSelect: () => void decide({ in_view: !task.in_view }),
            },
            {
                key: 'thisWeek',
                label: t('review.actions.thisWeek', 'This week'),
                checked: thisWeek,
                onSelect: () =>
                    void decide({ week_of: thisWeek ? null : 'this_week' }),
            }
        );
    }
    entries.push({
        key: 'later',
        label: t('review.actions.later', 'Later'),
        checked: parked,
        onSelect: () =>
            void decide(
                parked ? { later: false, review_on: null } : { later: true }
            ),
    });
    // Only on a project page, for an open task of the project itself.
    if (nextAction && !task.parent_task_id && !isTaskCompleted(task.status)) {
        const isNext = nextAction.nextTaskUid === uid;
        entries.push({
            key: 'nextAction',
            label: t('project.nextAction', 'Next action'),
            checked: isNext,
            onSelect: () =>
                void Promise.resolve(
                    nextAction.setNextAction(isNext ? null : uid)
                ).catch(() => {}),
        });
    }
    return [
        {
            key: 'review',
            label: t('tasks.contextMenu.review', 'Review'),
            submenu: entries,
            testId: 'task-menu-review',
        },
    ];
};
