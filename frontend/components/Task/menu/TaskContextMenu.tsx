import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format, nextMonday } from 'date-fns';
import { ContextMenu, MenuEntry } from '../../Shared/ui/Menu';
import { useToast } from '../../Shared/ToastContext';
import { Task } from '../../../entities/Task';
import { useStore } from '../../../store/useStore';
import { useTaskActions } from '../../../hooks/useTaskActions';
import { useTaskPane } from '../../../contexts/TaskPaneContext';
import { getBasePath } from '../../../config/paths';
import { taskMenuEntries } from './taskMenuEntries';
import { TurnIntoProjectDialog } from '../TurnIntoProject';

export interface TaskContextMenuProps {
    task: Task;
    x: number;
    y: number;
    onClose: () => void;
    // The page's own actions, shown first.
    lead?: MenuEntry[];
    // The page's own toggles, shown after Pin.
    extra?: MenuEntry[];
    // A row that keeps its own state (undo of a completion, hidden row on
    // delete) passes its handlers; the others go through the shared actions.
    onOpen?: () => void;
    onToggle?: () => void;
    onDelete?: () => void;
    // Gets the task as saved after each change made from the menu.
    onSaved?: (task: Task) => void;
}

const ymd = (date: Date) => format(date, 'yyyy-MM-dd');

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

// React carries the events of the menu's portals up to the row or card that
// opened it: a click, key or press there must not open, toggle or drag it.
const Isolated: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div
        className="contents"
        onClick={stop}
        onDoubleClick={stop}
        onKeyDown={stop}
        onPointerDown={stop}
        onMouseDown={stop}
        onContextMenu={stop}
    >
        {children}
    </div>
);

// Loaded on first use: the date popover pulls the locale and i18n setup.
const DatePickerAt = lazy(() => import('./DatePickerAt'));

export const taskLink = (uid: string): string =>
    `${window.location.origin}${getBasePath()}/task/${uid}`;

/**
 * The one task menu, opened at a point (right click, long press). Choices
 * save through `useTaskActions`, which tells every list showing the task.
 */
const TaskContextMenu: React.FC<TaskContextMenuProps> = ({
    task,
    x,
    y,
    onClose,
    lead,
    extra,
    onOpen,
    onToggle,
    onDelete,
    onSaved,
}) => {
    const { t } = useTranslation();
    const { showSuccessToast, showErrorToast } = useToast();
    const actions = useTaskActions();
    const { openTask } = useTaskPane();
    const projects = useStore((state) => state.projectsStore.projects);
    const [menuOpen, setMenuOpen] = useState(true);
    // A choice that needs a second step: the date popover or a question.
    const [step, setStep] = useState<'date' | 'project' | null>(null);
    const uid = task.uid as string;

    // The menu closes before its choice runs: a second step replaces it
    // instead of closing everything.
    useEffect(() => {
        if (!menuOpen && !step) onClose();
    }, [menuOpen, step, onClose]);

    const copy = async (text: string, done: string) => {
        try {
            await navigator.clipboard.writeText(text);
            showSuccessToast(done);
        } catch {
            showErrorToast(t('tasks.contextMenu.copyError', 'Could not copy'));
        }
    };

    const report = (change: Promise<Task | null>) =>
        void change.then((saved) => {
            if (saved) onSaved?.(saved);
        });

    const now = new Date();
    const entries = taskMenuEntries({
        task,
        projects,
        lead,
        extra,
        today: ymd(now),
        tomorrow: ymd(addDays(now, 1)),
        nextWeek: ymd(nextMonday(now)),
        t,
        handlers: {
            open: onOpen ?? (() => openTask(uid)),
            toggle: onToggle ?? (() => report(actions.toggle(uid))),
            setDue: (date) => report(actions.setDue(uid, date)),
            pickDate: () => setStep('date'),
            turnIntoProject: () => setStep('project'),
            setPriority: (priority) =>
                report(actions.setPriority(uid, priority)),
            moveTo: (projectId) =>
                report(actions.moveToProjectUndoable(uid, projectId)),
            setPinned: (pinned) => report(actions.setPinned(uid, pinned)),
            duplicate: () => void actions.duplicate(uid),
            copyLink: () =>
                void copy(
                    taskLink(uid),
                    t('tasks.contextMenu.linkCopied', 'Link copied')
                ),
            copyTitle: () =>
                void copy(
                    task.name,
                    t('tasks.contextMenu.titleCopied', 'Title copied')
                ),
            remove:
                onDelete ?? (() => void actions.removeWithUndo(uid, task.name)),
        },
    });

    if (step === 'project') {
        return (
            <Isolated>
                <TurnIntoProjectDialog
                    task={task}
                    onClose={() => setStep(null)}
                />
            </Isolated>
        );
    }
    if (step === 'date') {
        return (
            <Isolated>
                <Suspense fallback={null}>
                    <DatePickerAt
                        x={x}
                        y={y}
                        label={t('tasks.contextMenu.pickDate', 'Pick a date…')}
                        value={{
                            date: task.due_date?.slice(0, 10) ?? null,
                            time: task.due_time ?? null,
                        }}
                        onPick={(date, time) =>
                            report(actions.setDue(uid, date, time))
                        }
                        onClose={() => setStep(null)}
                    />
                </Suspense>
            </Isolated>
        );
    }
    if (!menuOpen) return null;
    return (
        <Isolated>
            <ContextMenu
                entries={entries}
                x={x}
                y={y}
                testId="task-context-menu"
                onClose={() => setMenuOpen(false)}
            />
        </Isolated>
    );
};

export default TaskContextMenu;
