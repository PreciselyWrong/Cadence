import { Task } from '../entities/Task';
import { Project } from '../entities/Project';

export const TODO_MD_SECTIONS = ['Now', 'Next', 'Ideas'] as const;

// A task mirrored from a TODO.md file keeps its name, its note, its project
// and its done box in the file. Its other fields are Cadence-side.
export const isTodoMdTask = (task?: Pick<Task, 'source_key'> | null): boolean =>
    !!task?.source_key;

// The fields the file keeps: changing one is refused (403 todo_md_read_only).
// The done box (status) is written to the file, so it is not in this list.
export const TODO_MD_LOCKED_FIELDS: readonly string[] = [
    'name',
    'note',
    'project_id',
    'project_uid',
];

export const touchesTodoMdLockedField = (fields: readonly string[]): boolean =>
    fields.some((field) => TODO_MD_LOCKED_FIELDS.includes(field));

export const isTodoMdReadOnlyError = (error: unknown): boolean =>
    (error as { code?: unknown } | null | undefined)?.code ===
    'todo_md_read_only';

export const isTodoMdProject = (
    project?: Pick<Project, 'source_type'> | null
): boolean => project?.source_type === 'todo_md';

// 'git:<slug>' for a project mirrored from a git repository.
export const todoMdRepoSlug = (sourcePath?: string | null): string | null =>
    sourcePath?.startsWith('git:') ? sourcePath.slice(4) : null;
