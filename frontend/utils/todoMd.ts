import { Task } from '../entities/Task';
import { Project } from '../entities/Project';

export const TODO_MD_SECTIONS = ['Now', 'Next', 'Ideas'] as const;

// Rows mirrored from a TODO.md file are read-only here, except for checking
// them off: the file is the source of truth.
export const isTodoMdTask = (task?: Pick<Task, 'source_key'> | null): boolean =>
    !!task?.source_key;

export const isTodoMdProject = (
    project?: Pick<Project, 'source_type'> | null
): boolean => project?.source_type === 'todo_md';
