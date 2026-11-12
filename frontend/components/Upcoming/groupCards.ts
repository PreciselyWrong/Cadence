import type { Task } from '../../entities/Task';
import { toPriorityLevel } from '../Shared/PriorityBadge';
import type { DayLine } from '../Today/dayModel';
import type { GroupBy, SortBy } from './viewOptions';

// What the board sorts and groups: a card's task and its reserved slot and due
// time on the day (see Today/dayModel DayLine).
export interface CardLike {
    task: Task;
    start: number | null;
    dueMinute: number | null;
}

export interface CardGroup<T extends CardLike> {
    key: string;
    label: string;
    cards: T[];
}

export type Translate = (key: string, fallback: string) => string;

const PRIORITY_RANK: Record<'high' | 'medium' | 'low' | 'none', number> = {
    high: 0,
    medium: 1,
    low: 2,
    none: 3,
};

const priorityOf = (task: Task) =>
    toPriorityLevel(task.priority) ?? ('none' as const);

// Numbers first, then nothing: an untimed card goes after every timed one.
const compareNullableLast = (a: number | null, b: number | null): number => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
};

const compareNames = (a: string, b: string): number =>
    a.localeCompare(b, undefined, { sensitivity: 'base' });

const projectName = (card: CardLike): string | null =>
    card.task.Project?.name || null;

// The key a task is known by on the board: its uid, else its id.
export const taskKey = (task: Pick<Task, 'uid' | 'id'>): string =>
    String(task.uid ?? task.id);

export const cardTaskKeys = (cards: CardLike[]): Set<string> =>
    new Set(cards.map((card) => taskKey(card.task)));

// The subtasks a parent card lists, minus those that have a card of their own
// in the same list (they are shown once, on that card).
export const subtasksWithoutCard = (
    subtasks: Task[],
    ownCardKeys: ReadonlySet<string>
): Task[] => subtasks.filter((sub) => !ownCardKeys.has(taskKey(sub)));

// Minutes planned on the open lines of a day. Done lines do not count.
export const dayLoad = (lines: Pick<DayLine, 'duration' | 'done'>[]): number =>
    lines.reduce((sum, line) => (line.done ? sum : sum + line.duration), 0);

// A subtask whose parent has a card in the same list groups under the parent's
// project, so the pair stays together; otherwise it keeps its own project.
const projectLookup = (
    cards: CardLike[]
): ((card: CardLike) => string | null) => {
    const byKey = new Map(cards.map((card) => [taskKey(card.task), card]));
    return (card) => {
        const parent = card.task.parent_task
            ? byKey.get(taskKey(card.task.parent_task))
            : undefined;
        return projectName(parent ?? card);
    };
};

// Stable: cards that tie keep the order they came in.
export const sortCards = <T extends CardLike>(
    cards: T[],
    sortBy: SortBy
): T[] => {
    const copy = [...cards];
    const projectOf = projectLookup(cards);
    switch (sortBy) {
        case 'plan':
            return copy;
        case 'time':
            return copy.sort(
                (a, b) =>
                    compareNullableLast(a.start, b.start) ||
                    compareNullableLast(a.dueMinute, b.dueMinute)
            );
        case 'priority':
            return copy.sort(
                (a, b) =>
                    PRIORITY_RANK[priorityOf(a.task)] -
                    PRIORITY_RANK[priorityOf(b.task)]
            );
        case 'name':
            return copy.sort((a, b) => compareNames(a.task.name, b.task.name));
        case 'project':
            return copy.sort((a, b) => {
                const pa = projectOf(a);
                const pb = projectOf(b);
                if (pa === pb) return 0;
                if (pa === null) return 1;
                if (pb === null) return -1;
                return compareNames(pa, pb);
            });
    }
};

// Priority ranks are zero-padded digits, so they sort as text too.
const compareGroups = <T extends CardLike>(
    a: CardGroup<T> & { rank: string | null },
    b: CardGroup<T> & { rank: string | null }
): number => {
    if (a.rank === b.rank) return 0;
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return compareNames(a.rank, b.rank);
};

interface GroupKey {
    key: string;
    label: string;
    // Sort position among the groups; equal ranks keep first-seen order.
    rank: string | null;
}

const NO_GROUP: GroupKey = { key: 'none', label: '', rank: null };

const keyOf = (
    card: CardLike,
    groupBy: GroupBy,
    t: Translate,
    projectOf: (card: CardLike) => string | null
): GroupKey => {
    switch (groupBy) {
        case 'none':
            return NO_GROUP;
        case 'project': {
            const name = projectOf(card);
            if (name === null) {
                return {
                    key: 'project:none',
                    label: t('upcoming.noProject', 'No project'),
                    rank: null,
                };
            }
            return { key: `project:${name}`, label: name, rank: name };
        }
        case 'tag': {
            const tag = card.task.tags?.[0];
            if (!tag?.name) {
                return {
                    key: 'tag:none',
                    label: t('upcoming.noTag', 'No tag'),
                    rank: null,
                };
            }
            return {
                key: `tag:${tag.name}`,
                label: `#${tag.name}`,
                rank: tag.name,
            };
        }
        case 'priority': {
            const level = priorityOf(card.task);
            return {
                key: `priority:${level}`,
                label: t(
                    `upcoming.priority.${level}`,
                    PRIORITY_FALLBACK[level]
                ),
                rank: String(PRIORITY_RANK[level]).padStart(2, '0'),
            };
        }
    }
};

const PRIORITY_FALLBACK: Record<'high' | 'medium' | 'low' | 'none', string> = {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    none: 'No priority',
};

// Groups keep the order of the cards they receive. Projects and tags come
// by name with "none" last; priorities high to none. Empty groups are dropped.
export const groupCards = <T extends CardLike>(
    cards: T[],
    groupBy: GroupBy,
    t: Translate
): CardGroup<T>[] => {
    if (groupBy === 'none') {
        return cards.length > 0 ? [{ key: 'none', label: '', cards }] : [];
    }
    const groups = new Map<string, CardGroup<T> & { rank: string | null }>();
    const projectOf = projectLookup(cards);
    cards.forEach((card) => {
        const { key, label, rank } = keyOf(card, groupBy, t, projectOf);
        const existing = groups.get(key);
        if (existing) {
            existing.cards.push(card);
            return;
        }
        groups.set(key, { key, label, rank, cards: [card] });
    });
    return [...groups.values()]
        .sort(compareGroups)
        .map(({ key, label, cards: groupCardsList }) => ({
            key,
            label,
            cards: groupCardsList,
        }));
};
