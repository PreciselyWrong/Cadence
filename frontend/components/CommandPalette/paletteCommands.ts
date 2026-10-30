import type { TFunction } from 'i18next';
import type { PaletteItem } from '../../utils/commandPalette';
import type { PriorityType } from '../../entities/Task';
import type { Project } from '../../entities/Project';
import type { DateShortcut } from '../../utils/dateShortcuts';
import { shortcutKeyCaps } from '../../utils/shortcutRegistry';

export interface PaletteTarget {
    uid: string;
    name?: string;
    done?: boolean;
}

export interface PaletteTaskActions {
    toggle: (uid: string) => Promise<unknown>;
    setPriority: (uid: string, priority: PriorityType) => Promise<unknown>;
    setDueShortcut: (
        uid: string,
        when: DateShortcut | 'none'
    ) => Promise<unknown>;
    moveToProject: (uid: string, projectId: number | null) => Promise<unknown>;
}

export interface PaletteCommandContext {
    t: TFunction;
    navigate: (path: string) => void;
    target: PaletteTarget | null;
    actions: PaletteTaskActions;
    openCapture: (target: 'inbox' | 'task') => void;
    openSearch: () => void;
    openHelp: () => void;
    toggleTheme: () => void;
    createProject: () => void;
    createNote: () => void;
    createHabit: () => void;
    openTask: (uid: string) => void;
    pickProject: () => void;
}

const PAGES: Array<{
    id: string;
    path: string;
    labelKey: string;
    fallback: string;
    shortcut?: string;
}> = [
    {
        id: 'today',
        path: '/today',
        labelKey: 'sidebar.today',
        fallback: 'Today',
        shortcut: 'go-today',
    },
    {
        id: 'inbox',
        path: '/inbox',
        labelKey: 'sidebar.inbox',
        fallback: 'Inbox',
        shortcut: 'go-inbox',
    },
    {
        id: 'upcoming',
        path: '/upcoming',
        labelKey: 'sidebar.upcoming',
        fallback: 'Upcoming',
        shortcut: 'go-upcoming',
    },
    {
        id: 'calendar',
        path: '/calendar',
        labelKey: 'sidebar.calendar',
        fallback: 'Calendar',
        shortcut: 'go-calendar',
    },
    {
        id: 'projects',
        path: '/projects',
        labelKey: 'sidebar.projects',
        fallback: 'Projects',
        shortcut: 'go-projects',
    },
    {
        id: 'tasks',
        path: '/tasks',
        labelKey: 'sidebar.tasks',
        fallback: 'Tasks',
    },
    {
        id: 'notes',
        path: '/notes',
        labelKey: 'sidebar.notes',
        fallback: 'Notes',
    },
    {
        id: 'habits',
        path: '/habits',
        labelKey: 'sidebar.habits',
        fallback: 'Habits',
    },
    {
        id: 'settings',
        path: '/profile',
        labelKey: 'sidebar.settings',
        fallback: 'Settings',
    },
];

const caps = (id: string) => {
    const keys = shortcutKeyCaps(id);
    return keys.length > 0 ? keys : undefined;
};

const PRIORITIES: Array<{
    value: PriorityType;
    key: string;
    fallback: string;
}> = [
    { value: 'high', key: 'priority.high', fallback: 'High' },
    { value: 'medium', key: 'priority.medium', fallback: 'Medium' },
    { value: 'low', key: 'priority.low', fallback: 'Low' },
    { value: null, key: 'priority.none', fallback: 'None' },
];

const DATES: Array<{
    value: DateShortcut | 'none';
    key: string;
    fallback: string;
}> = [
    { value: 'today', key: 'tasks.contextMenu.today', fallback: 'Today' },
    {
        value: 'tomorrow',
        key: 'tasks.contextMenu.tomorrow',
        fallback: 'Tomorrow',
    },
    {
        value: 'next_week',
        key: 'tasks.contextMenu.nextWeek',
        fallback: 'Next week',
    },
    {
        value: 'none',
        key: 'tasks.contextMenu.clearDate',
        fallback: 'Clear date',
    },
];

