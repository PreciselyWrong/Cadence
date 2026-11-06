import { getApiPath } from '../config/paths';
import { getPostHeadersWithCsrf, handleAuthResponse } from './authUtils';

export interface TodoMdRescanResult {
    projects: number;
    created: number;
    updated: number;
    removed: number;
    errors: { folder: string; code: string }[];
}

// Reads every TODO.md folder again now; the server also does it by itself
// when a file changes.
export const rescanTodoMd = async (): Promise<TodoMdRescanResult> => {
    const response = await fetch(getApiPath('todo-md/rescan'), {
        method: 'POST',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
    });
    await handleAuthResponse(response, 'Failed to reread the TODO.md files.');
    return response.json();
};

export interface TodoMdFile {
    folder: string;
    path: string;
    project_uid: string | null;
    project_name: string | null;
}

export const fetchTodoMdFiles = async (): Promise<TodoMdFile[]> => {
    const response = await fetch(getApiPath('todo-md/files'), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    await handleAuthResponse(response, 'Failed to list the TODO.md files.');
    return (await response.json()).files;
};

const projectFileAction = async (
    projectUid: string,
    action: 'link' | 'unlink',
    body?: { folder: string }
): Promise<void> => {
    const response = await fetch(
        getApiPath(
            `todo-md/projects/${encodeURIComponent(projectUid)}/${action}`
        ),
        {
            method: 'POST',
            credentials: 'include',
            headers: await getPostHeadersWithCsrf(),
            ...(body ? { body: JSON.stringify(body) } : {}),
        }
    );
    await handleAuthResponse(response, 'Failed to change the TODO.md file.');
};

export const linkTodoMdFile = (projectUid: string, folder: string) =>
    projectFileAction(projectUid, 'link', { folder });

export const unlinkTodoMdFile = (projectUid: string) =>
    projectFileAction(projectUid, 'unlink');

export interface TodoMdPendingEdit {
    id: string;
    op: 'add' | 'done';
    name: string;
    done?: boolean;
    reason: 'conflict' | 'unreachable';
    error: string | null;
    at: string;
}

export interface TodoMdRepoStatus {
    slug: string;
    repo: string;
    branch: string;
    path: string;
    project_uid: string | null;
    webhook: boolean;
    head_sha: string | null;
    synced_at: string | null;
    last_error: string | null;
    pending: TodoMdPendingEdit[];
}

export interface TodoMdStatus {
    enabled: boolean;
    repos: TodoMdRepoStatus[];
}

export const fetchTodoMdStatus = async (): Promise<TodoMdStatus> => {
    const response = await fetch(getApiPath('todo-md/status'), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    await handleAuthResponse(response, 'Failed to load the TODO.md status.');
    return response.json();
};

// Pending edits of a git-backed project: push them again, or forget them.
const repoAction = async (
    slug: string,
    action: 'retry' | 'discard'
): Promise<TodoMdRepoStatus> => {
    const response = await fetch(
        getApiPath(`todo-md/repos/${encodeURIComponent(slug)}/${action}`),
        {
            method: 'POST',
            credentials: 'include',
            headers: await getPostHeadersWithCsrf(),
        }
    );
    await handleAuthResponse(response, 'Failed to update the repository.');
    return response.json();
};

export const retryTodoMdRepo = (slug: string) => repoAction(slug, 'retry');
export const discardTodoMdRepo = (slug: string) => repoAction(slug, 'discard');
