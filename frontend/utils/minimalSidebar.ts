// Minimal sidebar settings, stored in users.sidebar_settings next to the
// Dense layout keys. The backend keeps only known keys; this file fills in
// defaults for anything missing so new items appear for existing users.

// Inbox first: what came in sits above the day (2026-11-12).
export const SMART_LIST_IDS = ['inbox', 'today', 'tomorrow', 'next7'] as const;
// The order every account had before; a saved list in that exact order was
// never rearranged by its owner, so it takes the new default.
const PREVIOUS_SMART_ORDER = ['today', 'tomorrow', 'next7', 'inbox'];
export type SmartListId = (typeof SMART_LIST_IDS)[number];

export const RAIL_IDS = [
    'today',
    'inbox',
    'calendar',
    'notes',
    'habits',
    'views',
    'areas',
    'goals',
    'people',
    'insights',
    'review',
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
}

// Rail items that open on the icon rail by default; the rest sit in More.
const DEFAULT_RAIL_PLACE: Record<RailId, RailPlace> = {
    today: 'rail',
    inbox: 'rail',
    calendar: 'rail',
    notes: 'rail',
    habits: 'rail',
    views: 'rail',
    areas: 'rail',
    goals: 'rail',
    people: 'rail',
    insights: 'rail',
    review: 'more',
    allTasks: 'more',
    assignedToMe: 'more',
    everyone: 'more',
    boards: 'more',
    templates: 'more',
    access: 'more',
};

export const DEFAULT_MINIMAL_SIDEBAR: MinimalSidebarSettings = {
    // Calm by default: counts only where something waits for the user
    // (Today, Inbox); the rest can be turned on in Profile > Sidebar. The
    // Inbox row is off for new accounts (its items show as a column on Plan);
    // a saved choice still wins.
    smartLists: SMART_LIST_IDS.map((key) => ({
        key,
        visible: key !== 'inbox',
        showCount: key === 'today' || key === 'inbox',
    })),
    rail: RAIL_IDS.map((key) => ({ key, place: DEFAULT_RAIL_PLACE[key] })),
    sectionBadges: {
        favorites: false,
        projects: false,
        areas: false,
        tags: false,
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
