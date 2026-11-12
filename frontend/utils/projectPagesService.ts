import { handleAuthResponse, getPostHeadersWithCsrf } from './authUtils';
import { getApiPath } from '../config/paths';

export interface PagesAdded {
    created: number;
    existing: number;
    invalid: number;
}

// Several pages at once (a bookmarks folder), at most 100 per call
// (docs/37-links.md, Project pages).
export const addProjectPages = async (
    projectUid: string,
    pages: { url: string; title?: string }[]
): Promise<PagesAdded> => {
    const response = await fetch(getApiPath(`projects/${projectUid}/pages`), {
        method: 'POST',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
        body: JSON.stringify({ pages }),
    });
    await handleAuthResponse(response, 'Failed to add the pages.');
    return response.json();
};
