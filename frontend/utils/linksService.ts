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

export interface LinkChanges {
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
