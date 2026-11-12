import { toPriorityLevel } from '../Shared/PriorityBadge';
import type { PlanFilters } from './viewOptions';

// The part of a card the filters read: its task. Structural, so any card
// whose task carries these fields can be filtered.
export interface FilterableLine {
    task: {
        project_id?: number | null;
        project_uid?: string | null;
        project?: { id?: number | string; uid?: string } | null;
        tags?: { name: string }[] | null;
        priority?: unknown;
    };
}

export const countActiveFilters = (filters: PlanFilters): number =>
    filters.projectIds.length +
    filters.tagNames.length +
    filters.priorities.length;

const projectKeysOf = (task: FilterableLine['task']): string[] =>
    [task.project_id, task.project_uid, task.project?.id, task.project?.uid]
        .filter(
            (key): key is number | string => key !== null && key !== undefined
        )
        .map(String);

const matchesProject = (
    task: FilterableLine['task'],
    projectIds: string[]
): boolean => projectKeysOf(task).some((key) => projectIds.includes(key));

const matchesTag = (
    task: FilterableLine['task'],
    tagNames: string[]
): boolean => (task.tags ?? []).some((tag) => tagNames.includes(tag.name));

const matchesPriority = (
    task: FilterableLine['task'],
    priorities: string[]
): boolean => {
    const level = toPriorityLevel(
        task.priority as Parameters<typeof toPriorityLevel>[0]
    );
    return level !== null && priorities.includes(level);
};

/**
 * The lines that pass every non-empty facet. Inside a facet a line needs one
 * of the chosen values (a task has one project, but several tags).
 */
export const applyFilters = <T extends FilterableLine>(
    lines: T[],
    filters: PlanFilters
): T[] => {
    if (countActiveFilters(filters) === 0) return lines;
    return lines.filter(({ task }) => {
        if (
            filters.projectIds.length > 0 &&
            !matchesProject(task, filters.projectIds)
        ) {
            return false;
        }
        if (
            filters.tagNames.length > 0 &&
            !matchesTag(task, filters.tagNames)
        ) {
            return false;
        }
        if (
            filters.priorities.length > 0 &&
            !matchesPriority(task, filters.priorities)
        ) {
            return false;
        }
        return true;
    });
};
