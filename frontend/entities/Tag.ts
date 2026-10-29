export interface Tag {
    id?: number;
    uid?: string;
    name: string;
    tag_type?: 'system' | 'user';
    pinned?: boolean;
    color?: string;
    // Nested tags: the uid of the parent tag, one level deep at most.
    parent_uid?: string | null;
    usage_count?: number;
    tasks_count?: number;
    notes_count?: number;
    projects_count?: number;
}
