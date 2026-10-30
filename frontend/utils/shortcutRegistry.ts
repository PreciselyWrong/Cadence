// The one list of keyboard shortcuts: the global ones the dispatcher fires,
// and the row and triage ones handled where they apply. The help overlay, the
// palette hints and the tooltips all read it.
import { isMac } from './keyboardShortcutsService';
import type { ShortcutBinding } from './shortcutDispatcher';

export type ShortcutGroup =
    'general' | 'navigation' | 'task' | 'create' | 'triage';

export interface ShortcutDef {
    id: string;
    // Keys in order. A chord with Ctrl/Cmd sets `mod`.
    keys: string[];
    mod?: boolean;
    allowInField?: boolean;
    group: ShortcutGroup;
    labelKey: string;
    defaultLabel: string;
    // Fired by the global dispatcher; the others are listed for reference
    global: boolean;
}

export const SHORTCUT_DEFS: ShortcutDef[] = [
    {
        id: 'palette',
        keys: ['k'],
        mod: true,
        allowInField: true,
        group: 'general',
        labelKey: 'commandCenter.shortcuts.palette',
        defaultLabel: 'Open the command palette',
        global: true,
    },
    {
        id: 'capture',
        keys: ['c'],
        group: 'general',
        labelKey: 'commandCenter.shortcuts.capture',
        defaultLabel: 'Quick capture',
        global: true,
    },
    {
        id: 'search',
        keys: ['/'],
        group: 'general',
        labelKey: 'commandCenter.shortcuts.search',
        defaultLabel: 'Search',
        global: true,
    },
    {
        id: 'help',
        keys: ['?'],
        group: 'general',
        labelKey: 'commandCenter.shortcuts.help',
        defaultLabel: 'Show keyboard shortcuts',
        global: true,
    },
    {
        id: 'go-today',
        keys: ['g', 't'],
        group: 'navigation',
        labelKey: 'commandCenter.shortcuts.goToday',
        defaultLabel: 'Go to Today',
        global: true,
    },
    {
        id: 'go-inbox',
        keys: ['g', 'i'],
        group: 'navigation',
        labelKey: 'commandCenter.shortcuts.goInbox',
        defaultLabel: 'Go to Inbox',
        global: true,
    },
    {
        id: 'go-upcoming',
        keys: ['g', 'u'],
        group: 'navigation',
        labelKey: 'commandCenter.shortcuts.goUpcoming',
        defaultLabel: 'Go to Upcoming',
        global: true,
    },
    {
        id: 'go-calendar',
        keys: ['g', 'c'],
        group: 'navigation',
        labelKey: 'commandCenter.shortcuts.goCalendar',
        defaultLabel: 'Go to Calendar',
        global: true,
    },
    {
        id: 'go-projects',
        keys: ['g', 'p'],
        group: 'navigation',
        labelKey: 'commandCenter.shortcuts.goProjects',
        defaultLabel: 'Go to Projects',
        global: true,
    },
    {
        id: 'task-move',
        keys: ['↑', '↓'],
        group: 'task',
        labelKey: 'commandCenter.shortcuts.taskNav',
        defaultLabel: 'Move between tasks',
        global: false,
    },
    {
        id: 'task-complete',
        keys: ['x'],
        group: 'task',
        labelKey: 'commandCenter.shortcuts.taskComplete',
        defaultLabel: 'Complete or reopen the task (or Space)',
        global: false,
    },
    {
        id: 'task-edit',
        keys: ['e'],
        group: 'task',
        labelKey: 'commandCenter.shortcuts.taskEdit',
        defaultLabel: 'Open the task to edit (or Enter)',
        global: false,
    },
    {
        id: 'task-date',
        keys: ['d'],
        group: 'task',
        labelKey: 'commandCenter.shortcuts.taskDate',
        defaultLabel: 'Set the date',
        global: false,
    },
    {
        id: 'task-priority',
        keys: ['p'],
        group: 'task',
        labelKey: 'commandCenter.shortcuts.taskPriority',
        defaultLabel: 'Set the priority',
        global: false,
    },
    {
        id: 'task-project',
        keys: ['m'],
        group: 'task',
        labelKey: 'commandCenter.shortcuts.taskProject',
        defaultLabel: 'Move to a project',
        global: false,
    },
    {
        id: 'task-delete',
        keys: ['Delete'],
        group: 'task',
        labelKey: 'commandCenter.shortcuts.taskDelete',
        defaultLabel: 'Delete the task (with undo)',
        global: false,
    },
    {
        id: 'create-alt',
        keys: ['I', 'T', 'P', 'N', 'A', 'G'],
        group: 'create',
        labelKey: 'commandCenter.shortcuts.createAlt',
        defaultLabel:
            'Create an inbox item, task, project, note, area or tag (with Alt+Shift)',
        global: false,
    },
    {
        id: 'triage-task',
        keys: ['t'],
        group: 'triage',
        labelKey: 'commandCenter.shortcuts.triageTask',
        defaultLabel: 'Triage: make it a task',
        global: false,
    },
    {
        id: 'triage-project',
        keys: ['p'],
        group: 'triage',
        labelKey: 'commandCenter.shortcuts.triageProject',
        defaultLabel: 'Triage: make it a project',
        global: false,
    },
    {
        id: 'triage-note',
        keys: ['n'],
        group: 'triage',
        labelKey: 'commandCenter.shortcuts.triageNote',
        defaultLabel: 'Triage: make it a note',
        global: false,
    },
    {
        id: 'triage-later',
        keys: ['l'],
        group: 'triage',
        labelKey: 'commandCenter.shortcuts.triageLater',
        defaultLabel: 'Triage: later (keep it in the inbox)',
        global: false,
    },
    {
        id: 'triage-delete',
        keys: ['Delete'],
        group: 'triage',
        labelKey: 'commandCenter.shortcuts.triageDelete',
        defaultLabel: 'Triage: delete',
        global: false,
    },
];

export const GLOBAL_BINDINGS: ShortcutBinding[] = SHORTCUT_DEFS.filter(
    (def) => def.global
).map(({ id, keys, mod, allowInField }) => ({ id, keys, mod, allowInField }));

const KEY_NAMES: Record<string, string> = {
    Delete: 'Del',
};

// The key caps to draw for a shortcut: ['Ctrl', 'K'], ['G', 'T'], ['C'].
export const shortcutKeyCaps = (id: string): string[] => {
    const def = SHORTCUT_DEFS.find((candidate) => candidate.id === id);
    if (!def) return [];
    const caps = def.keys.map(
        (key) => KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key)
    );
    return def.mod ? [isMac() ? '⌘' : 'Ctrl', ...caps] : caps;
};

// Short text for a tooltip: "C", "G then T", "Ctrl+K".
export const shortcutTooltip = (id: string, thenWord = 'then'): string => {
    const def = SHORTCUT_DEFS.find((candidate) => candidate.id === id);
    if (!def) return '';
    const caps = shortcutKeyCaps(id);
    if (def.mod) return caps.join('+');
    return caps.join(` ${thenWord} `);
};
