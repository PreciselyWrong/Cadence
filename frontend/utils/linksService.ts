import { Link } from '../entities/Link';
import { handleAuthResponse, getPostHeadersWithCsrf } from './authUtils';
import { getApiPath } from '../config/paths';

export interface LinkChanges {
    title?: string | null;
    url?: string;
    project_uid?: string | null;
    note?: string | null;
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
    project_uid: string;
}

// Keeps a page in a project's pages. The same page twice is one link
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

// The server's copy of a site's icon, for the origin badge of a task; the
// browser never asks the site itself.
export const faviconUrl = (pageUrl: string): string | null => {
    try {
        const { hostname } = new URL(pageUrl);
        return hostname
            ? getApiPath(
                  `links/favicon?host=${encodeURIComponent(hostname.toLowerCase())}`
              )
            : null;
    } catch {
        return null;
    }
};
