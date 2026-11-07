export type LinkKind = 'repo' | 'article' | 'video' | 'tool' | 'other';
// 'new' is to see, 'dropped' is archived (kept, hidden by default). "Later"
// is not a status: it is the optional review day.
export type LinkStatus = 'new' | 'dropped';
export type LinkSourceType = 'inbox_item' | 'task' | 'note';

// A link the user kept from the inbox, a task or a note (docs/37-links.md). The metadata is the server's; the title, address,
// note, status, project and tags are the user's.
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
    project_uid: string | null;
    project_name: string | null;
    // Local day to look at the link again (YYYY-MM-DD); never a due date.
    review_at: string | null;
    tags: { uid: string; name: string; color: string | null }[];
    source_type: LinkSourceType | null;
    source_uid: string | null;
    fetch_status: 'pending' | 'done' | 'failed';
    fetched_at: string | null;
    created_at: string;
    updated_at: string;
}
