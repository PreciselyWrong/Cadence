import { Area } from './Area';
import { Goal } from './Goal';
import { Tag } from './Tag';
import { PriorityType, Task } from './Task';
import { Note } from './Note';

export type ProjectStatus =
    | 'not_started'
    | 'planned'
    | 'in_progress'
    | 'waiting'
    | 'done'
    | 'cancelled';

export interface ProjectTaskStatus {
    total: number;
    done: number;
    in_progress: number;
    not_started: number;
}

export interface Project {
    id?: number;
    uid?: string;
    name: string;
    description?: string;
    pin_to_sidebar?: boolean;
    // 'todo_md' for a project mirrored from a TODO.md file, with its path
    // under the server's TODO root.
    source_type?: string | null;
    source_path?: string | null;
    area?: Area;
    area_id?: number | null;
    area_uid?: string | null;
    goal_id?: number | null;
    goal?: Goal | null;
    Goal?: Goal | null;
    is_maintenance?: boolean;
    // A sub-project's parent; its area follows the parent's.
    parent_project_uid?: string | null;
    // Direct sub-projects the viewer can see (project page only).
    SubProjects?: { uid: string; name: string; status: ProjectStatus }[];
    tags?: Tag[];
    priority?: PriorityType;
    tasks?: Task[];
    Tasks?: Task[]; // Sequelize association naming (capitalized)
    notes?: Note[];
    Notes?: Note[]; // Sequelize association naming (capitalized)
    due_date_at?: string | null;
    start_date?: string | null;
    start_time?: string | null;
    // "blocks" links between this project's tasks, for the timeline
    task_links?: { from_uid: string; to_uid: string }[];
    image_url?: string;
    color?: string;
    // Id from the icon set shared with Android (constants/entityIcons.ts).
    icon?: string | null;
    task_show_completed?: boolean;
    task_sort_order?: string;
    status?: ProjectStatus;
    completed_at?: string | null;
    created_at?: string;
    updated_at?: string;
    share_count?: number;
    is_shared?: boolean;
    // The viewer's access to the project (project page only).
    access_level?: 'none' | 'ro' | 'rw' | 'admin';
    task_status?: ProjectTaskStatus;
    completion_percentage?: number;
    is_stalled?: boolean;
    sort_position?: number | null;
}
