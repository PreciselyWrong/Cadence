// Display settings of the Plan page (the "View" menu, as in Todoist). They are
// a per-viewer convenience, kept in localStorage; nothing here reaches the
// server.

export type PlanMode = 'days' | 'horizons';
export type GroupBy = 'none' | 'project' | 'priority' | 'tag';
export type SortBy = 'plan' | 'time' | 'priority' | 'name' | 'project';
export type CalendarSpan = 1 | 3 | 7;

export interface PlanViewOptions {
    mode: PlanMode;
    groupBy: GroupBy;
    sortBy: SortBy;
    showCompleted: boolean;
    showInbox: boolean;
    showCalendar: boolean;
    calendarSpan: CalendarSpan;
}

export const DEFAULT_VIEW_OPTIONS: PlanViewOptions = {
    mode: 'days',
    groupBy: 'none',
    sortBy: 'plan',
    showCompleted: true,
    showInbox: true,
    showCalendar: true,
    calendarSpan: 1,
};

const KEY = 'upcoming.viewOptions';

const ALLOWED: { [K in keyof PlanViewOptions]: readonly PlanViewOptions[K][] } =
    {
        mode: ['days', 'horizons'],
        groupBy: ['none', 'project', 'priority', 'tag'],
        sortBy: ['plan', 'time', 'priority', 'name', 'project'],
        showCompleted: [true, false],
        showInbox: [true, false],
        showCalendar: [true, false],
        calendarSpan: [1, 3, 7],
    };

// Keeps only known keys with allowed values: stored data may be stale or
// hand-edited.
export const sanitizeViewOptions = (raw: unknown): PlanViewOptions => {
    const result: PlanViewOptions = { ...DEFAULT_VIEW_OPTIONS };
    if (!raw || typeof raw !== 'object') return result;
    const source = raw as Record<string, unknown>;
    (Object.keys(ALLOWED) as (keyof PlanViewOptions)[]).forEach((key) => {
        const value = source[key];
        if ((ALLOWED[key] as readonly unknown[]).includes(value)) {
            (result as unknown as Record<string, unknown>)[key] = value;
        }
    });
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
