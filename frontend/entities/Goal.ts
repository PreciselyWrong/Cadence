import { Area } from './Area';
import { Task } from './Task';
import { Project } from './Project';

export type GoalHorizon = 'month' | 'quarter' | 'season' | 'year';
// Bucket list groups: have, be, do.
export type GoalBucket = 'have' | 'be' | 'do';

// The share of linked projects and tasks that are done. percent is null
// when nothing is linked yet.
export interface GoalProgress {
    done: number;
    total: number;
    percent: number | null;
}
export interface GoalNextTask {
    uid: string;
    name: string;
    due_date: string | null;
}
export type GoalStatus = 'active' | 'achieved' | 'paused' | 'dropped';

export interface Goal {
    id?: number;
    uid?: string;
    area_id?: number | null;
    user_id?: number;
    title: string;
    why?: string | null;
    horizon: GoalHorizon;
    target_date?: string | null;
    status: GoalStatus;
    sort_position?: number | null;
    color?: string;
    // On the bucket list (no date, kept out of daily lists), or null.
    bucket?: GoalBucket | null;
    // A key result belongs to an objective: its goal uid (never deeper).
    parent_goal_uid?: string | null;
    parent_goal?: { uid: string; title: string } | null;
    // Goal page only: this objective's key results.
    KeyResults?: Goal[];
    key_results_count?: number;
    progress?: GoalProgress;
    // The open task to do next for this goal (an objective's includes its
    // key results' tasks): nearest due date, then oldest. Goals list only.
    next_task?: GoalNextTask | null;
    created_at?: string;
    updated_at?: string;
    Area?: Area | null;
    Tasks?: Task[];
    Projects?: Project[];
}
