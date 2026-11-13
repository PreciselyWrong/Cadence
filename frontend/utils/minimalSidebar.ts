// Minimal sidebar settings, stored in users.sidebar_settings next to the
// Dense layout keys. The backend keeps only known keys; this file fills in
// defaults for anything missing so new items appear for existing users.

// Tomorrow left the list (2026-11-12): the Plan page covers it. Inbox left it
// (2026-11-13): its items are a column on Plan. A stored 'inbox' entry is
// dropped by resolveMinimalSidebar, like any unknown key.
export const SMART_LIST_IDS = ['today', 'next7'] as const;
// The order every account had before, Tomorrow included; a saved list in that
// exact order was never rearranged by its owner, so it takes the new default.
// Kept literal: it must still match after Tomorrow leaves SMART_LIST_IDS.
const PREVIOUS_SMART_ORDER = ['today', 'tomorrow', 'next7', 'inbox'];
export type SmartListId = (typeof SMART_LIST_IDS)[number];

export const RAIL_IDS = [
    'today',
    'calendar',
    'notes',
    'habits',
    'views',
    'areas',
    'goals',
    'people',
    'insights',
    'review',
    'career',
    'allTasks',
    'assignedToMe',
    'everyone',
    'boards',
    'templates',
    'access',
] as const;
export type RailId = (typeof RAIL_IDS)[number];

export type RailPlace = 'rail' | 'more' | 'hidden';
export const RAIL_PLACES: readonly RailPlace[] = ['rail', 'more', 'hidden'];

export const SECTION_BADGE_IDS = [
    'favorites',
    'projects',
    'areas',
    'tags',
] as const;
export type SectionBadgeId = (typeof SECTION_BADGE_IDS)[number];

// The blocks of the open panel, top to bottom; each can be hidden.
export const PANEL_IDS = [
    'favorites',
    'miniMonth',
    'smartLists',
    'projects',
    'areas',
    'tags',
] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export interface PanelSetting {
    key: PanelId;
    visible: boolean;
}

// The panels of the rail entries that have their own (Notes, Goals, Habits).
// Any other rail entry shows the tasks panel above (`panel`).
export const SECTION_PANEL_BLOCKS = {
    notes: ['favorites', 'notes'],
    goals: ['goals'],
    habits: ['habits'],
} as const;
export type SectionPanelKind = keyof typeof SECTION_PANEL_BLOCKS;
export type SectionPanelBlockId =
    (typeof SECTION_PANEL_BLOCKS)[SectionPanelKind][number];
export const SECTION_PANEL_KINDS = Object.keys(
    SECTION_PANEL_BLOCKS
) as SectionPanelKind[];

export const RAIL_PANEL_KIND: Partial<Record<RailId, SectionPanelKind>> = {
    notes: 'notes',
    goals: 'goals',
    habits: 'habits',
};

export interface SectionPanelSetting {
    key: SectionPanelBlockId;
    visible: boolean;
}

export interface SmartListSetting {
    key: SmartListId;
    visible: boolean;
    showCount: boolean;
}

export interface RailSetting {
    key: RailId;
    place: RailPlace;
}

export interface MinimalSidebarSettings {
    smartLists: SmartListSetting[];
    rail: RailSetting[];
    sectionBadges: Record<SectionBadgeId, boolean>;
    panel: PanelSetting[];
    panels: Record<SectionPanelKind, SectionPanelSetting[]>;
}

// Rail items that open on the icon rail by default; the rest sit in More.
const DEFAULT_RAIL_PLACE: Record<RailId, RailPlace> = {
    today: 'rail',
    calendar: 'rail',
    notes: 'rail',
    habits: 'rail',
    views: 'rail',
    areas: 'rail',
    goals: 'rail',
    people: 'rail',
    insights: 'rail',
    review: 'rail',
    career: 'rail',
    allTasks: 'more',
    assignedToMe: 'more',
    everyone: 'more',
    boards: 'more',
    templates: 'more',
    access: 'more',
};

