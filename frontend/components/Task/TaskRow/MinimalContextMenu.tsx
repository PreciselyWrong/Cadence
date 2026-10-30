import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { MapPinIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Task, PriorityType } from '../../../entities/Task';
import { Project } from '../../../entities/Project';
import {
    getTodayDateString,
    getTomorrowDateString,
    toLocalDateString,
} from '../../../utils/dateUtils';
import { useTaskRowSave } from './useTaskRowSave';
import { TASK_UPDATED_EVENT } from '../../../contexts/TaskPaneContext';
import {
    decideTask,
    isParked,
    TaskDecision,
} from '../../../utils/reviewService';
import { isCurrentWeek } from '../../Review/TaskDecisionRow';
import { useToast } from '../../Shared/ToastContext';

const VIEWPORT_MARGIN = 8;

// The next Monday after today (a Monday today gives the Monday after).
const getNextWeekDateString = (): string => {
    const today = new Date();
    const delta = (1 - today.getDay() + 7) % 7 || 7;
    today.setDate(today.getDate() + delta);
    return toLocalDateString(today);
};

interface MinimalContextMenuProps {
    x: number;
    y: number;
    task: Task;
    projects: Project[];
    // Saves the change and tells the list; the row passes its own handler.
    onTaskUpdate: (task: Task) => Promise<void>;
    // Opens the row's delete confirmation.
    onDelete: () => void;
    onClose: () => void;
}

const itemClass =
    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors';

const selectedClass = 'font-medium text-blue-600 dark:text-blue-400';

