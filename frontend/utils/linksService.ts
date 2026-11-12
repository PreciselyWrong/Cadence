import { Link, LinkStatus } from '../entities/Link';
import { handleAuthResponse, getPostHeadersWithCsrf } from './authUtils';
import { getApiPath } from '../config/paths';

export const fetchLinks = async (): Promise<Link[]> => {
    const response = await fetch(getApiPath('links?limit=1000'), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    await handleAuthResponse(response, 'Failed to fetch links.');
    const data = await response.json();
    return data.links;
};

export interface ImportResult {
    created: number;
    existing: number;
    invalid: number;
}

export const importLinks = async (
    items: { url: string; title: string; tags: string[] }[]
): Promise<ImportResult> => {
    const response = await fetch(getApiPath('links/import'), {
        method: 'POST',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
        body: JSON.stringify({ items }),
    });
    await handleAuthResponse(response, 'Failed to import the links.');
    return response.json();
};

export interface LinkChanges {
    title?: string | null;
    url?: string;
    project_uid?: string | null;
    note?: string | null;
    status?: LinkStatus;
    review_at?: string | null;
    tags?: string[];
}

export const updateLink = async (
    uid: string,
    changes: LinkChanges
): Promise<Link> => {
    const response = await fetch(getApiPath(`links/${uid}`), {
        method: 'PATCH',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
        body: JSON.stringify(changes),
    });
    await handleAuthResponse(response, 'Failed to update link.');
    const data = await response.json();
    return data.link;
};

export const deleteLink = async (uid: string): Promise<void> => {
    const response = await fetch(getApiPath(`links/${uid}`), {
        method: 'DELETE',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
    });
    await handleAuthResponse(response, 'Failed to delete link.');
};

export interface NewLink {
    url: string;
    title?: string;
    note?: string;
    tags?: string[];
    project_uid?: string;
    source_type: 'inbox_item' | 'task' | 'note';
    source_uid: string;
}

// Puts a page into the library, on purpose: the server keeps the inbox
// item, task or note as its source. The same page twice is one link
// (`created` false).
export const createLink = async (
    input: NewLink
): Promise<{ link: Link; created: boolean }> => {
    const response = await fetch(getApiPath('links'), {
        method: 'POST',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
        body: JSON.stringify(input),
    });
    await handleAuthResponse(response, 'Failed to add the link.');
    return response.json();
};

// A page written in a task or a note.
export const addLinkFrom = (
    url: string,
    source: { type: 'task' | 'note'; uid: string }
): Promise<{ link: Link; created: boolean }> =>
    createLink({ url, source_type: source.type, source_uid: source.uid });

// Where an address already is, before it is captured again: open tasks
// holding it and projects that hold it (docs/37-links.md, Capture).
export interface AddressPlaces {
    url: string;
    kind: string;
    task_name: string;
    tasks: { uid: string; name: string }[];
    projects: { uid: string; name: string }[];
}

export const lookupAddress = async (
    url: string,
    title?: string | null
): Promise<AddressPlaces> => {
    const query = new URLSearchParams({ url });
    if (title) query.set('title', title);
    const response = await fetch(getApiPath(`links/lookup?${query}`), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    await handleAuthResponse(response, 'Failed to look up the address.');
    return response.json();
};

// The pages of a project (docs/37-links.md, Project pages).
export const fetchProjectPages = async (
    projectUid: string
): Promise<Link[]> => {
    const response = await fetch(getApiPath(`projects/${projectUid}/pages`), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    await handleAuthResponse(response, 'Failed to fetch the pages.');
    return (await response.json()).pages;
};

export interface PageCheckResult {
    uid: string;
    url: string;
    state: 'ok' | 'dead' | 'unknown';
    code: number | null;
}

// « Vérifier les pages »: nothing is deleted.
export const checkProjectPages = async (
    projectUid: string
): Promise<PageCheckResult[]> => {
    const response = await fetch(
        getApiPath(`projects/${projectUid}/pages/check`),
        {
            method: 'POST',
            credentials: 'include',
            headers: await getPostHeadersWithCsrf(),
        }
    );
    await handleAuthResponse(response, 'Failed to check the pages.');
    return (await response.json()).results;
};
