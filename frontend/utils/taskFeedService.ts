import {
    handleAuthResponse,
    getDefaultHeaders,
    getPostHeadersWithCsrf,
} from './authUtils';
import { getApiPath } from '../config/paths';

export interface TaskFeedStatus {
    enabled: boolean;
    // Only returned when a new address is made; it cannot be shown again.
    path?: string;
}

const call = async (method: 'GET' | 'POST' | 'DELETE') => {
    const response = await fetch(getApiPath('profile/task-feed'), {
        method,
        credentials: 'include',
        headers:
            method === 'GET'
                ? getDefaultHeaders()
                : await getPostHeadersWithCsrf(),
    });
    await handleAuthResponse(response, 'Could not update the task feed.');
    return (await response.json()) as TaskFeedStatus;
};

export const fetchTaskFeed = () => call('GET');
export const createTaskFeed = () => call('POST');
export const disableTaskFeed = () => call('DELETE');

// The full https address of a feed path, as calendar apps need it.
export const taskFeedUrl = (path: string) =>
    `${window.location.origin}${getApiPath(path)}`;
