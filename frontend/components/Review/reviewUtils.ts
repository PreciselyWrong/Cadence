import { toLocalDateString } from '../../utils/dateUtils';
import { Task } from '../../entities/Task';
import { TaskReviewItem } from '../../utils/reviewService';

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
const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/i;

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
// group. The filter matches title, group, tags and the saved link's title.
export const groupLater = (
    items: TaskReviewItem[],
    query = '',
    linkTitles: Record<string, string> = {}
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
                    linkTitles[item.task.uid ?? ''],
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

// The text that carries a row's link: the title when it holds an address,
// else a note that is nothing but a link.
export const rowLinkText = (
    title: string,
    note: string | null | undefined
): string | null => {
    if (URL_PATTERN.test(title)) return title;
    const trimmed = (note ?? '').trim();
    const match = trimmed.match(URL_PATTERN);
    return match && match[0] === trimmed ? trimmed : null;
};
