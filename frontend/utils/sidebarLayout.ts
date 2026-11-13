export const DEFAULT_LINK_ORDER = [
    'today',
    'upcomingTasks',
    'calendar',
    'allTasks',
    'assignedToMe',
    'everyone',
] as const;

export const DEFAULT_SECTION_ORDER = [
    'favorites',
    'projects',
    'areas',
    'goals',
    'notes',
    'tags',
    'people',
    'habits',
    'views',
    'boards',
    'insights',
] as const;

// Templates and Access sit in a fixed group at the bottom of the sidebar:
// they can be switched off but not moved.
export const FIXED_BOTTOM_ITEMS = ['templates', 'access'] as const;

export type SidebarLinkId = (typeof DEFAULT_LINK_ORDER)[number];
export type SidebarSectionId = (typeof DEFAULT_SECTION_ORDER)[number];

// A plugin's sidebar entry is keyed `plugin:<id>` (docs/46-plugins.md). Its
// id is not in the defaults, so it is kept in the saved order while saved:
// the navigation shows only the plugins that run, and an entry of a removed
// plugin is ignored.
export const PLUGIN_ENTRY_PREFIX = 'plugin:';
export const pluginEntryId = (pluginId: string) =>
    `${PLUGIN_ENTRY_PREFIX}${pluginId}`;
export const isPluginEntryId = (id: unknown): id is string =>
    typeof id === 'string' &&
    id.startsWith(PLUGIN_ENTRY_PREFIX) &&
    id.length > PLUGIN_ENTRY_PREFIX.length;

// Keeps the saved order for the ids that still exist, drops unknown or
// repeated ones, and puts any id the saved order does not know about at the
// end, so a newly added item never disappears for existing users.
export const resolveOrder = <T extends string>(
    saved: unknown,
    defaults: readonly T[]
): T[] => {
    const known = new Set<string>(defaults);
    const result: string[] = [];
    if (Array.isArray(saved)) {
        for (const id of saved) {
            if (
                typeof id === 'string' &&
                (known.has(id) || isPluginEntryId(id)) &&
                !result.includes(id)
            ) {
                result.push(id);
            }
        }
    }
    for (const id of defaults) {
        if (!result.includes(id)) result.push(id);
    }
    return result as T[];
};

export const sortByOrder = <T extends { id: string }>(
    items: T[],
    order: readonly string[]
): T[] => {
    const position = new Map(order.map((id, index) => [id, index]));
    return [...items].sort(
        (a, b) =>
            (position.get(a.id) ?? order.length) -
            (position.get(b.id) ?? order.length)
    );
};
