export type LinkKind = 'repo' | 'article' | 'video' | 'tool' | 'other';
export type LinkStatus =
    | 'new'
    | 'to_evaluate'
    | 'kept'
    | 'tested'
    | 'parked'
    | 'dropped';
export type LinkSourceType = 'inbox_item' | 'task' | 'note';

// A link found by the server in an inbox item, a task or a note
// (docs/37-links.md). The metadata is the server's; the note, status and
// tags are the user's.
export interface Link {
    uid: string;
    url: string;
    domain: string | null;
    title: string | null;
    description: string | null;
    image_url: string | null;
    site_name: string | null;
    kind: LinkKind;
    github_stars: number | null;
    github_language: string | null;
    github_last_commit: string | null;
    readme_excerpt: string | null;
    note: string | null;
    status: LinkStatus;
    // Local day to look at a parked link again (YYYY-MM-DD); never a due date.
    review_at: string | null;
    tags: { uid: string; name: string; color: string | null }[];
    source_type: LinkSourceType | null;
    source_uid: string | null;
    fetch_status: 'pending' | 'done' | 'failed';
    fetched_at: string | null;
    created_at: string;
    updated_at: string;
}