export const DEFAULT_MINIMAL_SIDEBAR: MinimalSidebarSettings = {
    // Calm by default: a count only where something waits for the user
    // (Today); the rest can be turned on in Profile > Sidebar.
    smartLists: SMART_LIST_IDS.map((key) => ({
        key,
        visible: true,
        showCount: key === 'today',
    })),
    rail: RAIL_IDS.map((key) => ({ key, place: DEFAULT_RAIL_PLACE[key] })),
    sectionBadges: {
        favorites: false,
        projects: false,
        areas: false,
        tags: false,
    },
    panel: PANEL_IDS.map((key) => ({ key, visible: true })),
    panels: {
        notes: SECTION_PANEL_BLOCKS.notes.map((key) => ({
            key,
            visible: true,
        })),
        goals: SECTION_PANEL_BLOCKS.goals.map((key) => ({
            key,
            visible: true,
        })),
        habits: SECTION_PANEL_BLOCKS.habits.map((key) => ({
            key,
            visible: true,
        })),
    },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

// Keeps the saved order of known ids, drops unknown and repeated ones, and
// appends every id the saved list lacks, using its default.
function resolveList<K extends string, T extends { key: K }>(
    saved: unknown,
    defaults: T[],
    read: (entry: Record<string, unknown>, fallback: T) => T
): T[] {
    const known = new Map(defaults.map((item) => [item.key, item]));
    const result: T[] = [];
    if (Array.isArray(saved)) {
        for (const entry of saved) {
            if (!isRecord(entry) || typeof entry.key !== 'string') continue;
            const fallback = known.get(entry.key as K);
            if (!fallback || result.some((item) => item.key === fallback.key)) {
                continue;
            }
            result.push(read(entry, fallback));
        }
    }
    for (const item of defaults) {
        if (!result.some((existing) => existing.key === item.key)) {
            result.push(item);
        }
    }
    return result;
}

const keptOldOrder = (saved: unknown): boolean =>
    Array.isArray(saved) &&
    saved.map((entry) => (isRecord(entry) ? entry.key : null)).join() ===
        PREVIOUS_SMART_ORDER.join();

const reorderLike = (saved: unknown[], order: readonly string[]): unknown[] =>
    order
        .map((key) =>
            saved.find((entry) => isRecord(entry) && entry.key === key)
        )
        .filter(Boolean);

function readVisibleEntry<
    K extends string,
    T extends { key: K; visible: boolean },
>(entry: Record<string, unknown>, fallback: T): T {
    return {
        ...fallback,
        visible:
            typeof entry.visible === 'boolean'
                ? entry.visible
                : fallback.visible,
    };
}

export function resolveMinimalSidebar(saved: unknown): MinimalSidebarSettings {
    const source = isRecord(saved) ? saved : {};
    const badges = isRecord(source.sectionBadges) ? source.sectionBadges : {};
    return {
        smartLists: resolveList(
            keptOldOrder(source.smartLists)
                ? reorderLike(source.smartLists as unknown[], SMART_LIST_IDS)
                : source.smartLists,
            DEFAULT_MINIMAL_SIDEBAR.smartLists,
            (entry, fallback) => ({
                key: fallback.key,
                visible:
                    typeof entry.visible === 'boolean'
                        ? entry.visible
                        : fallback.visible,
                showCount:
                    typeof entry.showCount === 'boolean'
                        ? entry.showCount
                        : fallback.showCount,
            })
        ),
        rail: resolveList(
            source.rail,
            DEFAULT_MINIMAL_SIDEBAR.rail,
            (entry, fallback) => ({
                key: fallback.key,
                place: RAIL_PLACES.includes(entry.place as RailPlace)
                    ? (entry.place as RailPlace)
                    : fallback.place,
            })
        ),
        sectionBadges: Object.fromEntries(
            SECTION_BADGE_IDS.map((id) => [
                id,
                typeof badges[id] === 'boolean'
                    ? (badges[id] as boolean)
                    : DEFAULT_MINIMAL_SIDEBAR.sectionBadges[id],
            ])
        ) as MinimalSidebarSettings['sectionBadges'],
        panel: resolveList(
            source.panel,
            DEFAULT_MINIMAL_SIDEBAR.panel,
            readVisibleEntry
        ),
        panels: Object.fromEntries(
            SECTION_PANEL_KINDS.map((kind) => [
                kind,
                resolveList(
                    isRecord(source.panels) ? source.panels[kind] : undefined,
                    DEFAULT_MINIMAL_SIDEBAR.panels[kind],
                    readVisibleEntry
                ),
            ])
        ) as MinimalSidebarSettings['panels'],
    };
}

// Moves the item at index by one step, or returns the list unchanged at an
// edge. Used by the up and down buttons in the Profile editor.
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
    const target = index + delta;
    if (index < 0 || target < 0 || target >= list.length) return list;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}
