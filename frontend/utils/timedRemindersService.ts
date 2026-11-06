import { handleAuthResponse, getPostHeadersWithCsrf } from './authUtils';
import { getApiPath } from '../config/paths';

export interface TimedReminders {
    enabled: boolean;
    lead_minutes: number;
}

export const TIMED_LEAD_MINUTES = [0, 5, 10, 15, 30];

const PATH = 'notifications/timed-tasks';

export const fetchTimedReminders = async (): Promise<TimedReminders> => {
    const response = await fetch(getApiPath(PATH), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    await handleAuthResponse(response, 'Failed to load the setting.');
    return response.json();
};

export const saveTimedReminders = async (
    settings: TimedReminders
): Promise<TimedReminders> => {
    const response = await fetch(getApiPath(PATH), {
        method: 'PUT',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
        body: JSON.stringify(settings),
    });
    await handleAuthResponse(response, 'Failed to save the setting.');
    return response.json();
};
