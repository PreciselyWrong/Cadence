import type { TFunction } from 'i18next';
import type { MenuEntry } from '../../Shared/ui/Menu';
import type { PriorityType, Task } from '../../../entities/Task';
import type { Project } from '../../../entities/Project';
import { isTaskDone } from '../../../constants/taskStatus';
import { isTodoMdTask } from '../../../utils/todoMd';
import { canBecomeProject } from '../TurnIntoProject';

// The actions the one task menu runs; each page passes its own.
export interface TaskMenuHandlers {
    open: () => void;
    toggle: () => void;
    setDue: (date: string | null) => void;
    pickDate: () => void;
    setPriority: (priority: PriorityType) => void;
    moveTo: (projectId: number | null) => void;
    setPinned: (pinned: boolean) => void;
    duplicate: () => void;
    copyLink: () => void;
    copyTitle: () => void;
    turnIntoProject: () => void;
    remove: () => void;
}

export interface TaskMenuInput {
    task: Task;
    projects: Project[];
    handlers: TaskMenuHandlers;
    // The page's own actions, shown first (Today: plan, take off the day).
    lead?: MenuEntry[];
    // Extra toggles of the page, shown after Pin (review decisions).
    extra?: MenuEntry[];
    today: string;
    tomorrow: string;
    nextWeek: string;
    t: TFunction;
}

const PROJECT_DONE = new Set(['done', 'cancelled', 'archived']);

// The one menu of a task, the same on every page: right click, the row's
// "⋯" and the long press all show it. A TODO.md task keeps its words and
// place in its file, so it offers neither duplicate nor delete.
export const taskMenuEntries = ({
    task,
    projects,
    handlers: h,
    lead = [],
    extra = [],
    today,
    tomorrow,
    nextWeek,
    t,
}: TaskMenuInput): MenuEntry[] => {
    const done = isTaskDone(task.status);
    const fileBacked = isTodoMdTask(task);
    const due = task.due_date?.slice(0, 10) ?? null;
    const priority = (task.priority as PriorityType) ?? null;

    const dates: MenuEntry[] = [
        {
            key: 'today',
            label: t('tasks.contextMenu.today', 'Today'),
            checked: due === today ? true : undefined,
            onSelect: () => h.setDue(today),
        },
        {
            key: 'tomorrow',
            label: t('tasks.contextMenu.tomorrow', 'Tomorrow'),
            checked: due === tomorrow ? true : undefined,
            onSelect: () => h.setDue(tomorrow),
        },
        {
            key: 'nextWeek',
            label: t('tasks.contextMenu.nextWeek', 'Next week'),
            checked: due === nextWeek ? true : undefined,
            onSelect: () => h.setDue(nextWeek),
        },
        {
            key: 'pick',
            label: t('tasks.contextMenu.pickDate', 'Pick a date…'),
            onSelect: h.pickDate,
        },
    ];
    if (due) {
        dates.push('separator', {
            key: 'clear',
            label: t('tasks.contextMenu.clearDate', 'Clear date'),
            onSelect: () => h.setDue(null),
        });
    }

    const priorities: { value: PriorityType; label: string }[] = [
        { value: 'high', label: t('priority.high', 'High') },
        { value: 'medium', label: t('priority.medium', 'Medium') },
        { value: 'low', label: t('priority.low', 'Low') },
        { value: null, label: t('priority.none', 'None') },
    ];

    const openProjects = projects
        .filter(
            (project) =>
                project.id === task.project_id ||
                !PROJECT_DONE.has((project as { status?: string }).status ?? '')
        )
        .sort((a, b) => a.name.localeCompare(b.name));

    const entries: MenuEntry[] = [...lead];
    if (lead.length) entries.push('separator');
    entries.push(
        {
            key: 'open',
            label: t('tasks.contextMenu.open', 'Open'),
            hint: '↵',
            onSelect: h.open,
            testId: 'task-menu-open',
        },
        {
            key: 'toggle',
            label: done
                ? t('tasks.contextMenu.reopen', 'Reopen')
                : t('tasks.contextMenu.complete', 'Complete'),
            hint: 'X',
            onSelect: h.toggle,
            testId: 'task-menu-toggle',
        },
        'separator',
        {
            key: 'date',
            label: t('tasks.contextMenu.date', 'Date'),
            submenu: dates,
            testId: 'task-menu-date',
        },
        {
            key: 'priority',
            label: t('tasks.contextMenu.priority', 'Priority'),
            submenu: priorities.map((option) => ({
                key: `priority-${option.value ?? 'none'}`,
                label: option.label,
                checked: priority === option.value ? true : undefined,
                onSelect: () => h.setPriority(option.value),
            })),
            testId: 'task-menu-priority',
        }
    );
    if (!fileBacked) {
        entries.push({
            key: 'project',
            label: t('tasks.contextMenu.moveToProject', 'Move to project'),
            submenu: [
                {
                    key: 'project-none',
                    label: t('tasks.noProject', 'No project'),
                    checked: task.project_id ? undefined : true,
                    onSelect: () => h.moveTo(null),
                },
                ...openProjects.map((project) => ({
                    key: `project-${project.uid ?? project.id}`,
                    label: project.name,
                    checked: task.project_id === project.id ? true : undefined,
                    onSelect: () => h.moveTo(project.id ?? null),
                })),
            ],
            testId: 'task-menu-project',
        });
    }
    entries.push('separator', {
        key: 'pin',
        label: task.pinned ? t('task.unpin', 'Unpin') : t('task.pin', 'Pin'),
        onSelect: () => h.setPinned(!task.pinned),
    });
    entries.push(...extra);
    if (!fileBacked) {
        entries.push({
            key: 'duplicate',
            label: t('task.duplicate', 'Duplicate'),
            onSelect: h.duplicate,
        });
    }
    if (canBecomeProject(task)) {
        entries.push({
            key: 'turnIntoProject',
            label: t('task.turnIntoProject', 'Turn into a project'),
            onSelect: h.turnIntoProject,
        });
    }
    entries.push(
        {
            key: 'copyLink',
            label: t('tasks.contextMenu.copyLink', 'Copy link'),
            onSelect: h.copyLink,
        },
        {
            key: 'copyTitle',
            label: t('tasks.contextMenu.copyTitle', 'Copy title'),
            onSelect: h.copyTitle,
        }
    );
    if (!fileBacked) {
        entries.push('separator', {
            key: 'delete',
            label: t('common.delete', 'Delete'),
            hint: t('tasks.contextMenu.deleteKey', 'Del'),
            danger: true,
            onSelect: h.remove,
            testId: 'task-menu-delete',
        });
    }
    return entries;
};
