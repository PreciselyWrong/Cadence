export type LinkKind = 'repo' | 'article' | 'video' | 'tool' | 'other';

// A link kept on purpose: in a task's note or in a project's pages
// (docs/37-links.md). The metadata is the server's; the title, address,
// note and project are the user's.
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
    project_uid: string | null;
    project_name: string | null;
    fetch_status: 'pending' | 'done' | 'failed';
    fetched_at: string | null;
    created_at: string;
    updated_at: string;
}
