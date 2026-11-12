// Display settings of the Plan page (the "View" menu, as in Todoist). They are
// a per-viewer convenience, kept in localStorage; nothing here reaches the
// server.

export type PlanMode = 'days' | 'horizons';
export type GroupBy = 'none' | 'project' | 'priority' | 'tag';
export type SortBy = 'plan' | 'time' | 'priority' | 'name' | 'project';
export type CalendarSpan = 1 | 3 | 7;

// Facets of the Filter section. Within a facet a card matches any chosen value;
// across facets it must match all of them. Empty means no filter. Project ids
// are strings here, as the menu receives them from the projects list.
export interface PlanFilters {
    projectIds: string[];
    tagNames: string[];
    priorities: string[];
}

export interface PlanViewOptions {
    mode: PlanMode;
    groupBy: GroupBy;
    sortBy: SortBy;
    showCompleted: boolean;
    showInbox: boolean;
    showCalendar: boolean;
    calendarSpan: CalendarSpan;
    filters: PlanFilters;
}

export const NO_FILTERS: PlanFilters = {
    projectIds: [],
    tagNames: [],
    priorities: [],
};

export const DEFAULT_VIEW_OPTIONS: PlanViewOptions = {
    mode: 'days',
    groupBy: 'none',
    sortBy: 'plan',
    showCompleted: true,
    showInbox: true,
    showCalendar: true,
    calendarSpan: 1,
    filters: NO_FILTERS,
};

const KEY = 'upcoming.viewOptions';

type ChoiceKey = Exclude<keyof PlanViewOptions, 'filters'>;

const ALLOWED: { [K in ChoiceKey]: readonly PlanViewOptions[K][] } = {
    mode: ['days', 'horizons'],
    groupBy: ['none', 'project', 'priority', 'tag'],
    sortBy: ['plan', 'time', 'priority', 'name', 'project'],
    showCompleted: [true, false],
    showInbox: [true, false],
    showCalendar: [true, false],
    calendarSpan: [1, 3, 7],
};

const stringList = (value: unknown): string[] =>
    Array.isArray(value)
        ? [...new Set(value.filter((item) => typeof item === 'string'))]
        : [];

const sanitizeFilters = (value: unknown): PlanFilters => {
    if (!value || typeof value !== 'object') return { ...NO_FILTERS };
    const source = value as Record<string, unknown>;
    return {
        projectIds: stringList(source.projectIds),
        tagNames: stringList(source.tagNames),
        priorities: stringList(source.priorities),
    };
};

// Keeps only known keys with allowed values: stored data may be stale or
// hand-edited.
export const sanitizeViewOptions = (raw: unknown): PlanViewOptions => {
    const result: PlanViewOptions = { ...DEFAULT_VIEW_OPTIONS };
    if (!raw || typeof raw !== 'object') return result;
    const source = raw as Record<string, unknown>;
    (Object.keys(ALLOWED) as ChoiceKey[]).forEach((key) => {
        const value = source[key];
        if ((ALLOWED[key] as readonly unknown[]).includes(value)) {
            (result as unknown as Record<string, unknown>)[key] = value;
        }
    });
    result.filters = sanitizeFilters(source.filters);
    return result;
};

export const loadViewOptions = (): PlanViewOptions => {
    try {
        const stored = localStorage.getItem(KEY);
        return sanitizeViewOptions(stored ? JSON.parse(stored) : null);
    } catch {
        return { ...DEFAULT_VIEW_OPTIONS };
    }
};

export const saveViewOptions = (options: PlanViewOptions): void => {
    try {
        localStorage.setItem(KEY, JSON.stringify(options));
    } catch {
        // Private mode: the choice lasts until reload.
    }
};
