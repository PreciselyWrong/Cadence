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
    | 'cancelled'
    | 'paused'
    | 'archived';

export interface ProjectTaskStatus {
    total: number;
    done: number;
    in_progress: number;
    not_started: number;
}

export interface ProjectHandoffState {
    section?: string | null;
    branch?: string | null;
    tests?: string | null;
    blockers?: string | null;
    next_action?: string | null;
    raw?: string | null;
    updated_at?: string | null;
}

export interface ProjectSubProjectSummary {
    uid: string;
    name: string;
    status: ProjectStatus;
    icon?: string | null;
    color?: string | null;
    handoff_state?: ProjectHandoffState | null;
    open_tasks_count?: number;
}

export interface BoardTreeSubProject extends ProjectSubProjectSummary {
    id?: number;
    description?: string | null;
    priority?: PriorityType;
    due_date_at?: string | null;
    source_type?: string | null;
    source_path?: string | null;
    handoff_state?: ProjectHandoffState | null;
    parent_project_uid?: string | null;
    area?: Area | null;
    tags?: Tag[];
    next_task_uid?: string | null;
    next_task?: { uid: string; name: string } | null;
    done_tasks_count: number;
    total_tasks_count: number;
    completion_percentage: number;
    updated_at?: string;
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
    handoff_state?: ProjectHandoffState | null;
    area?: Area;
    area_id?: number | null;
    area_uid?: string | null;
    goal_id?: number | null;
    goal?: Goal | null;
    Goal?: Goal | null;
    is_maintenance?: boolean;
    // The task the user designated as the next action (uid), and its title
    // while it is still open.
    next_task_uid?: string | null;
    next_task?: { uid: string; name: string } | null;
    // A sub-project's parent; its area follows the parent's.
    parent_project_uid?: string | null;
    // Direct sub-projects the viewer can see (project page only).
    SubProjects?: ProjectSubProjectSummary[];
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
    task_links?: { uid?: string; from_uid: string; to_uid: string }[];
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
    // the viewer owns the project or is an admin, so may manage its shares
    can_share?: boolean;
    // shared with the viewer on its own, so they may leave it
    can_leave?: boolean;
    task_status?: ProjectTaskStatus;
    completion_percentage?: number;
    is_stalled?: boolean;
    sort_position?: number | null;
}
