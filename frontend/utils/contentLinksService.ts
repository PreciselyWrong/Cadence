import { getApiPath } from '../config/paths';
import { handleAuthResponse, getPostHeadersWithCsrf } from './authUtils';

export type BacklinkTargetType = 'note' | 'task' | 'person';

export interface Backlink {
    type: 'note' | 'task';
    uid: string;
    title: string;
    snippet: string;
    updated_at: string;
}

const BACKLINK_PATHS: Record<BacklinkTargetType, string> = {
    note: 'note',
    task: 'task',
    person: 'people',
};

// The notes and tasks that link to a note, a task or a person.
export const fetchBacklinks = async (
    type: BacklinkTargetType,
    uid: string
): Promise<Backlink[]> => {
    const response = await fetch(
        getApiPath(`${BACKLINK_PATHS[type]}/${uid}/backlinks`),
        {
            credentials: 'include',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
        }
    );
    await handleAuthResponse(response, 'Failed to fetch backlinks.');
    return response.json();
};

// The task each [[task:Name]] opens, keyed by lowercased name.
export const resolveTaskLinks = async (
    names: string[]
): Promise<Record<string, string>> => {
    const response = await fetch(getApiPath('content-links/resolve'), {
        method: 'POST',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
        body: JSON.stringify({ tasks: names }),
    });
    await handleAuthResponse(response, 'Failed to resolve task links.');
    const body = await response.json();
    return body.tasks ?? {};
};