// Right-click menu for a minimal task row. Each choice saves through the same
// setters as the inline quick edits, so errors show the same toast.
const MinimalContextMenu: React.FC<MinimalContextMenuProps> = ({
    x,
    y,
    task,
    projects,
    onTaskUpdate,
    onDelete,
    onClose,
}) => {
    const { t } = useTranslation();
    // Like the detail pane, announce a saved task so lists that merge it
    // from the event stay in step.
    const saveAndAnnounce = useCallback(
        async (updated: Task) => {
            window.dispatchEvent(
                new CustomEvent<Task>(TASK_UPDATED_EVENT, { detail: updated })
            );
            await onTaskUpdate(updated);
        },
        [onTaskUpdate]
    );
    const setters = useTaskRowSave(task, saveAndAnnounce);
    const { showErrorToast } = useToast();
    const parked = isParked(task);
    const thisWeek = isCurrentWeek(task.week_of);
    const decide = async (decision: TaskDecision) => {
        if (!task.uid) return;
        try {
            const updated = await decideTask(task.uid, decision);
            await saveAndAnnounce({
                ...task,
                ...updated,
                subtasks: updated.subtasks || task.subtasks || [],
            });
        } catch (error) {
            showErrorToast(
                t('review.saveError', 'Could not save the decision.')
            );
            throw error;
        }
    };
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ left: x, top: y });

    // Keep the menu on screen: flip it back inside the viewport when the
    // cursor is near the right or bottom edge.
    useLayoutEffect(() => {
        const el = menuRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const maxLeft = window.innerWidth - rect.width - VIEWPORT_MARGIN;
        const maxTop = window.innerHeight - rect.height - VIEWPORT_MARGIN;
        setPosition({
            left: Math.max(VIEWPORT_MARGIN, Math.min(x, maxLeft)),
            top: Math.max(VIEWPORT_MARGIN, Math.min(y, maxTop)),
        });
    }, [x, y]);

    useEffect(() => {
        const onPointerDown = (e: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node)
            ) {
                onClose();
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [onClose]);

    const run = (action: () => Promise<void>) => {
        onClose();
        void action().catch(() => {});
    };

    const priorities: { value: PriorityType; label: string }[] = [
        { value: null, label: t('priority.none', 'None') },
        { value: 'low', label: t('priority.low', 'Low') },
        { value: 'medium', label: t('priority.medium', 'Medium') },
        { value: 'high', label: t('priority.high', 'High') },
    ];
    const currentPriority = (task.priority as PriorityType) ?? null;

    const dateOptions: { key: string; label: string; date: string | null }[] = [
        {
            key: 'today',
            label: t('tasks.contextMenu.today', 'Today'),
            date: getTodayDateString(),
        },
        {
            key: 'tomorrow',
            label: t('tasks.contextMenu.tomorrow', 'Tomorrow'),
            date: getTomorrowDateString(),
        },
        {
            key: 'nextWeek',
            label: t('tasks.contextMenu.nextWeek', 'Next week'),
            date: getNextWeekDateString(),
        },
        {
            key: 'clear',
            label: t('tasks.contextMenu.clearDate', 'Clear date'),
            date: null,
        },
    ];

    const sortedProjects = [...projects].sort((a, b) =>
        a.name.localeCompare(b.name)
    );

    const sectionLabel =
        'px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500';

    return createPortal(
        <div
            ref={menuRef}
            role="menu"
            aria-label={t('tasks.contextMenu.label', 'Task actions')}
            data-testid="minimal-task-context-menu"
            className="fixed z-[10002] max-h-[80vh] w-56 overflow-y-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10"
            style={{ left: position.left, top: position.top }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className={sectionLabel}>
                {t('tasks.contextMenu.priority', 'Priority')}
            </div>
            {priorities.map((option) => (
                <button
                    key={option.label}
                    type="button"
                    role="menuitemradio"
                    aria-checked={currentPriority === option.value}
                    onClick={() => run(() => setters.setPriority(option.value))}
                    className={`${itemClass} ${
                        currentPriority === option.value ? selectedClass : ''
                    }`}
                >
                    {option.label}
                </button>
            ))}

            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            <div className={sectionLabel}>
                {t('tasks.contextMenu.date', 'Date')}
            </div>
            {dateOptions.map((option) => (
                <button
                    key={option.key}
                    type="button"
                    role="menuitem"
                    onClick={() => run(() => setters.setDue(option.date, null))}
                    className={itemClass}
                >
                    {option.label}
                </button>
            ))}

            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            <div className={sectionLabel}>
                {t('tasks.contextMenu.moveToProject', 'Move to project')}
            </div>
            <button
                type="button"
                role="menuitem"
                onClick={() => run(() => setters.setProject(null))}
                className={`${itemClass} ${
                    task.project_id ? '' : selectedClass
                }`}
            >
                {t('tasks.noProject', 'No project')}
            </button>
            {sortedProjects.map((project) => (
                <button
                    key={project.uid ?? project.id}
                    type="button"
                    role="menuitem"
                    onClick={() =>
                        run(() => setters.setProject(project.id ?? null))
                    }
                    className={`${itemClass} ${
                        task.project_id === project.id ? selectedClass : ''
                    }`}
                >
                    <span className="truncate">{project.name}</span>
                </button>
            ))}

            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            {!parked && (
                <>
                    <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={Boolean(task.in_view)}
                        onClick={() =>
                            run(() => decide({ in_view: !task.in_view }))
                        }
                        className={`${itemClass} ${
                            task.in_view ? selectedClass : ''
                        }`}
                    >
                        {t('review.actions.inView', 'In view')}
                    </button>
                    <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={thisWeek}
                        onClick={() =>
                            run(() =>
                                decide({
                                    week_of: thisWeek ? null : 'this_week',
                                })
                            )
                        }
                        className={`${itemClass} ${
                            thisWeek ? selectedClass : ''
                        }`}
                    >
                        {t('review.actions.thisWeek', 'This week')}
                    </button>
                </>
            )}
            <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={parked}
                onClick={() =>
                    run(() =>
                        decide(
                            parked
                                ? { later: false, review_on: null }
                                : { later: true }
                        )
                    )
                }
                className={`${itemClass} ${parked ? selectedClass : ''}`}
            >
                {t('review.actions.later', 'Later')}
            </button>
            <button
                type="button"
                role="menuitem"
                onClick={() => run(() => setters.setPinned(!task.pinned))}
                className={itemClass}
            >
                <MapPinIcon className="h-4 w-4" aria-hidden="true" />
                {task.pinned ? t('task.unpin', 'Unpin') : t('task.pin', 'Pin')}
            </button>
            <button
                type="button"
                role="menuitem"
                onClick={() => {
                    onClose();
                    onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
            >
                <TrashIcon className="h-4 w-4" aria-hidden="true" />
                {t('common.delete', 'Delete')}
            </button>
        </div>,
        document.body
    );
};

export default MinimalContextMenu;
