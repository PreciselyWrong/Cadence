import { toLocalDateString } from '../../utils/dateUtils';
import { Task } from '../../entities/Task';
import {
    InboxReviewItem,
    ProjectReviewItem,
    PushedItem,
    TaskReviewItem,
} from '../../utils/reviewService';

export const addDaysToToday = (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return toLocalDateString(date);
};

// A short local date for a YYYY-MM-DD day or an ISO instant.
export const formatDay = (value: string | null | undefined, locale: string) => {
    if (!value) return '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
};

export interface LaterGroup {
    key: string;
    kind: 'project' | 'area' | 'none';
    name: string | null;
    color: string | null;
    items: TaskReviewItem[];
}

const SOMEDAY = 'someday';

const fold = (text: string) =>
    text
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .toLowerCase();

const touched = (item: TaskReviewItem) =>
    Date.parse(item.last_activity_at || '') || 0;

const placeOf = (task: Task) => {
    if (task.Project?.uid || task.Project?.name) {
        return {
            key: `project:${task.Project.uid ?? task.Project.name}`,
            kind: 'project' as const,
            name: task.Project.name,
            color: task.Project.color ?? null,
        };
    }
    if (task.Area?.name) {
        return {
            key: `area:${task.Area.uid ?? task.Area.name}`,
            kind: 'area' as const,
            name: task.Area.name,
            color: null,
        };
    }
    return { key: 'none', kind: 'none' as const, name: null, color: null };
};

// Later read as a backlog: grouped by project, then area, then no project
// last; groups by their most recently touched task, due reviews first in a
// group. The filter matches title, group and tags.
export const groupLater = (
    items: TaskReviewItem[],
    query = ''
): LaterGroup[] => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const groups = new Map<string, LaterGroup>();
    items.forEach((item) => {
        const place = placeOf(item.task);
        if (words.length > 0) {
            const text = fold(
                [
                    item.task.original_name || item.task.name,
                    place.name,
                    ...(item.task.tags || [])
                        .map((tag) => tag.name)
                        .filter((name) => name !== SOMEDAY),
                ]
                    .filter(Boolean)
                    .join(' ')
            );
            if (!words.every((word) => text.includes(word))) return;
        }
        const group = groups.get(place.key) ?? { ...place, items: [] };
        group.items.push(item);
        groups.set(place.key, group);
    });
    const latest = (group: LaterGroup) => Math.max(...group.items.map(touched));
    return [...groups.values()]
        .map((group) => ({
            ...group,
            items: [...group.items].sort(
                (a, b) =>
                    Number(b.review_due) - Number(a.review_due) ||
                    touched(b) - touched(a) ||
                    a.task.name.localeCompare(b.task.name)
            ),
        }))
        .sort(
            (a, b) =>
                Number(a.kind === 'none') - Number(b.kind === 'none') ||
                latest(b) - latest(a) ||
                (a.name ?? '').localeCompare(b.name ?? '')
        );
};

export interface QuickLists {
    undecided: InboxReviewItem[];
    pushed: PushedItem[];
    projects: ProjectReviewItem[];
    later: TaskReviewItem[];
    stale: TaskReviewItem[];
}

export type QuickEntry =
    | { category: 'undecided'; item: InboxReviewItem }
    | { category: 'pushed'; item: PushedItem }
    | { category: 'projects'; item: ProjectReviewItem }
    | { category: 'later' | 'stale'; item: TaskReviewItem };

// About five minutes at a calm pace: a session never asks for more.
export const QUICK_REVIEW_SIZE = 10;

export const quickKey = (entry: QuickEntry): string =>
    entry.category === 'undecided'
        ? `i:${entry.item.uid}`
        : entry.category === 'projects'
          ? `p:${entry.item.project.uid}`
          : `t:${entry.item.task.uid}`;

const reviewedTime = (item: TaskReviewItem) =>
    Date.parse(item.task.reviewed_at || '') || 0;

// Places a session keeps for parked ideas, however much else needs a look.
const PARKED_PLACES = 3;

// The quick review: one short queue instead of six lists. What needs a look
// comes first, in the order of the tabs (Inbox, pushed back, stalled
// projects, due reviews, old tasks); then parked ideas looked at longest
// ago, at least three when there are any, so the Later backlog gets read a
// few at a time instead of never.
export const buildQuickReview = (
    lists: QuickLists,
    size = QUICK_REVIEW_SIZE,
    exclude: string[] = []
): QuickEntry[] => {
    const parked = [...lists.later].sort(
        (a, b) => reviewedTime(a) - reviewedTime(b) || touched(a) - touched(b)
    );
    const candidates: QuickEntry[] = [
        ...lists.undecided.map((item) => ({
            category: 'undecided' as const,
            item,
        })),
        ...lists.pushed.map((item) => ({ category: 'pushed' as const, item })),
        ...lists.projects.map((item) => ({
            category: 'projects' as const,
            item,
        })),
        ...lists.later
            .filter((item) => item.review_due)
            .map((item) => ({ category: 'later' as const, item })),
        ...lists.stale.map((item) => ({ category: 'stale' as const, item })),
        ...parked
            .filter((item) => !item.review_due)
            .map((item) => ({ category: 'later' as const, item })),
    ];
    const seen = new Set(exclude);
    const unique = candidates.filter((entry) => {
        const key = quickKey(entry);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const isParked = (entry: QuickEntry) => entry.category === 'later';
    const parkedCount = unique.filter(isParked).length;
    const attention = unique.filter((entry) => !isParked(entry));
    const attentionTaken = Math.min(
        attention.length,
        size - Math.min(PARKED_PLACES, parkedCount, size)
    );
    const chosen = new Set([
        ...attention.slice(0, attentionTaken),
        ...unique.filter(isParked).slice(0, size - attentionTaken),
    ]);
    return unique.filter((entry) => chosen.has(entry));
};