// Commands that act on the task the palette was opened for
export const buildTaskCommands = (
    ctx: PaletteCommandContext
): PaletteItem[] => {
    const { t, target, actions } = ctx;
    if (!target) return [];
    const name = target.name ?? '';
    const subtitle = name
        ? t('commandCenter.taskContext', 'Task: {{name}}', { name })
        : undefined;
    const items: PaletteItem[] = [
        {
            id: 'task:toggle',
            group: 'task',
            title: target.done
                ? t('commandCenter.reopenTask', 'Reopen task')
                : t('commandCenter.completeTask', 'Complete task'),
            subtitle,
            keywords: ['done', 'check', 'finish', 'terminer', 'fait'],
            shortcut: caps('task-complete'),
            run: () => void actions.toggle(target.uid),
        },
        {
            id: 'task:open',
            group: 'task',
            title: t('commandCenter.editTask', 'Open task'),
            subtitle,
            keywords: ['edit', 'modifier'],
            shortcut: caps('task-edit'),
            run: () => ctx.openTask(target.uid),
        },
        {
            id: 'task:project',
            group: 'task',
            title: t('commandCenter.moveToProject', 'Move to project...'),
            subtitle,
            keywords: ['project', 'projet', 'move', 'deplacer'],
            shortcut: caps('task-project'),
            run: ctx.pickProject,
        },
    ];
    for (const date of DATES) {
        items.push({
            id: `task:date:${date.value}`,
            group: 'task',
            title: t('commandCenter.setDate', 'Date: {{when}}', {
                when: t(date.key, date.fallback),
            }),
            subtitle,
            keywords: ['reschedule', 'due', 'date', 'echeance', 'reporter'],
            run: () => void actions.setDueShortcut(target.uid, date.value),
        });
    }
    for (const priority of PRIORITIES) {
        items.push({
            id: `task:priority:${priority.value ?? 'none'}`,
            group: 'task',
            title: t('commandCenter.setPriority', 'Priority: {{level}}', {
                level: t(priority.key, priority.fallback),
            }),
            subtitle,
            keywords: ['priority', 'priorite', 'urgent'],
            run: () => void actions.setPriority(target.uid, priority.value),
        });
    }
    return items;
};

export const buildCommands = (ctx: PaletteCommandContext): PaletteItem[] => {
    const { t, navigate } = ctx;
    const create: PaletteItem[] = [
        {
            id: 'create:task',
            group: 'create',
            title: t('commandCenter.createTask', 'Create task'),
            keywords: ['new', 'add', 'nouvelle', 'ajouter'],
            shortcut: ['Alt', 'Shift', 'T'],
            run: () => ctx.openCapture('task'),
        },
        {
            id: 'create:capture',
            group: 'create',
            title: t('commandCenter.capture', 'Quick capture'),
            keywords: ['inbox', 'capturer', 'idea', 'idee'],
            shortcut: caps('capture'),
            run: () => ctx.openCapture('inbox'),
        },
        {
            id: 'create:project',
            group: 'create',
            title: t('commandCenter.createProject', 'Create project'),
            keywords: ['new', 'add', 'nouveau'],
            shortcut: ['Alt', 'Shift', 'P'],
            run: ctx.createProject,
        },
        {
            id: 'create:note',
            group: 'create',
            title: t('commandCenter.createNote', 'Create note'),
            keywords: ['new', 'add', 'nouvelle'],
            shortcut: ['Alt', 'Shift', 'N'],
            run: ctx.createNote,
        },
        {
            id: 'create:habit',
            group: 'create',
            title: t('commandCenter.createHabit', 'Create habit'),
            keywords: ['new', 'add', 'habitude'],
            run: ctx.createHabit,
        },
    ];
    const go: PaletteItem[] = PAGES.map((page) => ({
        id: `go:${page.id}`,
        group: 'go' as const,
        title: t('commandCenter.goTo', 'Go to {{page}}', {
            page: t(page.labelKey, page.fallback),
        }),
        keywords: ['open', 'page', 'aller', 'ouvrir'],
        shortcut: page.shortcut ? caps(page.shortcut) : undefined,
        run: () => navigate(page.path),
    }));
    const commands: PaletteItem[] = [
        {
            id: 'cmd:triage',
            group: 'commands',
            title: t('commandCenter.triage', 'Triage the inbox'),
            keywords: ['sort', 'process', 'trier', 'inbox', 'boite'],
            run: () => navigate('/inbox?triage=1'),
        },
        {
            id: 'cmd:search',
            group: 'commands',
            title: t('commandCenter.search', 'Search'),
            keywords: ['find', 'chercher', 'rechercher'],
            shortcut: caps('search'),
            run: ctx.openSearch,
        },
        {
            id: 'cmd:theme',
            group: 'commands',
            title: t('commandCenter.toggleTheme', 'Toggle dark mode'),
            keywords: ['theme', 'light', 'dark', 'sombre', 'clair'],
            run: ctx.toggleTheme,
        },
        {
            id: 'cmd:help',
            group: 'commands',
            title: t('commandCenter.showShortcuts', 'Keyboard shortcuts'),
            keywords: ['help', 'aide', 'raccourcis', 'keys'],
            shortcut: caps('help'),
            run: ctx.openHelp,
        },
    ];
    return [...buildTaskCommands(ctx), ...create, ...go, ...commands];
};

export const projectPickerItems = (
    t: TFunction,
    projects: Project[],
    onPick: (projectId: number | null) => void
): PaletteItem[] => [
    {
        id: 'project:none',
        group: 'projects',
        title: t('commandCenter.noProject', 'No project'),
        keywords: ['none', 'aucun', 'inbox'],
        run: () => onPick(null),
    },
    ...projects
        .filter((project) => project.id !== undefined)
        .map((project) => ({
            id: `project:${project.id}`,
            group: 'projects' as const,
            title: project.name,
            run: () => onPick(project.id as number),
        })),
];
