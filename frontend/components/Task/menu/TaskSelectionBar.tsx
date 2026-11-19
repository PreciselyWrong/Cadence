import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { addDays, format, nextMonday } from 'date-fns';
import { CheckIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Button, { IconButton } from '../../Shared/ui/Button';
import Menu, { MenuEntry } from '../../Shared/ui/Menu';
import { PriorityType } from '../../../entities/Task';
import { useStore } from '../../../store/useStore';
import { useTaskSelection } from '../../../store/taskSelectionStore';
import { useBulkTaskActions } from '../../../hooks/useBulkTaskActions';

const ymd = (date: Date) => format(date, 'yyyy-MM-dd');
const PROJECT_DONE = new Set(['done', 'cancelled', 'archived']);

/**
 * Shown while tasks are selected in a list (Ctrl/Cmd click, Shift click):
 * one action for all of them, with one undo. Escape or a page change clears
 * the selection. Mounted once in the layout.
 */
const TaskSelectionBar: React.FC = () => {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const uids = useTaskSelection((state) => state.uids);
    const clear = useTaskSelection((state) => state.clear);
    const projects = useStore((state) => state.projectsStore.projects);
    const bulk = useBulkTaskActions();
    const count = uids.length;

    useEffect(() => {
        clear();
    }, [pathname, clear]);

    useEffect(() => {
        if (count === 0) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') clear();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [count, clear]);

    if (count === 0) return null;

    // Each action runs on the uids of this moment; the bar goes away at once.
    const run = (action: (picked: string[]) => Promise<unknown>) => () => {
        const picked = [...uids];
        clear();
        void action(picked);
    };

    const now = new Date();
    const dates: MenuEntry[] = [
        {
            key: 'today',
            label: t('tasks.contextMenu.today', 'Today'),
            onSelect: run((picked) => bulk.setDue(picked, ymd(now))),
        },
        {
            key: 'tomorrow',
            label: t('tasks.contextMenu.tomorrow', 'Tomorrow'),
            onSelect: run((picked) =>
                bulk.setDue(picked, ymd(addDays(now, 1)))
            ),
        },
        {
            key: 'nextWeek',
            label: t('tasks.contextMenu.nextWeek', 'Next week'),
            onSelect: run((picked) =>
                bulk.setDue(picked, ymd(nextMonday(now)))
            ),
        },
        'separator',
        {
            key: 'clear',
            label: t('tasks.contextMenu.clearDate', 'Clear date'),
            onSelect: run((picked) => bulk.setDue(picked, null)),
        },
    ];
    const priorities: { value: PriorityType; label: string }[] = [
        { value: 'high', label: t('priority.high', 'High') },
        { value: 'medium', label: t('priority.medium', 'Medium') },
        { value: 'low', label: t('priority.low', 'Low') },
        { value: null, label: t('priority.none', 'None') },
    ];
    const projectEntries: MenuEntry[] = [
        {
            key: 'none',
            label: t('tasks.noProject', 'No project'),
            onSelect: run((picked) => bulk.moveTo(picked, null)),
        },
        ...projects
            .filter(
                (project) =>
                    !PROJECT_DONE.has(
                        (project as { status?: string }).status ?? ''
                    )
            )
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((project) => ({
                key: `project-${project.uid ?? project.id}`,
                label: project.name,
                onSelect: run((picked) =>
                    bulk.moveTo(picked, project.id ?? null)
                ),
            })),
    ];

    const menuButton = (
        label: string,
        entries: MenuEntry[],
        testId: string
    ) => (
        <Menu
            entries={entries}
            align="start"
            testId={testId}
            trigger={(props) => (
                <Button {...props} variant="ghost">
                    {label}
                </Button>
            )}
        />
    );

    return (
        <div
            role="toolbar"
            aria-label={t('tasks.selection.label', 'Selected tasks')}
            data-testid="task-selection-bar"
            className="fixed bottom-6 left-1/2 z-[65] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-2xl bg-surface p-1.5 shadow-xl ring-1 ring-outline-variant/70 dark:bg-surface-card"
        >
            <span className="whitespace-nowrap px-2 text-body-m font-medium text-surface-on">
                {t('tasks.selection.count', 'Selected: {{count}}', { count })}
            </span>
            <Button
                variant="ghost"
                icon={<CheckIcon className="h-4 w-4" />}
                onClick={run(bulk.complete)}
            >
                {t('tasks.contextMenu.complete', 'Complete')}
            </Button>
            {menuButton(
                t('tasks.contextMenu.date', 'Date'),
                dates,
                'selection-date'
            )}
            {menuButton(
                t('tasks.contextMenu.priority', 'Priority'),
                priorities.map((option) => ({
                    key: `priority-${option.value ?? 'none'}`,
                    label: option.label,
                    onSelect: run((picked) =>
                        bulk.setPriority(picked, option.value)
                    ),
                })),
                'selection-priority'
            )}
            {menuButton(
                t('tasks.contextMenu.moveToProject', 'Move to project'),
                projectEntries,
                'selection-project'
            )}
            <Button
                variant="ghost"
                className="!text-danger"
                icon={<TrashIcon className="h-4 w-4" />}
                onClick={run(bulk.remove)}
                data-testid="selection-delete"
            >
                {t('common.delete', 'Delete')}
            </Button>
            <IconButton
                label={t('tasks.selection.clear', 'Clear the selection')}
                onClick={clear}
            >
                <XMarkIcon />
            </IconButton>
        </div>
    );
};

export default TaskSelectionBar;
