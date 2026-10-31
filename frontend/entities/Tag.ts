export interface Tag {
    id?: number;
    uid?: string;
    name: string;
    tag_type?: 'system' | 'user';
    pinned?: boolean;
    color?: string;
    // Nested tags: the name is the namespace path (`perso/sport`) and the API
    // keeps parent_uid in step with it.
    parent_uid?: string | null;
    usage_count?: number;
    tasks_count?: number;
    notes_count?: number;
    projects_count?: number;
}
